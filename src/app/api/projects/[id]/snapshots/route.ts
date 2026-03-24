import { NextResponse } from 'next/server';
import { getProject, initDataDir, createSnapshot, listSnapshots } from '@/server/project-store';
import { ProjectIdSchema, SnapshotCreateSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rlResp = rateLimitResponse(_req, 30, 60_000);
    if (rlResp) return rlResp;
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const snapshots = await listSnapshots(id);
    return NextResponse.json({ snapshots });
  } catch (err: unknown) {
    console.error('[GET /snapshots]', err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Internal error') }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rlResp = rateLimitResponse(req, 30, 60_000);
    if (rlResp) return rlResp;
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const bodyResult = SnapshotCreateSchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);

    const snapshot = await createSnapshot(id, bodyResult.data.description);
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (err: unknown) {
    console.error('[POST /snapshots]', err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Internal error') }, { status: 500 });
  }
}
