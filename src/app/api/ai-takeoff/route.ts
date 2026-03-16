import { NextResponse } from 'next/server';
import type { DetectedElement } from '@/lib/types';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageBase64, scale, pageWidth, pageHeight } = body || {};
    if (!imageBase64 || !pageWidth || !pageHeight) {
      return NextResponse.json({ error: 'imageBase64, pageWidth, pageHeight required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY missing' }, { status: 500 });

    const system = `You are a construction takeoff AI. Analyze this blueprint image and identify all measurable elements.

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

Return ONLY a JSON array. Each element: { name: string, type: 'area'|'linear'|'count', classification: string, points: [{x, y}...] as pixel coordinates relative to the image dimensions (0,0 = top-left), color: string (hex) }. No prose, no markdown fences.`;

    const content = [
      { type: 'text', text: 'Analyze this blueprint and return JSON array only. No prose.' },
      { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
    ];

    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
      return NextResponse.json({ error: `OpenAI error ${resp.status}: ${text}` }, { status: 500 });
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content;
    // Attempt to extract JSON
    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON array in response');
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed)) throw new Error('Parsed response is not an array');

    // Minimal validation
    const results: DetectedElement[] = parsed.filter((el: any) => Array.isArray(el?.points) && el?.type);
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI takeoff failed' }, { status: 500 });
  }
}
