import { NextResponse } from 'next/server';
import { initDataDir, listProjects } from '@/server/project-store';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

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
