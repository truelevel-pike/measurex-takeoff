import { NextResponse } from 'next/server';
import { checkOpenAIKey, getOpenAIKey } from '@/lib/openai-guard';
import { rateLimitResponse } from '@/lib/rate-limit';

interface VisionMatch {
  name: string;
  count: number;
  description: string;
  boundingBoxes?: { x: number; y: number; width: number; height: number }[];
}

interface VisionResult {
  matches: VisionMatch[];
  summary: string;
}

interface VisionSearchBody {
  image?: unknown;
  query?: unknown;
  selectionImage?: unknown;
}

function asString(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

const SYSTEM_PROMPT = `You are analyzing a construction blueprint/plan. The user will ask you to find specific elements. Return a JSON object with: { matches: [{ name: string, count: number, description: string, boundingBoxes?: [{ x: number, y: number, width: number, height: number }] }], summary: string }. The boundingBoxes use percentage coordinates (0-100) relative to the image dimensions. Be specific about what you find.`;

export async function POST(req: Request) {
  // BUG-A5-5-034: apply rate limiting to vision search
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    const body = (await req.json()) as VisionSearchBody;
    const image = asString(body?.image);
    const query = asString(body?.query);
    const selectionImage = asString(body?.selectionImage);

    if (!query) {
      return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
    }
    if (!image) {
      return NextResponse.json({ error: 'Image is required.' }, { status: 400 });
    }

    const guard = checkOpenAIKey();
    if (guard) return guard;
    const apiKey = getOpenAIKey()!;

    // Ensure images are proper data URLs
    const imageUrl = image.startsWith('data:') ? image : `data:image/png;base64,${image}`;
    const selectionUrl = selectionImage
      ? (selectionImage.startsWith('data:') ? selectionImage : `data:image/png;base64,${selectionImage}`)
      : null;

    // Build the user message content — two-image flow when selectionImage is provided
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [];

    if (selectionUrl) {
      userContent.push({
        type: 'text',
        text: `Here is a reference symbol (first image) from a construction blueprint. Find ALL instances of this same symbol on the full blueprint page (second image). The user describes it as: "${query}". Return their bounding boxes as percentage coordinates (0-100).`,
      });
      userContent.push({
        type: 'image_url',
        image_url: { url: selectionUrl, detail: 'high' },
      });
      userContent.push({
        type: 'image_url',
        image_url: { url: imageUrl, detail: 'high' },
      });
    } else {
      userContent.push({ type: 'text', text: query });
      userContent.push({
        type: 'image_url',
        image_url: { url: imageUrl, detail: 'high' },
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[vision-search] OpenAI error:', response.status, errBody);
      return NextResponse.json(
        { error: `OpenAI API error: ${response.status}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'No response from OpenAI.' },
        { status: 502 },
      );
    }

    let parsed: VisionResult;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If the model didn't return valid JSON, wrap the text as a summary
      parsed = { matches: [], summary: content };
    }

    // Ensure the shape is correct
    if (!Array.isArray(parsed.matches)) {
      parsed.matches = [];
    }
    if (typeof parsed.summary !== 'string') {
      parsed.summary = '';
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    console.error('[vision-search] Error:', err);
    return NextResponse.json(
      { error: (err instanceof Error ? err.message : 'Vision search failed.') },
      { status: 500 },
    );
  }
}
