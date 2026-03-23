import { NextResponse } from 'next/server';
import { initDataDir, listProjects } from '@/server/project-store';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    await initDataDir();
    // listProjects now returns { projects, total } — fetch first 20, already sorted by updatedAt DESC
    const { projects } = await listProjects(20, 0);
    const recentProjects = projects.slice(0, 5);

    return NextResponse.json({ projects: recentProjects });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
