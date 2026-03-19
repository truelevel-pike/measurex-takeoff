import { NextResponse } from 'next/server';
import { updatePolygon, deletePolygon, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/app/api/ws/route';
import { PolygonIdSchema, PolygonUpdateSchema, validationError } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  try {
    await initDataDir();
    const paramsResult = PolygonIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, pid } = paramsResult.data;
    const raw = await req.json();
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
    const ok = await deletePolygon(id, pid);
    if (ok) broadcastToProject(id, 'polygon:deleted', { id: pid });
    return NextResponse.json({ ok });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
