import { NextResponse } from 'next/server';
import { getScale, setScale, listScales, getProject, initDataDir } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { z } from 'zod';
import { rateLimitResponse } from '@/lib/rate-limit';

const ScaleEntrySchema = z.object({
  pageNumber: z.number().int().positive(),
  pixelsPerUnit: z.number().positive(),
  unit: z.enum(['ft', 'in', 'm', 'cm', 'mm']),
  label: z.string().optional(),
  source: z.enum(['manual', 'auto', 'ai']).optional(),
});

const BulkScalesSchema = z.object({
  scales: z.array(ScaleEntrySchema).min(1).max(500),
});

/**
 * GET /api/projects/:id/scales
 * Returns all per-page scales for the project.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const url = new URL(req.url);
    const pagesParam = url.searchParams.get('pages');
    const pageNumbers = pagesParam
      ? pagesParam.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];

    if (pageNumbers.length === 0) {
      // BUG-A5-5-010: return all scales when no pages param provided
      const allScales = await listScales(id);
      const scalesMap: Record<number, unknown> = {};
      for (const s of allScales) {
        if (s.pageNumber) scalesMap[s.pageNumber] = s;
      }
      return NextResponse.json({ scales: scalesMap });
    }

    const results: Record<number, unknown> = {};
    await Promise.all(
      pageNumbers.map(async (page) => {
        const scale = await getScale(id, page).catch(() => null);
        if (scale) results[page] = scale;
      }),
    );
    return NextResponse.json({ scales: results });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

/**
 * PUT /api/projects/:id/scales
 * Bulk set per-page scales.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-113: add rate limiting to PUT handler
  const limited = rateLimitResponse(req);
  if (limited) return limited;
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = BulkScalesSchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);

    const results: Record<number, unknown> = {};
    for (const entry of bodyResult.data.scales) {
      const saved = await setScale(id, {
        pixelsPerUnit: entry.pixelsPerUnit,
        unit: entry.unit,
        label: entry.label || 'Custom',
        source: entry.source || 'manual',
        pageNumber: entry.pageNumber,
      });
      results[entry.pageNumber] = saved;
    }

    return NextResponse.json({ scales: results });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
