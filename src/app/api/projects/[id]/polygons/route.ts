import { NextResponse } from 'next/server';
import { getPolygons, createPolygon, initDataDir } from '@/server/project-store';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const polygons = await getPolygons(id);
    return NextResponse.json({ polygons });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const body = await req.json();
    const { points, classificationId, pageNumber } = body;
    if (!points || !classificationId) return NextResponse.json({ error: 'points and classificationId required' }, { status: 400 });
    const polygon = await createPolygon(id, { points, classificationId, pageNumber: pageNumber || 1 } as any);
    return NextResponse.json({ polygon });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
