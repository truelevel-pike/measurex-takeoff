import { NextResponse } from 'next/server';
import { updateAssembly, deleteAssembly, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/app/api/ws/route';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  try {
    await initDataDir();
    const { id, aid } = await params;
    const body = await req.json();
    const updated = await updateAssembly(id, aid, body);
    if (!updated) {
      return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    }
    broadcastToProject(id, 'assembly:updated', updated);
    return NextResponse.json({ assembly: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  try {
    await initDataDir();
    const { id, aid } = await params;
    const ok = await deleteAssembly(id, aid);
    if (!ok) {
      return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    }
    broadcastToProject(id, 'assembly:deleted', { id: aid });
    return new Response(null, { status: 204 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
