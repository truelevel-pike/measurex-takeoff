/**
 * Server-side OpenAI vision wrapper for AI takeoff.
 * Calls gpt-4o-mini to detect construction elements in blueprint images.
 */

import { getOpenAIKey } from '@/lib/openai-guard';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export interface AIDetectedElement {
  name: string;
  type: 'area' | 'linear' | 'count';
  points: Array<{ x: number; y: number }>;
  confidence: number;
  color: string;
}

/**
 * Generate a deterministic hex color from a string (element name).
 */
function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const r = (hash >> 0) & 0xff;
  const g = (hash >> 8) & 0xff;
  const b = (hash >> 16) & 0xff;
  // Keep colors vivid by ensuring minimum brightness
  const clamp = (v: number) => Math.max(40, Math.min(220, v));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

const SYSTEM_PROMPT = `You are a construction takeoff AI. Analyze this blueprint image and identify all measurable elements. Be thorough — count every individual instance of each element type.

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

Return ONLY a JSON array. Each element: { name: string, type: 'area'|'linear'|'count', classification: string, quantity: number (for count items — total instances of this classification), points: [{x, y}...] as pixel coordinates relative to the image dimensions (0,0 = top-left), color: string (hex), confidence: number (0-1) }. No prose, no markdown fences.`;

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Analyze a blueprint page image using OpenAI vision and return detected elements.
 * @param imageBase64DataUrl - Base64-encoded PNG data URL of the page image.
 * @param pageWidth - Width of the page in pixels.
 * @param pageHeight - Height of the page in pixels.
 * @param model - Optional OpenAI model to use (defaults to gpt-4o-mini).
 */
export async function analyzePageImage(
  imageBase64DataUrl: string,
  pageWidth: number,
  pageHeight: number,
  model?: string,
): Promise<AIDetectedElement[]> {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error('OpenAI API key not configured — set OPENAI_API_KEY in your environment or .env.local');

  const resolvedModel = model && typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_MODEL;

  const content = [
    {
      type: 'text' as const,
      text: `Analyze this blueprint (${pageWidth}x${pageHeight}px) and return JSON array only. No prose.`,
    },
    {
      type: 'image_url' as const,
      image_url: { url: imageBase64DataUrl, detail: 'high' as const },
    },
  ];

  const resp = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      temperature: 0.2,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const raw: string | undefined = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('No content in OpenAI response');

  const jsonStart = raw.indexOf('[');
  const jsonEnd = raw.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('No JSON array found in AI response');
  }

  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  if (!Array.isArray(parsed)) throw new Error('Parsed AI response is not an array');

  type ParsedElement = { name?: string; classification?: string; type?: string; points?: unknown; confidence?: unknown; color?: string };
  const results: AIDetectedElement[] = (parsed as ParsedElement[])
    .filter((el) => Array.isArray(el?.points) && el?.type)
    .map((el) => ({
      name: String(el.name || el.classification || 'Unknown'),
      type: el.type as AIDetectedElement['type'],
      points: el.points as Array<{ x: number; y: number }>,
      confidence: typeof el.confidence === 'number' ? el.confidence : 0.85,
      color: typeof el.color === 'string' && el.color.startsWith('#')
        ? el.color
        : nameToColor(String(el.name || el.classification || 'Unknown')),
    }));

  return results;
}
