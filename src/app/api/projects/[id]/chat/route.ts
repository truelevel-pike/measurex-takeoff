import { NextResponse } from 'next/server';
import { getPolygons, getClassifications, getScale } from '@/server/project-store';
import { checkOpenAIKey, getOpenAIKey } from '@/lib/openai-guard';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { calculateLinearFeet } from '@/lib/polygon-utils';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const message: string | undefined = body.message;
    const messages: Array<{ role: string; content: string }> | undefined = body.messages;

    // Normalise to messages array
    let history: Array<{ role: string; content: string }> = [];
    if (Array.isArray(messages) && messages.length > 0) {
      history = messages;
    } else if (typeof message === 'string' && message.trim()) {
      history = [{ role: 'user', content: message.trim() }];
    } else {
      return NextResponse.json({ error: 'message or messages is required' }, { status: 400 });
    }

    const guard = checkOpenAIKey();
    if (guard) return guard;
    const apiKey = getOpenAIKey()!;

    // Fetch project data server-side
    const [polygons, classifications, scale] = await Promise.all([
      getPolygons(id),
      getClassifications(id),
      getScale(id, 1),
    ]);

    const ppu = scale?.pixelsPerUnit || 1;
    const unit = scale?.unit || 'ft';

    // Build context from server data
    const quantities = classifications.map((c) => {
      const classPolygons = polygons.filter((p) => p.classificationId === c.id);
      if (c.type === 'count') {
        return `  - ${c.name}: ${classPolygons.length} count`;
      }
      const totalRaw = classPolygons.reduce((sum, p) => {
        return sum + (c.type === 'linear' ? calculateLinearFeet(p.points, ppu, false) : p.area / (ppu * ppu));
      }, 0);
      const unitLabel = c.type === 'linear' ? unit : `sq ${unit}`;
      return `  - ${c.name}: ${totalRaw.toFixed(1)} ${unitLabel} (${classPolygons.length} polygons)`;
    });

    const totalArea = polygons.reduce((sum, p) => sum + p.area, 0) / (ppu * ppu);

    const contextBlock = `

Current project takeoff data:
Classifications: ${classifications.length}
Polygons: ${polygons.length}
Total measured area: ${totalArea.toFixed(1)} sq ${unit}
Scale: ${scale ? `${ppu} px/${unit}` : 'not set'}

Quantities by classification:
${quantities.join('\n')}`;

    const systemPrompt =
      'You are MeasureX AI, an expert construction takeoff assistant embedded in a professional estimating tool. ' +
      'You help users understand their takeoff data — areas, counts, classifications, and quantities. ' +
      'Be concise, practical, and speak like a seasoned estimator. ' +
      'When the user asks about their project, refer to the provided context. ' +
      'Format numbers cleanly. Use bullet points for lists. Keep answers under 200 words unless detail is needed.' +
      contextBlock;

    const openaiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: openaiMessages,
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('OpenAI error:', resp.status, errText);
      return NextResponse.json({ error: 'OpenAI API error' }, { status: 502 });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? '';

    return NextResponse.json({ reply: content });
  } catch (err) {
    console.error('Project chat error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
