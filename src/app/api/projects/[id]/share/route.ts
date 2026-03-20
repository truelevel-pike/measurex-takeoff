import { NextResponse } from 'next/server';
import { initDataDir, getProject, generateShareToken, getShareToken, revokeShareToken } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { withCache } from '@/lib/with-cache';

export const GET = withCache({ noStore: true }, async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    // BUG-A5-6-054: verify project exists before returning token
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const token = await getShareToken(id);
    return NextResponse.json({ token: token ?? null });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
});

export const POST = withCache({ noStore: true }, async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Re-use existing token if one already exists
    let token = await getShareToken(id);
    if (!token) {
      token = await generateShareToken(id);
    }

    return NextResponse.json({ token });
  } catch (err: unknown) {
    console.error('[share route POST]', err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
});

export const DELETE = withCache({ noStore: true }, async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    await revokeShareToken(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[share route DELETE]', err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
});
