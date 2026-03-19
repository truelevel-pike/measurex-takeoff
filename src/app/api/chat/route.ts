import { NextResponse } from 'next/server';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const SYSTEM_PROMPT =
  'You are MX, an AI assistant for MeasureX takeoff software. Help users understand their takeoff data, measurements, and quantities.';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatRequest = {
  messages?: ChatMessage[];
  projectId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequest;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (messages.length === 0) {
      return NextResponse.json({ error: 'messages are required' }, { status: 400 });
    }

    const cleanMessages = messages
      .filter(
        (m): m is ChatMessage =>
          (m?.role === 'user' || m?.role === 'assistant') &&
          typeof m?.content === 'string' &&
          m.content.trim().length > 0,
      )
      .map((m) => ({ role: m.role, content: m.content.trim() }));

    if (cleanMessages.length === 0) {
      return NextResponse.json({ error: 'No valid messages provided' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY missing' }, { status: 500 });
    }

    const projectContext =
      typeof body.projectId === 'string' && body.projectId.trim().length > 0
        ? `\n\nCurrent projectId: ${body.projectId.trim()}`
        : '';

    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `${SYSTEM_PROMPT}${projectContext}`,
          },
          ...cleanMessages,
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `OpenAI error ${response.status}: ${text}` },
        { status: 500 },
      );
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;

    if (typeof reply !== 'string' || reply.trim().length === 0) {
      return NextResponse.json({ error: 'No assistant reply returned' }, { status: 500 });
    }

    return NextResponse.json({ reply: reply.trim() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chat request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
