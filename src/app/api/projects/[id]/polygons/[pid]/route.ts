import { NextResponse } from 'next/server';
import { updatePolygon, deletePolygon, getProject, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { PolygonIdSchema, PolygonUpdateSchema, validationError } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  try {
    await initDataDir();
    const paramsResult = PolygonIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, pid } = paramsResult.data;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const raw = await req.json().catch(() => null);
    if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const validated = validateBody(PolygonUpdateSchema, raw);
    if ('error' in validated) return validated.error;
    const updated = await updatePolygon(id, pid, validated.data);
    if (updated) broadcastToProject(id, 'polygon:updated', updated);
    return NextResponse.json({ polygon: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  try {
    await initDataDir();
    const paramsResult = PolygonIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, pid } = paramsResult.data;
    // BUG-W24-004: verify project exists before deleting — deletePolygon already scopes
    // to project_id at the DB level (ownership enforced), but we want a clean 404 vs 500.
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const ok = await deletePolygon(id, pid);
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'Polygon not found in this project' }, { status: 404 });
    }
    broadcastToProject(id, 'polygon:deleted', { id: pid });
    return NextResponse.json({ ok });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
