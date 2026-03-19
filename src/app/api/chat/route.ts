import { NextResponse } from 'next/server';
import { ChatBodySchema } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

interface ChatApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const validated = validateBody(ChatBodySchema, raw);
    if ('error' in validated) return validated.error;
    const { message, messages, context } = validated.data;

    // Normalise to messages array
    let history: ChatApiMessage[] = [];
    if (Array.isArray(messages) && messages.length > 0) {
      history = messages;
    } else if (typeof message === 'string' && message.trim()) {
      history = [{ role: 'user', content: message.trim() }];
    } else {
      return NextResponse.json({ error: 'message or messages is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    // Build context block for system prompt
    let contextBlock = '';
    if (context) {
      const classNames =
        context.classifications && context.classifications.length > 0
          ? context.classifications.join(', ')
          : 'none yet';
      contextBlock =
        `\n\nCurrent project takeoff context:\n` +
        `- Classifications: ${context.classificationCount ?? 0} (${classNames})\n` +
        `- Total measured area: ${(context.totalArea ?? 0).toFixed(1)} sq ${context.unit ?? 'ft'}`;
    }

    const systemPrompt =
      'You are MeasureX AI, an expert construction takeoff assistant embedded in a professional estimating tool. ' +
      'You help users understand their takeoff data — areas, counts, classifications, and quantities. ' +
      'Be concise, practical, and speak like a seasoned estimator. ' +
      'When the user asks about their project, refer to the provided context.' +
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
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('OpenAI error:', resp.status, errText);
      return NextResponse.json({ error: 'OpenAI API error' }, { status: 502 });
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content?.trim() ?? 'No response from AI.';

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('Chat route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
