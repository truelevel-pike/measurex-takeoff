import { NextResponse } from 'next/server';
import { updatePolygon, deletePolygon, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/app/api/ws/route';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  try {
    await initDataDir();
    const { id, pid } = await params;
    const body = await req.json();
    const updated = await updatePolygon(id, pid, body);
    if (updated) broadcastToProject(id, 'polygon:updated', updated);
    return NextResponse.json({ polygon: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  try {
    await initDataDir();
    const { id, pid } = await params;
    const ok = await deletePolygon(id, pid);
    if (ok) broadcastToProject(id, 'polygon:deleted', { id: pid });
    return NextResponse.json({ ok });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
