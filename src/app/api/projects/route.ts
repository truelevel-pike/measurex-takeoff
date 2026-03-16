import { NextResponse } from 'next/server';
import { listProjects, createProject, initDataDir } from '@/server/project-store';

export async function GET() {
  try {
    await initDataDir();
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Create failed' }, { status: 500 });
  }
}
