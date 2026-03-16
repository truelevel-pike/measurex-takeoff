/**
 * Server-side OpenAI vision wrapper for AI takeoff.
 * Calls gpt-4o-mini to detect construction elements in blueprint images.
 */

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

const SYSTEM_PROMPT = `You are a construction takeoff AI. Analyze this blueprint image and identify all measurable elements.

COUNT items (type: "count") — return a single center point for each instance detected:
- Doors: classify as "Single Door" (single-leaf swing) or "Double Door" (double-leaf / bi-parting swing)
- Windows: classify as "Window" (all types: casement, sliding, awning, fixed)
- Plumbing fixtures: "Toilet", "Sink", "Kitchen Sink", "Bathtub"
- Furniture: "Chair", "Office Chair", "Table", "Dining Table", "Desk"
- Parking: "Parking Space" (each individual stall)

AREA items (type: "area") — return polygon points tracing the boundary:
- Rooms, spaces (living room, bedroom, bathroom, kitchen, etc.)
- Slabs, foundations, roof areas

LINEAR items (type: "linear") — return two endpoints:
- Walls, beams, fences, roads

Return ONLY a JSON array. Each element: { name: string, type: 'area'|'linear'|'count', classification: string, points: [{x, y}...] as pixel coordinates relative to the image dimensions (0,0 = top-left), color: string (hex), confidence: number (0-1) }. No prose, no markdown fences.`;

/**
 * Analyze a blueprint page image using OpenAI vision and return detected elements.
 */
export async function analyzePageImage(
  imageBase64DataUrl: string,
  pageWidth: number,
  pageHeight: number,
): Promise<AIDetectedElement[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

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
      model: 'gpt-4o-mini',
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: AIDetectedElement[] = parsed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((el: any) => Array.isArray(el?.points) && el?.type)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((el: any) => ({
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
