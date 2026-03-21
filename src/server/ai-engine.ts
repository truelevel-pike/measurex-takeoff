/**
 * Server-side Gemini vision wrapper for AI takeoff.
 * Uses Gemini 3.1 Pro Preview — best vision model for blueprint analysis.
 */

export interface AIDetectedElement {
  name: string;
  type: 'area' | 'linear' | 'count';
  points: Array<{ x: number; y: number }>;
  confidence: number;
  color: string;
}

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

const DEFAULT_MODEL = 'gemini-3.1-pro-preview';

const buildSystemPrompt = (pageWidth: number, pageHeight: number) => `You are an expert construction estimator performing a quantity takeoff from a blueprint image.
The image is ${pageWidth}x${pageHeight} pixels. Use ACTUAL PIXEL COORDINATES — not normalized 0-1 values.

Your task: identify every construction element visible and return their locations with precise pixel coordinates.

ELEMENT TYPES:

COUNT (type: "count") — one center point per individual instance:
- Doors: single swing (arc symbol), double swing, pocket, sliding, bifold — count EACH door
- Windows: all types (casement, sliding, double-hung, fixed, awning) — count EACH window unit
- Plumbing: toilets, sinks, bathtubs, showers, water heaters, floor drains
- Electrical: outlets, switches, panels, fixtures
- Structural: columns, posts, pilasters

AREA (type: "area") — polygon boundary tracing the exact room/space perimeter:
- Rooms: living room, bedroom, bathroom, kitchen, dining, garage, entry, hallway, closet, laundry, office, family room
- Outdoor: deck, patio, porch, balcony, pool
- Structural: slab, foundation, roof section

LINEAR (type: "linear") — two endpoints only:
- Exterior walls (perimeter, thick lines)
- Interior walls (room dividers, thinner)
- Beams, headers

RULES:
1. Coordinates MUST be pixel values within (0,0) to (${pageWidth},${pageHeight})
2. For AREA elements: trace the actual boundary — minimum 4 points, be precise
3. For COUNT elements: one center point per instance — if there are 8 doors, return 8 separate entries
4. Confidence: 0.0-1.0 based on how certain you are
5. Be thorough — a typical residential plan has 8-20 doors, 10-20 windows, 5-15 rooms

Return ONLY a valid JSON array, no markdown fences, no prose:
[{"name":"Living Room","type":"area","classification":"Room Area","points":[{"x":145,"y":203},{"x":445,"y":203},{"x":445,"y":521},{"x":145,"y":521}],"confidence":0.92,"color":"#3B82F6"},{"name":"Single Swing Door","type":"count","classification":"Single Swing Door","points":[{"x":287,"y":341}],"confidence":0.88,"color":"#F59E0B"}]`;

/**
 * Analyze a blueprint page image using Gemini 3.1 Pro Preview vision.
 * @param imageBase64DataUrl - Base64-encoded PNG/JPEG data URL of the page image.
 * @param pageWidth - Width of the page in pixels.
 * @param pageHeight - Height of the page in pixels.
 * @param model - Optional model override (defaults to gemini-3.1-pro-preview).
 */
export async function analyzePageImage(
  imageBase64DataUrl: string,
  pageWidth: number,
  pageHeight: number,
  model?: string,
): Promise<AIDetectedElement[]> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Google API key not configured — set GOOGLE_API_KEY in .env.local');

  // Extract mime type and base64 data from data URL
  const base64Match = imageBase64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!base64Match) throw new Error('Invalid image data URL format');
  const mimeType = `image/${base64Match[1]}`;
  const imageData = base64Match[2];

  const resolvedModel = model?.trim() || DEFAULT_MODEL;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`;

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: buildSystemPrompt(pageWidth, pageHeight),
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageData,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = await resp.json();
  const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    // Log finish reason if available
    const finishReason = data?.candidates?.[0]?.finishReason;
    throw new Error(`No content in Gemini response. Finish reason: ${finishReason ?? 'unknown'}`);
  }

  // Parse JSON array from response
  const jsonStart = raw.indexOf('[');
  const jsonEnd = raw.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON array found in Gemini response');

  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  if (!Array.isArray(parsed)) throw new Error('Parsed Gemini response is not an array');

  type ParsedElement = {
    name?: string;
    classification?: string;
    type?: string;
    points?: unknown;
    confidence?: unknown;
    color?: string;
  };

  return (parsed as ParsedElement[])
    .filter((el) => Array.isArray(el?.points) && el?.type)
    .map((el) => ({
      name: String(el.name || el.classification || 'Unknown'),
      type: el.type as AIDetectedElement['type'],
      points: el.points as Array<{ x: number; y: number }>,
      confidence: typeof el.confidence === 'number' ? el.confidence : 0.85,
      color:
        typeof el.color === 'string' && el.color.startsWith('#')
          ? el.color
          : nameToColor(String(el.name || el.classification || 'Unknown')),
    }));
}
