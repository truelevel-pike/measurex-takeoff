import { NextResponse } from 'next/server';
import { initDataDir, listProjects } from '@/server/project-store';

export async function GET() {
  try {
    await initDataDir();
    const projects = await listProjects();
    const recentProjects = [...projects]
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 5);

    return NextResponse.json({ projects: recentProjects });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
