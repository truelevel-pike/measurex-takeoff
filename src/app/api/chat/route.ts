import { ChatBodySchema } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';
import { checkOpenAIKey, getOpenAIKey } from '@/lib/openai-guard';

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
      return Response.json({ error: 'message or messages is required' }, { status: 400 });
    }

    const guard = checkOpenAIKey();
    if (guard) return guard;
    const apiKey = getOpenAIKey()!;

    // Build context block for system prompt
    let contextBlock = '';
    if (context) {
      const parts: string[] = [];
      parts.push(`Classifications: ${context.classificationCount ?? 0}`);
      parts.push(`Polygons: ${context.polygonCount ?? 0}`);
      parts.push(`Total measured area: ${(context.totalArea ?? 0).toFixed(1)} sq ${context.unit ?? 'ft'}`);

      if (context.quantities && context.quantities.length > 0) {
        const qLines = context.quantities.map((q) => {
          if (q.type === 'count') return `  - ${q.name}: ${q.count ?? 0} count`;
          return `  - ${q.name}: ${q.value.toFixed(1)} ${q.unit}${q.count ? ` (${q.count} polygons)` : ''}`;
        });
        parts.push(`\nQuantities by classification:\n${qLines.join('\n')}`);
      } else if (context.classifications && context.classifications.length > 0) {
        parts.push(`Classification names: ${context.classifications.join(', ')}`);
      }

      contextBlock = `\n\nCurrent project takeoff data:\n${parts.join('\n')}`;
    }

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
        stream: true,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('OpenAI error:', resp.status, errText);
      return Response.json({ error: 'OpenAI API error' }, { status: 502 });
    }

    // Stream SSE back to client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = resp.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Chat route error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
