import { NextResponse } from 'next/server';
import { rateLimitResponse } from '@/lib/rate-limit';
import { AiTakeoffBodySchema } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { deletePolygonsByPage } from '@/server/project-store';
import { checkOpenAIKey, getOpenAIKey } from '@/lib/openai-guard';
import { fireWebhook } from '@/lib/webhooks';
import { loadPDF } from '@/server/pdf-storage';
import { renderPageAsImage } from '@/server/pdf-processor';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

interface RawElement {
  name?: string;
  type?: 'area' | 'linear' | 'count';
  classification?: string;
  quantity?: number;
  points?: Array<{ x: number; y: number }>;
  color?: string;
  confidence?: number;
}

interface DetectedElement {
  name: string;
  type: 'area' | 'linear' | 'count';
  classification: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  confidence: number;
}

/**
 * Generate a deterministic hex color from a string.
 */
function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const r = (hash >> 0) & 0xff;
  const g = (hash >> 8) & 0xff;
  const b = (hash >> 16) & 0xff;
  const clamp = (v: number) => Math.max(40, Math.min(220, v));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function clampPoint(point: { x: number; y: number }, pageWidth: number, pageHeight: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(pageWidth, point.x)),
    y: Math.max(0, Math.min(pageHeight, point.y)),
  };
}

function normalizePoint(
  point: { x: number; y: number },
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number } {
  const x = Number(point.x);
  const y = Number(point.y);
  const finiteX = Number.isFinite(x) ? x : 0;
  const finiteY = Number.isFinite(y) ? y : 0;
  const isNormalized = finiteX >= 0 && finiteX <= 1 && finiteY >= 0 && finiteY <= 1;
  if (isNormalized) {
    return clampPoint({ x: finiteX * pageWidth, y: finiteY * pageHeight }, pageWidth, pageHeight);
  }
  return clampPoint({ x: finiteX, y: finiteY }, pageWidth, pageHeight);
}

function toCountMarker(point: { x: number; y: number }, radius = 8): Array<{ x: number; y: number }> {
  return [
    { x: point.x, y: point.y - radius },
    { x: point.x + radius, y: point.y },
    { x: point.x, y: point.y + radius },
    { x: point.x - radius, y: point.y },
  ];
}

/**
 * Synonym groups: any two names that share a group are considered equivalent.
 * Each inner array is a cluster of interchangeable terms (lower-case).
 */
const SYNONYM_GROUPS: string[][] = [
  ['room', 'space', 'area'],
  ['wall', 'partition'],
  ['door', 'entry', 'entrance'],
  ['window', 'glazing', 'opening'],
  ['floor', 'slab', 'deck'],
  ['ceiling', 'soffit'],
  ['stair', 'stairs', 'stairway', 'staircase', 'steps'],
  ['column', 'pillar', 'post', 'col'],
  ['beam', 'girder', 'joist'],
  ['bathroom', 'restroom', 'wc', 'toilet room', 'lavatory'],
  ['kitchen', 'kitchenette'],
  ['corridor', 'hallway', 'hall', 'passage', 'passageway'],
  ['parking', 'parking space', 'parking stall'],
];

/** Return the synonym-group index for a word, or -1 if not in any group. */
function synonymGroupOf(word: string): number {
  for (let i = 0; i < SYNONYM_GROUPS.length; i++) {
    if (SYNONYM_GROUPS[i].includes(word)) return i;
  }
  return -1;
}

/**
 * Fuzzy-match an AI-detected classification name against existing ones.
 * Returns the existing classification ID if a reasonable match is found, else null.
 * Rules (same type required):
 *   1. Exact match (case-insensitive)
 *   2. Substring match — either direction
 *   3. Significant word overlap
 *   4. Synonym match — any key word in the needle maps to the same synonym group as a key word in the existing name
 */
function fuzzyMatchClassification(
  name: string,
  type: string,
  existingClassifications: Array<{ id: string; name: string; type: string }>,
): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  // Build candidates of same type
  const candidates = existingClassifications.filter(
    (c) => c.type.toLowerCase() === type.toLowerCase(),
  );

  // 1. Exact match (case-insensitive)
  for (const c of candidates) {
    if (c.name.trim().toLowerCase() === needle) return c.id;
  }

  // 2. Substring match — either direction (e.g. "Room" matches "Room/Space", "Living Room" matches "Room")
  for (const c of candidates) {
    const existing = c.name.trim().toLowerCase();
    if (existing.includes(needle) || needle.includes(existing)) return c.id;
  }

  const splitWords = (s: string) =>
    s.split(/[\s\/\-]+/).filter((w) => w.length > 2);
  const needleWords = splitWords(needle);

  // 3. Significant word overlap
  if (needleWords.length > 0) {
    for (const c of candidates) {
      const existingWords = splitWords(c.name.trim().toLowerCase());
      const overlap = needleWords.filter((w) => existingWords.includes(w));
      if (overlap.length > 0 && overlap.length >= Math.min(needleWords.length, existingWords.length)) {
        return c.id;
      }
    }
  }

  // 4. Synonym match — any key word in needle shares a synonym group with any key word in existing name
  if (needleWords.length > 0) {
    for (const c of candidates) {
      const existingWords = splitWords(c.name.trim().toLowerCase());
      const hasSynonymOverlap = needleWords.some((nw) => {
        const ng = synonymGroupOf(nw);
        if (ng === -1) return false;
        return existingWords.some((ew) => synonymGroupOf(ew) === ng);
      });
      if (hasSynonymOverlap) return c.id;
    }
  }

  return null;
}

function extractOpenAIText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

function parseDetectedElements(raw: string, pageWidth: number, pageHeight: number): DetectedElement[] {
  const jsonStart = raw.indexOf('[');
  const jsonEnd = raw.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error('No JSON array in OpenAI response');
  }

  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  if (!Array.isArray(parsed)) {
    throw new Error('Parsed response is not an array');
  }

  const mapped = (parsed as RawElement[])
    .filter((el) => Array.isArray(el?.points) && (el?.type === 'area' || el?.type === 'linear' || el?.type === 'count'))
    .map((el) => {
      const name = String(el.name || el.classification || 'Unknown').trim() || 'Unknown';
      const type = el.type as 'area' | 'linear' | 'count';
      const quantity = type === 'count' ? Math.max(1, Number(el.quantity) || 1) : 1;
      const points = (el.points as Array<{ x: number; y: number }>).map((p) =>
        normalizePoint(p, pageWidth, pageHeight),
      );
      const color = typeof el.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(el.color)
        ? el.color
        : nameToColor(name);
      const confidence = typeof el.confidence === 'number' ? el.confidence : 0.85;
      if (type === 'area' && points.length >= 2) {
        const xs = points.map((p) => p.x / pageWidth);
        const ys = points.map((p) => p.y / pageHeight);
        const bboxW = Math.max(...xs) - Math.min(...xs);
        const bboxH = Math.max(...ys) - Math.min(...ys);
        if (bboxW < 0.05 && bboxH < 0.05) {
          console.warn(`[AI Takeoff] TINY polygon for "${name}" (area): bounding box may be too small. Points:`, points);
        }
      }

      return {
        name,
        type,
        classification: String(el.classification || el.name || name).trim() || name,
        quantity,
        points,
        color,
        confidence,
      };
    });

  const expanded: DetectedElement[] = [];
  for (const el of mapped) {
    if (el.type === 'count') {
      if (el.points.length === 1 && el.quantity > 1) {
        for (let i = 0; i < el.quantity; i++) {
          expanded.push({ name: el.name, type: el.type, classification: el.classification, points: [el.points[0]], color: el.color, confidence: el.confidence });
        }
        continue;
      }
      if (el.points.length > 1) {
        for (const point of el.points) {
          expanded.push({ name: el.name, type: el.type, classification: el.classification, points: [point], color: el.color, confidence: el.confidence });
        }
        continue;
      }
    }

    expanded.push({
      name: el.name,
      type: el.type,
      classification: el.classification,
      points: el.points,
      color: el.color,
      confidence: el.confidence,
    });
  }

  // Filter out any elements with empty points arrays — the client schema requires points.length >= 1.
  return expanded.filter((el) => el.points.length > 0);
}

function toPersistablePoints(el: DetectedElement): Array<{ x: number; y: number }> | null {
  if (el.type === 'count') {
    if (el.points.length === 0) return null;
    return toCountMarker(el.points[0]);
  }
  if (el.type === 'linear') {
    if (el.points.length < 2) return null;
    if (el.points.length === 2) {
      // Polygon API requires at least 3 points; duplicate endpoint to keep shape degenerate as a line.
      return [el.points[0], el.points[1], el.points[1]];
    }
    return el.points;
  }
  if (el.points.length < 3) return null;
  return el.points;
}

export async function POST(req: Request) {
  // Rate limit: 10 req/min per IP
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    const body = await req.json();
    const validated = validateBody(AiTakeoffBodySchema, body);
    if ('error' in validated) return validated.error;
    let { imageBase64, pageWidth, pageHeight, projectId, pageNumber, model } = validated.data;

    // E10: server-side rendering path verified
    //
    // Full trace (no imageBase64 supplied):
    //   1. loadPDF(projectId)        → Buffer | null   (local file or Supabase download)
    //   2. fs.writeFile(tmpPdfPath)  → writes Buffer to a temp file
    //   3. renderPageAsImage(...)    → `data:image/png;base64,<b64>` | null
    //      • Returns a data URL, which is directly compatible with the OpenAI/OpenRouter
    //        vision API `image_url.url` field used below.
    //   4. imageBase64 = rendered    → variable re-used; guard at line ~340 catches null path
    //   5. finally: fs.rm(tmpDir)    → temp directory cleaned up even on error (catch silenced
    //      so cleanup failures do not mask the real error)
    //
    // AiTakeoffBodySchema: imageBase64 is z.string().min(1).optional() — confirmed optional.
    // Schema refine ensures either imageBase64 OR (projectId + pageNumber) is present.

    // Server-side PDF rendering fallback: if imageBase64 is not provided but
    // projectId and pageNumber are, fetch the PDF and render the requested page.
    if (!imageBase64 && projectId && pageNumber) {
      console.log(`[ai-takeoff] Server-side PDF rendering: project=${projectId} page=${pageNumber}`);
      const pdfBuffer = await loadPDF(projectId);
      if (!pdfBuffer) {
        return NextResponse.json(
          { error: 'PDF not found for project — upload a PDF first' },
          { status: 404 },
        );
      }

      // Write PDF to a temp file so renderPageAsImage can read it.
      // renderPageAsImage expects a file path (not a Buffer) because it uses
      // pdfjs-dist which reads from disk.  The temp dir is always cleaned up in
      // the finally block regardless of success or failure.
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-takeoff-'));
      const tmpPdfPath = path.join(tmpDir, `${projectId}.pdf`);
      try {
        await fs.writeFile(tmpPdfPath, pdfBuffer);
        const rendered = await renderPageAsImage(tmpPdfPath, pageNumber, 2.0);
        if (!rendered) {
          return NextResponse.json(
            { error: 'Failed to render PDF page — ensure the PDF is valid and not password-protected' },
            { status: 422 },
          );
        }
        // rendered is a data URL: `data:image/png;base64,...`
        // This is directly usable as image_url.url in the OpenAI vision payload.
        imageBase64 = rendered;

        // Derive page dimensions from the PDF viewport if not provided by the caller
        if (!pageWidth || !pageHeight) {
          try {
            const { processPDF } = await import('@/server/pdf-processor');
            const info = await processPDF(tmpPdfPath, projectId);
            const pageInfo = info.pages.find((p) => p.pageNum === pageNumber);
            if (pageInfo) {
              pageWidth = pageWidth ?? pageInfo.width;
              pageHeight = pageHeight ?? pageInfo.height;
            }
          } catch {
            // Non-fatal — dimensions will fall back to defaults below
          }
        }
      } finally {
        // Always clean up the temp directory; suppress errors so they don't mask
        // the real result.  The Buffer was already fully consumed before this point.
        await fs.rm(tmpDir, { recursive: true }).catch(() => {});
      }
    }

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'imageBase64 is required (or provide projectId + pageNumber for server-side PDF rendering)' },
        { status: 400 },
      );
    }

    // Default page dimensions if still not set
    const resolvedPageWidth = pageWidth ?? 1000;
    const resolvedPageHeight = pageHeight ?? 1000;

    // BUG-A5-6-124: Only use server-configured OPENAI_API_KEY — ignore user-supplied keys
    // to prevent credential theft / proxy abuse.
    const serverKey = getOpenAIKey();
    if (!serverKey) {
      const guard = checkOpenAIKey();
      if (guard) return guard;
    }
    const apiKey = serverKey!;

    const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

    // If model is provided and not an openai model, route through OpenRouter
    const useOpenRouter = model && !model.startsWith("openai/") && !model.startsWith("gpt-");
    // BUG-A5-6-126: Strip "openai/" prefix before passing to OpenAI — the prefix is a
    // routing hint, not part of the actual model name.
    const rawModel = model ?? "gpt-4o";
    const resolvedModel = rawModel.startsWith("openai/") ? rawModel.slice("openai/".length) : rawModel;
    const resolvedApiKey = useOpenRouter ? (process.env.OPENROUTER_API_KEY ?? "") : apiKey;
    const resolvedUrl = useOpenRouter ? OPENROUTER_URL : OPENAI_URL;

    const system = `You are a construction takeoff AI. Analyze this blueprint image and identify all measurable elements. Be thorough — count every individual instance of each element type.

COORDINATE FORMAT: All x,y values must be 0-1 (normalized to page width/height). x=0 is left edge, x=1 is right edge, y=0 is top, y=1 is bottom.

COUNT items (type: "count") — return a single center point for each instance detected (a small position marker is correct for count elements):
- "Single Swing Door": a door with one leaf that swings on hinges (shown as an arc on blueprints)
- "Double Swing Door": a door with two leaves that swing open from the center
- "Window": all window types (casement, sliding, awning, fixed, double-hung) — shown as parallel lines in walls
- "Electrical Outlet": wall-mounted power outlets, switches, and junction boxes (shown as circles or symbols on walls)
- "Plumbing Fixture": toilets, sinks, kitchen sinks, bathtubs, showers, urinals, floor drains
- "Column": structural columns, pillars, posts (shown as filled rectangles or circles in the plan)
- "Parking Space": each individual parking stall (shown as lined rectangles in parking areas)
- Other furniture: "Chair", "Table", "Desk" if visible

AREA items (type: "area") — return polygon points that FULLY trace the COMPLETE boundary of the element:
CRITICAL: Do NOT place a tiny marker box. You MUST trace the actual walls/outlines of the element.
- Follow the wall lines precisely — the polygon must cover the full extents of the room or slab.
- Use at least 4 points, typically 4–12 points depending on the shape complexity.
- For a rectangular room, the 4 corners must be at the actual room corners (e.g., spanning ~0.10–0.30 of the page, not a tiny 0.01×0.01 box).
- For L-shaped or irregular rooms, add intermediate vertices to follow each wall turn.
- The polygon area should realistically represent the element's true size relative to the page.
- Examples of what to AVOID: a "room" polygon only 20×20 pixels wide, or 4 points all clustered near one corner.
- Rooms, spaces (living room, bedroom, bathroom, kitchen, office, corridor, etc.)
- Slabs, foundations, floor areas, roof areas, concrete pads, site areas

For AREA elements, the polygon must cover the full interior space. If a room occupies roughly 20% of the visible floor area, its polygon should span roughly 20% of the page coordinates. Never use a polygon smaller than 0.05 x 0.05 page units for a room.

AREA POLYGON EXAMPLES:
- BAD: A room polygon covering only 2% of the page — points like (0.40,0.50), (0.42,0.50), (0.42,0.52), (0.40,0.52). This is far too small.
- GOOD: A room polygon spanning the actual room area — points like (0.15,0.30), (0.45,0.30), (0.45,0.70), (0.15,0.70). This covers the real room boundary.
- BAD: An L-shaped room traced as a simple rectangle missing the alcove.
- GOOD: An L-shaped room with 6+ vertices following each wall turn.

LINEAR items (type: "linear") — return two endpoints:
- Walls, beams, fences, roads

For count items, set the "quantity" field to the number of that element detected. Group identical elements under the same classification name.

Please include a confidence field (0.0-1.0) for each element you detect. This represents your confidence in the detection accuracy — use lower values for ambiguous or partially occluded elements.

Return ONLY a JSON array. Each element: { name: string, type: 'area'|'linear'|'count', classification: string, quantity: number (for count items — total instances of this classification), points: [{x, y}...], color: string (hex), confidence: number (0.0-1.0) }. No prose, no markdown fences.

AREA POLYGON REMINDER: Area polygons MUST trace the true full boundary of the element. A room that occupies 15% of the floor plan should have polygon vertices spanning roughly 0.15 of the page width and height — never a tiny 0.01×0.01 cluster. Minimum 4 vertices; use more for complex shapes.

FINAL CHECK before returning JSON: For each area element, verify that max(x) - min(x) > 0.05 AND max(y) - min(y) > 0.05. If not, you have returned a marker dot instead of a real polygon — go back and trace the actual room boundary.`;

    const content = [
      { type: 'text', text: 'Analyze this blueprint and return JSON array only. No prose.' },
      { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
    ];

    const resp = await fetch(resolvedUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      // BUG-A5-3-005: Do NOT pass upstream error body to the client — it can leak
      // rate-limit headers, partial API key info, or internal routing details.
      // Log the full error server-side only and return a sanitized message.
      const text = await resp.text();
      const requestId = crypto.randomUUID();
      console.error(`[AI Takeoff] Upstream error ${resp.status} (requestId=${requestId}):`, text);
      return NextResponse.json(
        { error: "AI service unavailable. Please try again later.", requestId },
        { status: 502 },
      );
    }

    const data = await resp.json();
    const raw = extractOpenAIText(data?.choices?.[0]?.message?.content);
    console.log("[AI Takeoff] Raw AI response (first 2000 chars):", raw.slice(0, 2000));
    if (!raw) throw new Error('No content in OpenAI response');

    // Filter out any elements with empty points arrays before returning; the client schema
    // (DetectedElementSchema) requires points.length >= 1 and would reject the entire response
    // if any element has an empty points array.
    const results = parseDetectedElements(raw, resolvedPageWidth, resolvedPageHeight).filter((el) => el.points.length > 0);

    let persistedPolygons = 0;
    if (projectId) {
      const page = pageNumber ?? 1;
      broadcastToProject(projectId, 'ai-takeoff:started', { page });
      const apiBase = new URL(req.url).origin;

      // Load existing classifications once and re-use by (type,name) key.
      const clsRes = await fetch(`${apiBase}/api/projects/${projectId}/classifications`);
      if (!clsRes.ok) {
        const clsError = await clsRes.text();
        throw new Error(`Failed to load classifications: ${clsError}`);
      }
      const clsData = await clsRes.json();
      const classMap = new Map<string, string>();
      const existingClassifications: Array<{ id: string; name: string; type: string }> = [];
      for (const cls of Array.isArray(clsData.classifications) ? clsData.classifications : []) {
        if (!cls || typeof cls !== 'object') continue;
        const name = String((cls as { name?: unknown }).name || '').trim();
        const type = String((cls as { type?: unknown }).type || '').trim();
        const id = String((cls as { id?: unknown }).id || '').trim();
        if (!name || !type || !id) continue;
        classMap.set(`${type.toLowerCase()}::${name.toLowerCase()}`, id);
        existingClassifications.push({ id, name, type });
      }

      // Delete all existing polygons for this page before inserting the new batch.
      // This prevents duplicate-key errors when AI takeoff is re-run on a page that
      // already has polygons (Re-Togal / second run scenario).
      await deletePolygonsByPage(projectId, page);

      for (const el of results) {
        const clsKey = `${el.type.toLowerCase()}::${el.classification.toLowerCase()}`;
        let classificationId = classMap.get(clsKey);

        // Fuzzy-match against existing classifications if no exact match
        if (!classificationId) {
          const fuzzyId = fuzzyMatchClassification(el.classification, el.type, existingClassifications);
          if (fuzzyId) {
            classificationId = fuzzyId;
            // Cache for subsequent elements with the same name
            classMap.set(clsKey, fuzzyId);
          }
        }

        if (!classificationId) {
          const createClassRes = await fetch(`${apiBase}/api/projects/${projectId}/classifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: crypto.randomUUID(),
              name: el.classification,
              type: el.type,
              color: el.color,
              visible: true,
            }),
          });
          if (!createClassRes.ok) {
            const classErr = await createClassRes.text();
            throw new Error(`Failed to create classification "${el.classification}": ${classErr}`);
          }
          const createClassData = await createClassRes.json();
          classificationId = createClassData?.classification?.id;
          if (!classificationId) {
            throw new Error(`Classification create response missing id for "${el.classification}"`);
          }
          classMap.set(clsKey, classificationId);
          // Also register in existingClassifications so later elements in this same
          // batch can fuzzy-match against it and avoid creating near-duplicate entries.
          existingClassifications.push({ id: classificationId, name: el.classification, type: el.type });
        }

        const persistPoints = toPersistablePoints(el);
        if (!persistPoints) continue;

        const polyRes = await fetch(`${apiBase}/api/projects/${projectId}/polygons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            classificationId,
            points: persistPoints,
            pageNumber: page,
            label: el.name,
            confidence: el.confidence ?? 0.85,
            detectedByModel: resolvedModel,
          }),
        });
        if (!polyRes.ok) {
          const polyError = await polyRes.text();
          throw new Error(`Failed to persist polygon "${el.name}": ${polyError}`);
        }
        persistedPolygons += 1;
      }

      broadcastToProject(projectId, 'ai-takeoff:complete', {
        page,
        detected: results.length,
        persistedPolygons,
      });

      // Fire takeoff.complete webhook event
      if (projectId) {
        void fireWebhook(projectId, 'takeoff.complete', {
          page,
          detected: results.length,
          persistedPolygons,
        });
      }
    }

    return NextResponse.json({ results, persistedPolygons });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : 'AI takeoff failed';
    const message = `Takeoff failed — try a different model or check your internet connection (${raw})`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
