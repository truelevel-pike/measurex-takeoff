import { NextResponse } from 'next/server';
import { updateAssembly, deleteAssembly, getAssemblies, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { AssemblyIdSchema, AssemblyPutSchema, validationError } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  try {
    await initDataDir();
    const paramsResult = AssemblyIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, aid } = paramsResult.data;
    const assemblies = await getAssemblies(id);
    const assembly = assemblies.find(a => a.id === aid);
    if (!assembly) return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    return NextResponse.json({ assembly });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  try {
    const limited = rateLimitResponse(req, 60, 60_000);
    if (limited) return limited;
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  try {
    const limited = rateLimitResponse(req, 60, 60_000);
    if (limited) return limited;
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  try {
    const limited = rateLimitResponse(req, 60, 60_000);
    if (limited) return limited;
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
