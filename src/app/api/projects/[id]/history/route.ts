import { NextResponse } from 'next/server';
import { getProject, getHistory, initDataDir } from '@/server/project-store';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 200);
    const history = await getHistory(id, limit);

    return NextResponse.json({ history });
  } catch (err: unknown) {
    console.error('[GET /history]', err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Internal error') }, { status: 500 });
  }
}
