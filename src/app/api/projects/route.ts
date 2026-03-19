import { NextResponse } from 'next/server';
import { listProjects, createProject, initDataDir, getThumbnail } from '@/server/project-store';
import { ProjectCreateSchema, validationError } from '@/lib/api-schemas';
import { withCache } from '@/lib/with-cache';

export const GET = withCache({ maxAge: 10, sMaxAge: 10 }, async function GET() {
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
});

export const POST = withCache({ noStore: true }, async function POST(req: Request) {
  try {
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
