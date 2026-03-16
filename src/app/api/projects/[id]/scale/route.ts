import { NextResponse } from 'next/server';
import { getScale, setScale, initDataDir } from '@/server/project-store';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const scale = await getScale(id);
    return NextResponse.json({ scale });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const body = await req.json();
    const { pixelsPerUnit, unit, label, source, pageNumber } = body;
    if (!pixelsPerUnit || !unit) return NextResponse.json({ error: 'pixelsPerUnit and unit required' }, { status: 400 });
    const scale = await setScale(id, { pixelsPerUnit, unit, label: label || 'Custom', source: source || 'manual' });
    return NextResponse.json({ scale });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
