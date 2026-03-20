import { ChatBodySchema } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';
import { checkOpenAIKey, getOpenAIKey } from '@/lib/openai-guard';
import { rateLimitResponse } from '@/lib/rate-limit';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

interface ChatApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: Request) {
  // BUG-A5-5-036: apply rate limiting
  const limited = rateLimitResponse(req);
  if (limited) return limited;

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
      if (context.currentPage != null) parts.push(`Viewer is on page: ${context.currentPage} of ${context.totalPages ?? 1}`);
      parts.push(`Classifications: ${context.classificationCount ?? 0}`);
      parts.push(`Polygons: ${context.polygonCount ?? 0}`);
      parts.push(`Total measured area: ${(context.totalArea ?? 0).toFixed(1)} sq ${context.unit ?? 'ft'}`);

      if (context.quantities && context.quantities.length > 0) {
        const qLines = context.quantities.map((q: { type: string; name: string; count?: number; value: number; unit: string }) => {
          if (q.type === 'count') return `  - ${q.name}: ${q.count ?? 0} count`;
          return `  - ${q.name}: ${q.value.toFixed(1)} ${q.unit}${q.count ? ` (${q.count} polygons)` : ''}`;
        });
        parts.push(`\nQuantities by classification (all pages):\n${qLines.join('\n')}`);
      } else if (context.classifications && context.classifications.length > 0) {
        parts.push(`Classification names: ${context.classifications.join(', ')}`);
      }

      // Per-page breakdown for page-specific queries
      if (context.pageBreakdown && typeof context.pageBreakdown === 'object') {
        const pageLines: string[] = [];
        for (const [pg, entries] of Object.entries(context.pageBreakdown as Record<string, Array<{ name: string; count: number }>>)) {
          if (entries.length === 0) continue;
          const entryStr = entries.map((e) => `${e.name}: ${e.count}`).join(', ');
          pageLines.push(`  Page ${pg}: ${entryStr}`);
        }
        if (pageLines.length > 0) {
          parts.push(`\nPolygon counts by page:\n${pageLines.join('\n')}`);
        }
      }

      contextBlock = `\n\nCurrent project takeoff data:\n${parts.join('\n')}`;
    }

    // Detect cost-at-rate queries (e.g. "cost at $12/SF") and compute breakdown
    const lastUserMsg = history.filter((m) => m.role === 'user').pop()?.content ?? '';
    const costMatch = lastUserMsg.match(/\$\s*([\d,.]+)\s*\/\s*(?:SF|sq\s*ft|sqft)/i);
    let costBreakdown = '';
    if (costMatch && context?.quantities) {
      const rate = parseFloat(costMatch[1].replace(/,/g, ''));
      if (!isNaN(rate) && rate > 0) {
        const areaQuantities = (context.quantities as Array<{ name: string; type: string; value: number; unit: string }>)
          .filter((q) => q.type === 'area');
        if (areaQuantities.length > 0) {
          const tableRows = areaQuantities.map((q) => {
            const total = q.value * rate;
            return `| ${q.name} | ${q.value.toFixed(1)} | $${rate.toFixed(2)} | $${total.toFixed(2)} |`;
          });
          const grandTotal = areaQuantities.reduce((sum, q) => sum + q.value * rate, 0);
          costBreakdown =
            '\n\nThe user asked about cost at a $/SF rate. Here is the pre-computed breakdown — return it as a markdown table:\n' +
            '| Classification | Area (SF) | Rate ($/SF) | Total Cost |\n' +
            '| --- | --- | --- | --- |\n' +
            tableRows.join('\n') +
            `\n| **Total** | **${areaQuantities.reduce((s, q) => s + q.value, 0).toFixed(1)}** | **$${rate.toFixed(2)}** | **$${grandTotal.toFixed(2)}** |` +
            '\n\nReturn this table verbatim in your response, with a brief intro line.';
        }
      }
    }

    const systemPrompt =
      'You are MeasureX AI, an expert construction takeoff assistant embedded in a professional estimating tool. ' +
      'You help users understand their takeoff data — areas, counts, classifications, and quantities. ' +
      'Be concise, practical, and speak like a seasoned estimator. ' +
      'When the user asks about their project, refer to the provided context. ' +
      'Format numbers cleanly. Use bullet points for lists. Keep answers under 200 words unless detail is needed.' +
      contextBlock +
      costBreakdown;

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

    // BUG-A5-6-047: return error if response body is null instead of empty stream
    if (!resp.body) {
      return Response.json({ error: 'Empty response from OpenAI' }, { status: 502 });
    }

    // Stream SSE back to client
    const encoder = new TextEncoder();
    const reader = resp.body.getReader();
    const stream = new ReadableStream({
      async start(controller) {
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
