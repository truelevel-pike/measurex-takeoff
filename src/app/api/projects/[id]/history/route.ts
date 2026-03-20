import { NextResponse } from 'next/server';
import { getProject, getHistory, initDataDir } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const url = new URL(req.url);
    // BUG-A5-5-023: fix limit=0 parsing — use explicit NaN check instead of || 50
    const rawLimit = parseInt(url.searchParams.get('limit') || '', 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
    const history = await getHistory(id, limit);

    return NextResponse.json({ history }, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    });
  } catch (err: unknown) {
    console.error('[GET /history]', err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Internal error') }, { status: 500 });
  }
}
