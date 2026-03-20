import { NextResponse } from 'next/server';
import {
  getProject,
  getClassifications,
  getPolygons,
  createClassification,
  createPolygon,
  deletePolygonsByPage,
} from '@/server/project-store';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { fireWebhook } from '@/lib/webhooks';
import { emitPluginEvent } from '@/lib/plugin-system';
import { z } from 'zod';
import type { AIDetectedElement } from '@/server/ai-engine';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';

const PointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const ElementSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['area', 'linear', 'count']),
  points: z.array(PointSchema).min(1),
  color: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * Synonym groups used to canonicalise AI-returned classification names.
 * Any name whose normalised primary word falls in the same group is treated
 * as the same classification during lookup, so "Space" finds an existing
 * "Room" and vice-versa rather than creating a duplicate entry.
 */
const APPLY_SYNONYM_GROUPS: string[][] = [
  ['room', 'space', 'area'],
];

/**
 * Normalise a classification name to its canonical lookup key.
 * Steps:
 *   1. Lower-case, collapse slashes/dashes to spaces, collapse whitespace.
 *   2. Extract words; for each word try exact synonym match then de-pluralised match.
 *   3. If ANY word maps to a known synonym group, replace the ENTIRE normalised name
 *      with the first (canonical) word in that group so all synonyms share one key.
 *
 * Examples:
 *   "Room"      → "room"
 *   "Rooms"     → "room"
 *   "Space"     → "room"   (same group)
 *   "Spaces"    → "room"
 *   "Room/Space"→ "room"
 *   "Bathroom"  → "bathroom"  (no synonym match → unchanged)
 */
function canonicalName(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[\/\-]+/g, ' ').replace(/\s+/g, ' ');
  const words = normalized.split(' ').filter((w) => w.length > 0);
  for (const w of words) {
    // Exact group match
    for (const group of APPLY_SYNONYM_GROUPS) {
      if (group.includes(w)) return group[0];
    }
    // De-pluralised match (e.g. "rooms" → "room")
    if (w.endsWith('s')) {
      const singular = w.slice(0, -1);
      for (const group of APPLY_SYNONYM_GROUPS) {
        if (group.includes(singular)) return group[0];
      }
    }
  }
  return normalized;
}

/**
 * Shoelace formula for polygon area in pixels.
 */
function shoelaceArea(points: Array<{ x: number; y: number }>): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Euclidean distance between two points.
 */
function euclidean(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Check if two point arrays overlap >= 80% (loose dedup).
 */
function hasSignificantOverlap(
  a: Array<{ x: number; y: number }>,
  b: Array<{ x: number; y: number }>,
  threshold = 0.8,
): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const tolerance = 5; // pixels
  let matches = 0;
  for (const pa of a) {
    for (const pb of b) {
      if (Math.abs(pa.x - pb.x) < tolerance && Math.abs(pa.y - pb.y) < tolerance) {
        matches++;
        break;
      }
    }
  }
  return matches / a.length >= threshold;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const body = await req.json();
    const elements: AIDetectedElement[] = body?.elements;
    const page: number = body?.page ?? 1;

    if (!Array.isArray(elements)) {
      return NextResponse.json({ error: 'elements[] is required' }, { status: 400 });
    }

    // Validate each element against schema, skipping malformed ones
    const validElements: AIDetectedElement[] = [];
    for (const el of elements) {
      const result = ElementSchema.safeParse(el);
      if (result.success) {
        validElements.push(el as AIDetectedElement);
      } else {
        console.warn('[ai-apply] skipping malformed element:', result.error.issues);
      }
    }

    if (validElements.length === 0) {
      return NextResponse.json({ error: 'No valid elements provided' }, { status: 400 });
    }

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    let classifications = await getClassifications(id);

    // BUG-A5-5-008: moved deletePolygonsByPage AFTER validElements check
    // to avoid deleting existing polygons when no valid replacements exist.
    await deletePolygonsByPage(id, page);

    const existingPolygons = await getPolygons(id);

    let createdClassifications = 0;
    let createdPolygons = 0;
    let skipped = 0;

    for (const element of validElements) {
      // Find or create classification.
      // Use canonical synonym lookup so "Space" and "Room" resolve to the same entry.
      const elementCanonical = canonicalName(element.name);
      let classification = classifications.find(
        (c) => canonicalName(c.name) === elementCanonical,
      );

      if (!classification) {
        classification = await createClassification(id, {
          name: element.name,
          type: element.type,
          color: element.color,
          visible: true,
        });
        broadcastToProject(id, 'classification:created', classification);
        classifications = await getClassifications(id); // refresh
        createdClassifications++;
      }

      // Check for duplicate polygon
      const sameClassPage = existingPolygons.filter(
        (p) => p.classificationId === classification!.id && p.pageNumber === page,
      );
      const isDuplicate = sameClassPage.some((p) =>
        hasSignificantOverlap(element.points, p.points),
      );

      if (isDuplicate) {
        skipped++;
        continue;
      }

      // Compute area/linear values
      let areaPixels = 0;
      let linearPixels = 0;

      if (element.type === 'area' && element.points.length >= 3) {
        areaPixels = shoelaceArea(element.points);
      } else if (element.type === 'linear' && element.points.length >= 2) {
        // Sum all segment distances for the full polyline length
        for (let i = 1; i < element.points.length; i++) {
          linearPixels += euclidean(element.points[i - 1], element.points[i]);
        }
      }

      const newPolygon = await createPolygon(id, {
        points: element.points,
        classificationId: classification.id,
        pageNumber: page,
        area: areaPixels,
        linearFeet: linearPixels,
        isComplete: true,
        label: element.name,
      });
      broadcastToProject(id, 'polygon:created', newPolygon);

      existingPolygons.push(newPolygon); // track for dedup within batch
      createdPolygons++;
    }

    fireWebhook(id, 'takeoff.completed', {
      polygonCount: createdPolygons,
      classificationCount: createdClassifications,
      skipped,
    });
    await emitPluginEvent('onTakeoffCompleted', validElements, id);

    return NextResponse.json({
      created: { classifications: createdClassifications, polygons: createdPolygons },
      skipped,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Apply failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
