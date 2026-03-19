import { NextResponse } from 'next/server';
import {
  getProject,
  getClassifications,
  getPolygons,
  createClassification,
  createPolygon,
} from '@/server/project-store';
import { broadcastToProject } from '@/app/api/ws/route';
import { fireWebhook } from '@/lib/webhooks';
import type { AIDetectedElement } from '@/server/ai-engine';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';

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

    if (!Array.isArray(elements) || elements.length === 0) {
      return NextResponse.json({ error: 'elements[] is required' }, { status: 400 });
    }

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    let classifications = await getClassifications(id);
    const existingPolygons = await getPolygons(id);

    let createdClassifications = 0;
    let createdPolygons = 0;
    let skipped = 0;

    for (const element of elements) {
      // Find or create classification (case-insensitive match)
      let classification = classifications.find(
        (c) => c.name.toLowerCase() === element.name.toLowerCase(),
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
        linearPixels = euclidean(element.points[0], element.points[1]);
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

    return NextResponse.json({
      created: { classifications: createdClassifications, polygons: createdPolygons },
      skipped,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Apply failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
