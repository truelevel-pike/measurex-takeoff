import { NextResponse } from 'next/server';
import { listProjects, createProject, initDataDir } from '@/server/project-store';
import { ProjectCreateSchema, validationError } from '@/lib/api-schemas';
import { withCache } from '@/lib/with-cache';
import { rateLimitResponse } from '@/lib/rate-limit';

export const GET = withCache({ maxAge: 10, sMaxAge: 10 }, async function GET(req: Request) {
  // BUG-A5-6-074 / Wave 20: 30/60s — users refresh the projects list frequently
  const limited = rateLimitResponse(req, 30, 60_000);
  if (limited) return limited;

  try {
    await initDataDir();
    // BUG-W16-002: add pagination — default limit 20, sorted by updatedAt DESC.
    // Thumbnails are intentionally omitted from the list; they load lazily per-project.
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
    const { projects, total } = await listProjects(limit, offset);
    return NextResponse.json({ projects, total, limit, offset, hasMore: offset + projects.length < total });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
});

export const POST = withCache({ noStore: true }, async function POST(req: Request) {
  try {
    // Wave 20: 20/60s — dev testing hits 10/60s default too easily
    const limited = rateLimitResponse(req, 30, 60_000);
    if (limited) return limited;
    await initDataDir();
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = ProjectCreateSchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);
    const project = await createProject(bodyResult.data.name);
    return NextResponse.json({ project });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Create failed') }, { status: 500 });
  }
});
