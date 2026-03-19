import { NextResponse } from 'next/server';
import { z } from 'zod';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const AiTakeoffBodySchema = z.object({
  imageBase64: z.string().min(1),
  pageWidth: z.number().positive(),
  pageHeight: z.number().positive(),
});

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = AiTakeoffBodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const { imageBase64, pageWidth, pageHeight } = parsed.data;

    const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY missing — set OPENAI_API_KEY or NEXT_PUBLIC_OPENAI_API_KEY in .env.local' }, { status: 500 });
    }

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

Return ONLY a JSON array. Each element: { name: string, type: 'area'|'linear'|'count', classification: string, quantity: number (for count items — total instances of this classification), points: [{x, y}...] as pixel coordinates relative to the image dimensions (0,0 = top-left), color: string (hex) }. No prose, no markdown fences.`;

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
        model: 'gpt-4o-mini',
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
    const raw: string | undefined = data?.choices?.[0]?.message?.content;
    if (!raw) throw new Error('No content in OpenAI response');

    // Attempt to extract JSON
    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON array in response');
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed)) throw new Error('Parsed response is not an array');

    // Map and validate each element to match client DetectedElement schema
    interface RawElement {
      name?: string;
      type?: 'area' | 'linear' | 'count';
      classification?: string;
      points?: Array<{ x: number; y: number }>;
      color?: string;
    }

    const results = (parsed as RawElement[])
      .filter((el) => Array.isArray(el?.points) && el?.type)
      .map((el) => {
        const name = String(el.name || el.classification || 'Unknown');
        return {
          name,
          type: el.type as 'area' | 'linear' | 'count',
          classification: String(el.classification || el.name || name),
          points: (el.points as Array<{ x: number; y: number }>).map(
            (p: { x: number; y: number }) => ({
              x: Number(p.x) || 0,
              y: Number(p.y) || 0,
            }),
          ),
          color:
            typeof el.color === 'string' && el.color.startsWith('#')
              ? el.color
              : nameToColor(name),
        };
      });

    return NextResponse.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI takeoff failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
