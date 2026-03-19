import { NextResponse } from 'next/server';
import { deleteClassification, updateClassification, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/app/api/ws/route';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  try {
    await initDataDir();
    const { id, cid } = await params;
    const ok = await deleteClassification(id, cid);
    if (ok) broadcastToProject(id, 'classification:deleted', { id: cid });
    return NextResponse.json({ ok });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
    const { id, cid } = await params;
    const body = await req.json();
    const updated = await updateClassification(id, cid, body);
    if (updated) broadcastToProject(id, 'classification:updated', updated);
    return NextResponse.json({ classification: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
