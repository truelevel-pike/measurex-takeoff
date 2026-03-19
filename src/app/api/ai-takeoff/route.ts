import { NextResponse } from 'next/server';
import { rateLimitResponse } from '@/lib/rate-limit';
import { AiTakeoffBodySchema } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { deletePolygonsByPage } from '@/server/project-store';
import { checkOpenAIKey, getOpenAIKey } from '@/lib/openai-guard';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

interface RawElement {
  name?: string;
  type?: 'area' | 'linear' | 'count';
  classification?: string;
  quantity?: number;
  points?: Array<{ x: number; y: number }>;
  color?: string;
}

interface DetectedElement {
  name: string;
  type: 'area' | 'linear' | 'count';
  classification: string;
  points: Array<{ x: number; y: number }>;
  color: string;
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
      return {
        name,
        type,
        classification: String(el.classification || el.name || name).trim() || name,
        quantity,
        points,
        color,
      };
    });

  const expanded: DetectedElement[] = [];
  for (const el of mapped) {
    if (el.type === 'count') {
      if (el.points.length === 1 && el.quantity > 1) {
        for (let i = 0; i < el.quantity; i++) {
          expanded.push({ name: el.name, type: el.type, classification: el.classification, points: [el.points[0]], color: el.color });
        }
        continue;
      }
      if (el.points.length > 1) {
        for (const point of el.points) {
          expanded.push({ name: el.name, type: el.type, classification: el.classification, points: [point], color: el.color });
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
    const { imageBase64, pageWidth, pageHeight, projectId, pageNumber } = validated.data;

    const guard = checkOpenAIKey();
    if (guard) return guard;
    const apiKey = getOpenAIKey()!;

    const system = `You are a construction takeoff AI. Analyze this blueprint image and identify all measurable elements. Be thorough — count every individual instance of each element type.

COUNT items (type: "count") — return a single center point for each instance detected:
- "Single Swing Door": a door with one leaf that swings on hinges (shown as an arc on blueprints)
- "Double Swing Door": a door with two leaves that swing open from the center
- "Window": all window types (casement, sliding, awning, fixed, double-hung) — shown as parallel lines in walls
- "Electrical Outlet": wall-mounted power outlets, switches, and junction boxes (shown as circles or symbols on walls)
- "Plumbing Fixture": toilets, sinks, kitchen sinks, bathtubs, showers, urinals, floor drains
- "Column": structural columns, pillars, posts (shown as filled rectangles or circles in the plan)
- "Parking Space": each individual parking stall (shown as lined rectangles in parking areas)
- Other furniture: "Chair", "Table", "Desk" if visible

AREA items (type: "area") — return polygon points tracing the boundary:
- Rooms, spaces (living room, bedroom, bathroom, kitchen, etc.)
- Slabs, foundations, roof areas

LINEAR items (type: "linear") — return two endpoints:
- Walls, beams, fences, roads

For count items, set the "quantity" field to the number of that element detected. Group identical elements under the same classification name.

Return ONLY a JSON array. Each element: { name: string, type: 'area'|'linear'|'count', classification: string, quantity: number (for count items — total instances of this classification), points: [{x, y}...] as NORMALIZED coordinates where x and y are between 0 and 1 relative to the image dimensions (0,0 = top-left, 1,1 = bottom-right), color: string (hex) }. No prose, no markdown fences.`;

    const content = [
      { type: 'text', text: 'Analyze this blueprint and return JSON array only. No prose.' },
      { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
    ];

    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `OpenAI error ${resp.status}: ${text}` },
        { status: 500 },
      );
    }

    const data = await resp.json();
    const raw = extractOpenAIText(data?.choices?.[0]?.message?.content);
    if (!raw) throw new Error('No content in OpenAI response');

    // Filter out any elements with empty points arrays before returning; the client schema
    // (DetectedElementSchema) requires points.length >= 1 and would reject the entire response
    // if any element has an empty points array.
    const results = parseDetectedElements(raw, pageWidth, pageHeight).filter((el) => el.points.length > 0);

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
      for (const cls of Array.isArray(clsData.classifications) ? clsData.classifications : []) {
        if (!cls || typeof cls !== 'object') continue;
        const name = String((cls as { name?: unknown }).name || '').trim();
        const type = String((cls as { type?: unknown }).type || '').trim();
        const id = String((cls as { id?: unknown }).id || '').trim();
        if (!name || !type || !id) continue;
        classMap.set(`${type.toLowerCase()}::${name.toLowerCase()}`, id);
      }

      // Delete all existing polygons for this page before inserting the new batch.
      // This prevents duplicate-key errors when AI takeoff is re-run on a page that
      // already has polygons (Re-Togal / second run scenario).
      await deletePolygonsByPage(projectId, page);

      for (const el of results) {
        const clsKey = `${el.type.toLowerCase()}::${el.classification.toLowerCase()}`;
        let classificationId = classMap.get(clsKey);

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
    }

    return NextResponse.json({ results, persistedPolygons });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI takeoff failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
