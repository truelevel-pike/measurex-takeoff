import { NextResponse } from 'next/server';
import { updateAssembly, deleteAssembly, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { AssemblyIdSchema, AssemblyPutSchema, validationError } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  try {
    await initDataDir();
    const paramsResult = AssemblyIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, aid } = paramsResult.data;
    const raw = await req.json();
    const validated = validateBody(AssemblyPutSchema, raw);
    if ('error' in validated) return validated.error;
    const updated = await updateAssembly(id, aid, validated.data);
    if (!updated) {
      return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    }
    broadcastToProject(id, 'assembly:updated', updated);
    return NextResponse.json({ assembly: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  try {
    await initDataDir();
    const paramsResult = AssemblyIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, aid } = paramsResult.data;
    const ok = await deleteAssembly(id, aid);
    if (!ok) {
      return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    }
    broadcastToProject(id, 'assembly:deleted', { id: aid });
    return new Response(null, { status: 204 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
