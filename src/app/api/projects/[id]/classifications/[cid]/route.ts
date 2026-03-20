import { NextResponse } from 'next/server';
import { deleteClassification, updateClassification, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { ClassificationIdSchema, ClassificationUpdateSchema, validationError } from '@/lib/api-schemas';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ClassificationIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, cid } = paramsResult.data;
    const ok = await deleteClassification(id, cid);
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'Classification not found' }, { status: 404 });
    }
    broadcastToProject(id, 'classification:deleted', { id: cid });
    return NextResponse.json({ ok });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  return patchClassification(req, params);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  return patchClassification(req, params);
}

async function patchClassification(req: Request, params: Promise<{ id: string; cid: string }>) {
  try {
    await initDataDir();
    const paramsResult = ClassificationIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, cid } = paramsResult.data;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    // BUG-A5-5-028: remove .passthrough() and pass bodyResult.data instead of raw body
    const bodyResult = ClassificationUpdateSchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);
    const updated = await updateClassification(id, cid, bodyResult.data);
    if (updated) broadcastToProject(id, 'classification:updated', updated);
    return NextResponse.json({ classification: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
