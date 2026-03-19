import { NextResponse } from 'next/server';
import { listProjects, createProject, initDataDir, getThumbnail } from '@/server/project-store';

export async function GET() {
  try {
    await initDataDir();
    const projects = await listProjects();
    const withThumbnails = await Promise.all(
      projects.map(async (p) => {
        const thumbnail = await getThumbnail(p.id).catch(() => null);
        return { ...p, thumbnail };
      })
    );
    return NextResponse.json({ projects: withThumbnails });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await initDataDir();
    const body = await req.json();
    const name = (body?.name || '').toString().trim();
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    const project = await createProject(name);
    return NextResponse.json({ project });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Create failed') }, { status: 500 });
  }
}
