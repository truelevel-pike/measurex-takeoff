import { NextResponse } from 'next/server';
import { listProjects, createProject, initDataDir } from '@/server/project-store';
import { ProjectCreateSchema, validationError } from '@/lib/api-schemas';
import { withCache } from '@/lib/with-cache';
import { rateLimitResponse } from '@/lib/rate-limit';

export const GET = withCache({ maxAge: 10, sMaxAge: 10 }, async function GET(req: Request) {
  // BUG-A5-6-074: add rate limiting to project listing
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    await initDataDir();
    // listProjects() returns polygon/scale counts inline — no N+1 queries needed.
    // Thumbnails are intentionally omitted here; they are large and not shown
    // until hover, so they load lazily via the individual project endpoint.
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
});

export const POST = withCache({ noStore: true }, async function POST(req: Request) {
  try {
    const limited = rateLimitResponse(req);
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
