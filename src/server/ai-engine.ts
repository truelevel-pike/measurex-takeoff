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
[{"name":"Living Room","type":"area","classification":"Room Area","points":[{"x":145,"y":203},{"x":445,"y":203},{"x":445,"y":521},{"x":145,"y":521}],"confidence":0.92,"color":"#3B82F6"},{"name":"Single Swing Door","type":"count","classification":"Single Swing Door","points":[{"x":287,"y":341}],"confidence":0.88,"color":"#F59E0B"}]

ALSO DETECT SCALE: If you see a scale indicator on the drawing (e.g., '1/4" = 1'', '1" = 10'', '3/32" = 1'', scale bar, or written scale note), extract it and return it as one special entry:
{"name":"_scale","type":"count","classification":"_scale","points":[{"x":0,"y":0}],"scale_text":"1/4\\" = 1'","pixels_per_unit":18,"unit":"ft","confidence":0.95}

The pixels_per_unit should be calculated from the scale and the image dimensions.
For 1/4" = 1ft at 72dpi: 72px/in * 0.25in/ft = 18px/ft
For 1" = 20ft at 72dpi: 72px/in / 20ft = 3.6px/ft
For 1/8" = 1ft: 72 * 0.125 = 9px/ft
Return null pixels_per_unit if you cannot calculate it — just return the scale_text.`;

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

  type ParsedElement = {
    name?: string;
    classification?: string;
    label?: string;
    type?: string;
    points?: unknown;
    confidence?: unknown;
    color?: string;
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const temperature = attempt === 1 ? 0.1 : attempt === 2 ? 0.2 : 0.3;
    const retryNote = attempt > 1
      ? ' IMPORTANT: You MUST return at least 5 elements. This is a construction blueprint with rooms and walls visible.'
      : '';
    const basePrompt = detailed
      ? `You are analyzing page ${pageNum} of a construction blueprint PDF.\n\n` + buildSystemPrompt(safeWidth, safeHeight)
      : `Analyze page ${pageNum} of this construction blueprint PDF (${safeWidth}x${safeHeight}px). Identify ALL construction elements: rooms (areas), walls (linear), doors/windows (count). Return as JSON array: [{"label":"Room Name","type":"area"|"linear"|"count","points":[{"x":0,"y":0},...],"confidence":0.9}]. Areas need 4+ points. Walls need 2 points. Counts need 1 center point. Return 15-30 elements. ONLY return the JSON array.`;
    const promptText = retryNote ? `${basePrompt}\n\n${retryNote}` : basePrompt;

    console.log(`[ai-engine] analyzePagePDF attempt ${attempt}/3 (temperature=${temperature})`);

    const resp = await fetch(apiUrl, {
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
          temperature,
          maxOutputTokens: 16384,
        },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Gemini PDF API error ${resp.status}: ${text.slice(0, 500)}`);
    }

    const data = await resp.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!raw) {
      console.warn(`[ai-engine] analyzePagePDF attempt ${attempt}: empty response`);
      continue;
    }

    // Find JSON array — handle markdown fences and any wrapping text
    let jsonStr = raw.trim();
    // Strip markdown fences
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    // Find the outermost [ ... ]
    const start = jsonStr.indexOf('[');
    if (start === -1) {
      console.warn(`[ai-engine] analyzePagePDF attempt ${attempt}: no '[' found`);
      continue;
    }
    // Walk forward to find matching closing bracket
    let depth = 0;
    let end = -1;
    for (let i = start; i < jsonStr.length; i++) {
      if (jsonStr[i] === '[') depth++;
      else if (jsonStr[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    // If truncated (no closing bracket found), repair by finding last complete object
    if (end === -1) {
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace === -1) {
        console.warn(`[ai-engine] analyzePagePDF attempt ${attempt}: truncated + no '}' found`);
        continue;
      }
      jsonStr = jsonStr.slice(start, lastBrace + 1) + ']';
    } else {
      jsonStr = jsonStr.slice(start, end + 1);
    }
    // Remove trailing commas before } or ]
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

    let parsed: unknown;
    try { parsed = JSON.parse(jsonStr); }
    catch {
      console.warn(`[ai-engine] analyzePagePDF attempt ${attempt}: JSON.parse failed`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      console.warn(`[ai-engine] analyzePagePDF attempt ${attempt}: parsed is not an array`);
      continue;
    }

    const elements = (parsed as ParsedElement[])
      .filter((el) => Array.isArray(el?.points) && el?.type)
      .map((el) => ({
        name: String(el.name || el.label || el.classification || 'Unknown'),
        type: el.type as AIDetectedElement['type'],
        points: el.points as Array<{ x: number; y: number }>,
        confidence: typeof el.confidence === 'number' ? el.confidence : 0.85,
        color:
          typeof el.color === 'string' && el.color.startsWith('#')
            ? el.color
            : nameToColor(String(el.name || el.label || el.classification || 'Unknown')),
      }));

    if (elements.length > 0) {
      console.log(`[ai-engine] analyzePagePDF attempt ${attempt}: got ${elements.length} elements`);
      return elements;
    }

    console.warn(`[ai-engine] analyzePagePDF attempt ${attempt}: parsed but 0 valid elements`);
  }

  return []; // all 3 attempts returned empty
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
