import { NextResponse } from 'next/server';
import { getPolygons, getClassifications, getScale, getAssemblies } from '@/server/project-store';
import { checkOpenAIKey, getOpenAIKey } from '@/lib/openai-guard';
import { ProjectIdSchema, ChatBodySchema, validationError } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';
import { calculateLinearFeet } from '@/lib/polygon-utils';
import { rateLimitResponse } from '@/lib/rate-limit';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const COST_RE = /cost|estimate|how much|price|budget|total/i;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // BUG-A5-5-035: apply rate limiting
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    // BUG-A5-6-083: use ChatBodySchema to validate request body
    const raw = await req.json().catch(() => null);
    if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const validated = validateBody(ChatBodySchema, raw);
    if ('error' in validated) return validated.error;
    const body = validated.data;

    const currentPage: number | undefined = body.context?.currentPage;

    // Normalise to messages array
    // BUG-A5-6-082: ChatBodySchema already restricts role to 'user' | 'assistant'
    let history: Array<{ role: string; content: string }> = [];
    if (body.messages && body.messages.length > 0) {
      history = body.messages;
    } else if (body.message) {
      history = [{ role: 'user', content: body.message.trim() }];
    } else {
      return NextResponse.json({ error: 'message or messages is required' }, { status: 400 });
    }

    const guard = checkOpenAIKey();
    if (guard) return guard;
    const apiKey = getOpenAIKey()!;

    // Fetch project data server-side (including assemblies)
    const [polygons, classifications, scale, assemblies] = await Promise.all([
      getPolygons(id),
      getClassifications(id),
      // BUG-A5-5-019: use current page from request body, not always page 1
      getScale(id, currentPage ?? 1),
      getAssemblies(id),
    ]);

    const ppu = scale?.pixelsPerUnit || 1;
    const unit = scale?.unit || 'ft';

    // Build per-classification quantity map
    const quantityMap: Record<string, { name: string; type: string; quantity: number; unitLabel: string; count: number }> = {};
    for (const c of classifications) {
      const classPolygons = polygons.filter((p) => p.classificationId === c.id);
      if (c.type === 'count') {
        quantityMap[c.id] = { name: c.name, type: c.type, quantity: classPolygons.length, unitLabel: 'count', count: classPolygons.length };
      } else {
        const totalRaw = classPolygons.reduce((sum, p) => {
          // BUG-A5-6-084: guard against null/undefined p.area
          return sum + (c.type === 'linear' ? calculateLinearFeet(p.points, ppu, false) : (p.area ?? 0) / (ppu * ppu));
        }, 0);
        const unitLabel = c.type === 'linear' ? unit : `sq ${unit}`;
        quantityMap[c.id] = { name: c.name, type: c.type, quantity: totalRaw, unitLabel, count: classPolygons.length };
      }
    }

    const quantities = Object.values(quantityMap).map((q) =>
      `  - ${q.name}: ${q.quantity.toFixed(1)} ${q.unitLabel} (${q.count} polygons)`,
    );

    // BUG-A5-6-084: guard against null/undefined p.area
    const totalArea = polygons.reduce((sum, p) => sum + (p.area ?? 0), 0) / (ppu * ppu);

    // Build per-page element counts so AI can answer "which page has the most elements"
    const pageCountMap: Record<number, number> = {};
    for (const p of polygons) {
      const rawPg = (p as unknown as Record<string, unknown>).pageNumber;
      const pg: number = typeof rawPg === 'number' ? rawPg : 1;
      pageCountMap[pg] = (pageCountMap[pg] || 0) + 1;
    }
    const pageBreakdownLines = Object.entries(pageCountMap)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([pg, count]) => `  - Page ${pg}: ${count} polygons`);

    // Build per-page per-classification breakdown
    const pageClassBreakdown: Record<number, { name: string; count: number }[]> = {};
    for (const p of polygons) {
      const rawPg = (p as unknown as Record<string, unknown>).pageNumber;
      const pg: number = typeof rawPg === 'number' ? rawPg : 1;
      if (!pageClassBreakdown[pg]) pageClassBreakdown[pg] = [];
      const cls = classifications.find((c) => c.id === p.classificationId);
      if (!cls) continue;
      const existing = pageClassBreakdown[pg].find((e) => e.name === cls.name);
      if (existing) existing.count++;
      else pageClassBreakdown[pg].push({ name: cls.name, count: 1 });
    }

    const pageClassLines = Object.entries(pageClassBreakdown)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([pg, entries]) => {
        const parts = entries.map((e) => `${e.name} (${e.count})`).join(', ');
        return `  - Page ${pg}: ${parts}`;
      });

    const totalPages = Object.keys(pageClassBreakdown).length;

    // Build current page context if provided
    let currentPageContext = '';
    if (currentPage !== undefined) {
      const currentPageEntries = pageClassBreakdown[currentPage];
      if (currentPageEntries && currentPageEntries.length > 0) {
        const lines = currentPageEntries.map((e) => `  - ${e.name}: ${e.count}`);
        currentPageContext = `\nThe user is currently viewing page ${currentPage}.\nCurrent page (${currentPage}) elements:\n${lines.join('\n')}`;
      } else {
        currentPageContext = `\nThe user is currently viewing page ${currentPage}.\nCurrent page (${currentPage}) has no elements.`;
      }
    }

    // Detect model used for takeoff
    const modelCounts: Record<string, number> = {};
    for (const p of polygons) {
      const m = (p as unknown as Record<string, unknown>).detectedByModel as string | undefined;
      if (m) modelCounts[m] = (modelCounts[m] || 0) + 1;
    }
    const detectedModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    // Build assembly context
    const assemblyContext = assemblies.map((a) => {
      const q = a.classificationId ? quantityMap[a.classificationId] : undefined;
      const quantity = q?.quantity ?? 0;
      const projectedTotal = quantity * a.unitCost;
      return { assemblyName: a.name, unitCost: a.unitCost, quantity: parseFloat(quantity.toFixed(1)), projectedTotal: parseFloat(projectedTotal.toFixed(2)) };
    });

    // Detect cost question
    const lastUserMsg = history.filter((m) => m.role === 'user').pop()?.content ?? '';
    const isCostQuestion = COST_RE.test(lastUserMsg);

    let costTableBlock = '';
    if (isCostQuestion && assemblyContext.length > 0) {
      const rows = assemblyContext.map((a) =>
        `| ${a.assemblyName} | ${a.quantity} | $${a.unitCost.toFixed(2)} | $${a.projectedTotal.toFixed(2)} |`,
      );
      const grandTotal = assemblyContext.reduce((s, a) => s + a.projectedTotal, 0);
      costTableBlock = `

Pre-computed cost breakdown (present this to the user):
| Classification | Quantity | Unit Cost | Total |
|---|---|---|---|
${rows.join('\n')}
| **TOTAL** | | | **$${grandTotal.toFixed(2)}** |`;
    }

    const contextBlock = `

Current project takeoff data:
Classifications: ${classifications.length}
Polygons: ${polygons.length}
Total measured area: ${totalArea.toFixed(1)} sq ${unit}
Scale: ${scale ? `${ppu} px/${unit}` : 'not set'}
${detectedModel ? `This takeoff was processed by ${detectedModel}.` : ''}

Quantities by classification:
${quantities.join('\n')}
${pageBreakdownLines.length > 0 ? `
Polygons per page:
${pageBreakdownLines.join('\n')}` : ''}
${pageClassLines.length > 0 ? `
Per-page classification breakdown:
${pageClassLines.join('\n')}` : ''}${currentPageContext}
${assemblyContext.length > 0 ? `
Assemblies:
${assemblyContext.map((a) => `  - ${a.assemblyName}: $${a.unitCost.toFixed(2)}/unit × ${a.quantity} = $${a.projectedTotal.toFixed(2)}`).join('\n')}` : ''}${costTableBlock}`;

    const systemPrompt =
      'You are MeasureX AI, an expert construction takeoff assistant embedded in a professional estimating tool. ' +
      'You help users understand their takeoff data — areas, counts, classifications, quantities, and costs. ' +
      'Be concise, practical, and speak like a seasoned estimator. ' +
      'When the user asks about their project, refer to the provided context. ' +
      'When assemblies and cost data are provided, use them for cost estimation. ' +
      'When asked about elements on a specific page, use the per-page classification breakdown data provided. ' +
      (currentPage !== undefined ? `The user is currently viewing page ${currentPage} of ${totalPages} pages. ` : '') +
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

    const data = await resp.json().catch(() => null);
    if (!data) return NextResponse.json({ error: 'Invalid response from OpenAI' }, { status: 502 });
    const content = data?.choices?.[0]?.message?.content ?? '';

    return NextResponse.json({ reply: content });
  } catch (err) {
    console.error('Project chat error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
