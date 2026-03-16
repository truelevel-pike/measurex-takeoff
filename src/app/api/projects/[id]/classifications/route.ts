import { NextResponse } from 'next/server';
import { getClassifications, createClassification, initDataDir } from '@/server/project-store';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const classifications = await getClassifications(id);
    return NextResponse.json({ classifications });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const body = await req.json();
    const { name, type, color } = body;
    if (!name || !type) return NextResponse.json({ error: 'name and type required' }, { status: 400 });
    const classification = await createClassification(id, { name, type, color: color || '#3b82f6', visible: true } as any);
    return NextResponse.json({ classification });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
