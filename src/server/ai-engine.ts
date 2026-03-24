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

/**
 * Retry a fetch-based call with exponential backoff on 429 rate-limit errors.
 * Delays: 30s → 60s → throw.
 */
async function retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [30_000, 60_000];
  let lastErr: Error = new Error('Unknown error');
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const isRateLimit =
        lastErr.message.includes('429') || lastErr.message.toLowerCase().includes('rate limit');
      if (!isRateLimit || attempt >= delays.length) throw lastErr;
      await new Promise((res) => setTimeout(res, delays[attempt]));
    }
  }
  throw lastErr;
}

/**
 * Clean up Gemini response text before JSON.parse():
 * - Strip markdown code fences (```json ... ```)
 * - Strip JS-style comments (// and /* *\/)
 * - Remove trailing commas before } or ]
 */
function cleanGeminiJson(raw: string): string {
  let s = raw.trim();
  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  // Strip JS comments
  s = s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s.trim();
}
/**
 * Wave 19B: validate and sanitize AI-detected elements.
 * - Discard elements with no name or no points
 * - Clip coordinates to canvas bounds
 * - Require >= 3 points for 'area' type (min viable polygon)
 * - Require >= 1 point for 'count' type
 * - Require >= 2 points for 'linear' type
 */
/**
 * filterElements — primary validation gate applied before any element is returned.
 * Filters out garbage polygons that would corrupt a project:
 *   1. Empty or missing name
 *   2. Area elements with fewer than 3 points (not enough to form a polygon)
 *   3. All points coincide at (0,0) — placeholder / hallucinated element
 *   4. Any point coordinate is negative or exceeds 10× the canvas dimension
 */
function filterElements(
  elements: Array<{ name?: string; type?: string; points?: Array<{ x: number; y: number }> }>,
  pageWidth: number,
  pageHeight: number,
): typeof elements {
  const maxX = pageWidth * 10;
  const maxY = pageHeight * 10;
  return elements.filter((el) => {
    // 1. Must have a non-empty name
    if (!el.name || !el.name.trim()) return false;
    // 2. Must have points array
    if (!Array.isArray(el.points) || el.points.length === 0) return false;
    // 3. Area type requires at least 3 points
    if (el.type === 'area' && el.points.length < 3) return false;
    // 4. All points at (0,0) — discard
    if (el.points.every((p) => p.x === 0 && p.y === 0)) return false;
    // 5. Any point coordinate negative or > 10× canvas dimension
    if (el.points.some((p) => p.x < 0 || p.y < 0 || p.x > maxX || p.y > maxY)) return false;
    return true;
  });
}

function validateAndSanitizeElements(
  elements: Array<{ name: string; type: string; points: Array<{ x: number; y: number }>; confidence: number; color: string }>,
  pageWidth: number,
  pageHeight: number,
): AIDetectedElement[] {
  // Run the primary filter first
  const preFiltered = filterElements(elements, pageWidth, pageHeight) as typeof elements;
  const MIN_POINTS: Record<string, number> = { area: 3, linear: 2, count: 1 };
  const VALID_TYPES = new Set<string>(['area', 'linear', 'count']);
  return preFiltered.filter((el) => {
    if (!el.name || el.name === 'Unknown' || !Array.isArray(el.points) || el.points.length === 0) return false;
    if (!VALID_TYPES.has(el.type)) return false;
    const min = MIN_POINTS[el.type] ?? 1;
    if (el.points.length < min) return false;
    // Coerce string coordinates to numbers (Gemini sometimes returns '"450"' instead of 450)
    // and filter out any points that become NaN after coercion.
    el.points = (el.points as Array<{ x: unknown; y: unknown }>)
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (el.points.length === 0) return false;
    // Clip coordinates to canvas bounds
    el.points = el.points.map((p) => ({
      x: Math.max(0, Math.min(pageWidth, Math.round(p.x))),
      y: Math.max(0, Math.min(pageHeight, Math.round(p.y))),
    }));
    // Discard if all points collapsed to a single location (degenerate polygon)
    if (el.type === 'area' || el.type === 'linear') {
      const unique = new Set(el.points.map((p) => `${p.x},${p.y}`));
      if (unique.size < min) return false;
    }
    return true;
  }) as AIDetectedElement[];
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

const buildSystemPrompt = (pageWidth: number, pageHeight: number) => `You are an expert construction estimator performing a quantity takeoff from a blueprint.
Canvas size: ${pageWidth} x ${pageHeight} pixels. ALL coordinates MUST be integers in pixel space.
Origin (0,0) = top-left corner. X increases right. Y increases down.
NEVER return normalized 0.0-1.0 values -- only absolute pixel integers.

ELEMENT TYPES TO DETECT:

AREA (type: "area") -- full room/space polygon. Rooms to include (ALL visible):
  Living Room, Great Room, Family Room, Den
  Bedroom (Primary/Master Bedroom, Bedroom 2, 3, etc.)
  Bathroom, Full Bath, Half Bath, Powder Room, En Suite
  Kitchen, Butler Pantry, Pantry
  Dining Room, Breakfast Nook, Eating Area
  Hallway, Corridor, Foyer, Entry, Vestibule
  Closet, Walk-In Closet, Linen Closet
  Laundry Room, Utility Room, Mudroom
  Office, Study, Library, Home Office
  Garage, Carport, Workshop
  Basement, Crawl Space, Attic
  Deck, Patio, Porch, Balcony, Terrace
  Mechanical Room, HVAC Room, Storage
  Slab, Foundation Area, Roof Section
Polygon rules:
  - Trace the actual room boundary (wall center lines)
  - MINIMUM 4 points per polygon (rectangles need exactly 4 corners)
  - Complex/L-shaped rooms need 6+ points
  - Points must form a closed, non-self-intersecting polygon

LINEAR (type: "linear") -- wall centerline segments:
  - Exterior walls: perimeter/outline (thick solid lines)
  - Interior walls: room-dividing partitions (thinner lines)
  - Use exactly 2 endpoints per segment
  - Do NOT include door/window openings as wall segments

COUNT (type: "count") -- ONE center point per individual instance:
  Doors: single swing (arc symbol), double swing, pocket, sliding, bifold, barn door
    -> count EVERY door individually (8 doors = 8 separate entries named "Single Swing Door" etc.)
  Windows: casement, sliding, double-hung, fixed, awning, skylight
    -> count EVERY window unit individually
  Plumbing: toilet, sink/lavatory, bathtub, shower, water heater, floor drain
  Electrical: outlet, switch, panel, light fixture, ceiling fan
  Structural: column, post, pilaster
  Appliances: refrigerator, range/stove, dishwasher, washer, dryer

OUTPUT RULES:
1. Return a JSON array -- NO markdown fences, NO explanation, ONLY the array
2. Every coordinate: integer, 0 <= x <= ${pageWidth}, 0 <= y <= ${pageHeight}
3. AREA type: minimum 4 points; COUNT type: exactly 1 point; LINEAR type: exactly 2 points
4. "name" field: human-readable label (e.g. "Living Room", "Single Swing Door")
5. "confidence": 0.0-1.0 (0.95 = clearly visible, 0.7 = partially obscured)
6. A typical residential floor plan has: 8-18 rooms/spaces, 40-80 wall segments, 8-20 doors, 8-20 windows
7. Do NOT omit small spaces (closets, bathrooms, hallways) -- measure everything visible
8. ACCURACY REQUIREMENT: Return EXACTLY the polygon corner coordinates.
   For rectangular rooms use exactly 4 points (one per corner).
   For L-shaped rooms use 6-8 points tracing each inside and outside corner.
   NEVER approximate a polygon with fewer points than the room actually has corners.
   Trace the actual room boundary precisely -- inaccurate polygons produce wrong square footage.

Example:
[{"name":"Living Room","type":"area","points":[{"x":120,"y":180},{"x":480,"y":180},{"x":480,"y":520},{"x":120,"y":520}],"confidence":0.93,"color":"#3b82f6"},{"name":"Exterior Wall","type":"linear","points":[{"x":100,"y":160},{"x":500,"y":160}],"confidence":0.97,"color":"#6b7280"},{"name":"Single Swing Door","type":"count","points":[{"x":290,"y":350}],"confidence":0.91,"color":"#f59e0b"}]

SCALE DETECTION: If the drawing shows a scale indicator (title block, scale bar, or text like
'1/4" = 1\'-0\"', '1/8" = 1 FT', 'SCALE: 1:100', '3/32" = 1 FOOT'),
append ONE special entry at the end of the array:
{"name":"_scale","type":"count","points":[{"x":0,"y":0}],"scale_text":"1/4\" = 1'","pixels_per_unit":18,"unit":"ft","confidence":0.95}

pixels_per_unit guide (at 72 DPI):
  1/4" = 1ft   -> 72 x 0.25 = 18 px/ft
  1/8" = 1ft   -> 72 x 0.125 = 9 px/ft
  3/32" = 1ft  -> 72 x 0.09375 = 6.75 px/ft
  1" = 10ft    -> 72 / 10 = 7.2 px/ft
  1" = 20ft    -> 72 / 20 = 3.6 px/ft
  1:100 metric -> 72 / (100/39.37) = 28.35 px/m
  NTS / Not to Scale -> omit _scale entry entirely
Return null for pixels_per_unit if you cannot calculate it confidently.`;
/**
 * Analyze a blueprint page using Gemini's native PDF input (no canvas/image conversion needed).
 * Sends the raw PDF buffer directly as inline_data with mime_type 'application/pdf'.
 * Gemini Flash and Pro support multi-page PDFs; pageNum tells the model which page to focus on.
 *
 * @param pdfBuffer - Raw PDF file bytes.
 * @param pageNum - 1-based page number to analyze.
 * @param pageWidth - Width of the page in pixels (from stored page metadata).
 * @param pageHeight - Height of the page in pixels (from stored page metadata).
 * @param model - Optional model override (defaults to gemini-2.5-flash).
 */
export async function analyzePagePDF(
  pdfBuffer: Buffer,
  pageNum: number,
  pageWidth: number,
  pageHeight: number,
  model?: string,
  detailed = false,
): Promise<AIDetectedElement[]> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Google API key not configured — set GOOGLE_API_KEY in .env.local');

  const resolvedModel = model?.trim() || 'gemini-2.5-flash';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`;

  // Guard against 0 dimensions (pages not yet registered in DB) — fall back to standard letter/arch-D
  const safeWidth = pageWidth > 0 ? pageWidth : 792;
  const safeHeight = pageHeight > 0 ? pageHeight : 1224;

  const pdfBase64 = pdfBuffer.toString('base64');

  // Wave 19B: always use the full buildSystemPrompt for PDF path too.
  // The short "detailed=false" prompt used a different field name ("label" vs "name")
  // causing all detections to be named "Unknown". Both paths now use the same prompt.
  const promptText = `Focus on page ${pageNum} of this PDF.\n\n` + buildSystemPrompt(safeWidth, safeHeight);

  const resp = await retryWithBackoff(() => fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: pdfBase64,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 16384,
      },
    }),
  }).then(async (r) => {
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Gemini PDF API error ${r.status}: ${text.slice(0, 500)}`);
    }
    return r;
  }));

  const data = await resp.json();
  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!raw) return [];

  // Find JSON array — handle markdown fences and any wrapping text
  let jsonStr = raw.trim();
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = jsonStr.indexOf('[');
  if (start === -1) return [];
  // Depth-counting bracket walk to find matching close
  let depth = 0;
  let end = -1;
  for (let i = start; i < jsonStr.length; i++) {
    if (jsonStr[i] === '[') depth++;
    else if (jsonStr[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  // Repair truncated response — find last complete object
  if (end === -1) {
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace === -1) return [];
    jsonStr = jsonStr.slice(start, lastBrace + 1) + ']';
  } else {
    jsonStr = jsonStr.slice(start, end + 1);
  }
  // Remove trailing commas before } or ]
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  let parsed: unknown;
  try { parsed = JSON.parse(jsonStr); }
  catch { return []; }
  if (!Array.isArray(parsed)) return [];

  type ParsedElement = {
    name?: string;
    classification?: string;
    label?: string;
    type?: string;
    points?: unknown;
    confidence?: unknown;
    color?: string;
  };

  const mapped = (parsed as ParsedElement[])
    .filter((el) => Array.isArray(el?.points) && el?.type)
    .map((el) => ({
      name: String(el.name || el.label || el.classification || '').trim() || 'Unknown',
      type: el.type as AIDetectedElement['type'],
      points: el.points as Array<{ x: number; y: number }>,
      confidence: typeof el.confidence === 'number' ? el.confidence : 0.85,
      color:
        typeof el.color === 'string' && el.color.startsWith('#')
          ? el.color
          : nameToColor(String(el.name || el.label || el.classification || 'element')),
    }));
  // Wave 19B: clip coordinates + discard degenerate/empty elements
  return validateAndSanitizeElements(mapped, safeWidth, safeHeight);
}

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

  const resp = await retryWithBackoff(() => fetch(apiUrl, {
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
  }).then(async (r) => {
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Gemini API error ${r.status}: ${text.slice(0, 500)}`);
    }
    return r;
  }));

  const data = await resp.json();
  const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    // Log finish reason if available
    const finishReason = data?.candidates?.[0]?.finishReason;
    throw new Error(`No content in Gemini response. Finish reason: ${finishReason ?? 'unknown'}`);
  }

  // Parse JSON array from response
  const cleaned = cleanGeminiJson(raw);
  const jsonStart = cleaned.indexOf('[');
  const jsonEnd = cleaned.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1) {
    console.error('[ai-engine] analyzePageImage: no JSON array in response. Raw:', raw.slice(0, 500));
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
  } catch (parseErr) {
    console.error('[ai-engine] analyzePageImage: JSON.parse failed:', parseErr, '— raw:', raw.slice(0, 500));
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error('[ai-engine] analyzePageImage: parsed response is not an array');
    return [];
  }

  type ParsedElement = {
    name?: string;
    classification?: string;
    type?: string;
    points?: unknown;
    confidence?: unknown;
    color?: string;
  };

  const mappedImage = (parsed as ParsedElement[])
    .filter((el) => Array.isArray(el?.points) && el?.type)
    .map((el) => ({
      name: String(el.name || el.classification || '').trim() || 'Unknown',
      type: el.type as AIDetectedElement['type'],
      points: el.points as Array<{ x: number; y: number }>,
      confidence: typeof el.confidence === 'number' ? el.confidence : 0.85,
      color:
        typeof el.color === 'string' && el.color.startsWith('#')
          ? el.color
          : nameToColor(String(el.name || el.classification || 'element')),
    }));
  // Wave 19B: clip coordinates + discard degenerate/empty elements
  return validateAndSanitizeElements(mappedImage, pageWidth, pageHeight);
}
