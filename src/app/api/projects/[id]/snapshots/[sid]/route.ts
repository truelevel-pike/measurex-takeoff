import { NextResponse } from 'next/server';
import { getProject, initDataDir, getSnapshot, deleteSnapshot, restoreSnapshot } from '@/server/project-store';
import { SnapshotIdSchema, validationError } from '@/lib/api-schemas';

type Params = { params: Promise<{ id: string; sid: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await initDataDir();
    const paramsResult = SnapshotIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, sid } = paramsResult.data;

    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const snapshot = await getSnapshot(id, sid);
    if (!snapshot) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });

    return NextResponse.json(snapshot);
  } catch (err: unknown) {
    console.error('[GET /snapshots/:sid]', err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Internal error') }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    await initDataDir();
    const paramsResult = SnapshotIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, sid } = paramsResult.data;

    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Read optional action from body (default: restore)
    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? 'restore';

    if (action !== 'restore') {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const result = await restoreSnapshot(id, sid);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[POST /snapshots/:sid]', err);
    const msg = err instanceof Error ? err.message : 'Internal error';
    const status = msg === 'Snapshot not found' ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await initDataDir();
    const paramsResult = SnapshotIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, sid } = paramsResult.data;

    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const deleted = await deleteSnapshot(id, sid);
    if (!deleted) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });

    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    console.error('[DELETE /snapshots/:sid]', err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Internal error') }, { status: 500 });
  }
}
