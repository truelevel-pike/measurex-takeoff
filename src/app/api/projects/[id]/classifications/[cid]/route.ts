import { NextResponse } from 'next/server';
import { deleteClassification, updateClassification, initDataDir } from '@/server/project-store';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  try {
    await initDataDir();
    const { id, cid } = await params;
    const ok = await deleteClassification(id, cid);
    return NextResponse.json({ ok });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  try {
    await initDataDir();
    const { id, cid } = await params;
    const body = await req.json();
    const updated = await updateClassification(id, cid, body);
    return NextResponse.json({ classification: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
