import { NextResponse } from 'next/server';
import { getPolygons, createPolygon, initDataDir } from '@/server/project-store';
import { calculatePolygonArea, calculateLinearFeet } from '@/lib/polygon-utils';

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
    const { points, classificationId } = body;
    if (!points || !classificationId) return NextResponse.json({ error: 'points and classificationId required' }, { status: 400 });
    // Compute area/perimeter from points if caller didn't supply them
    const computedArea = points.length >= 3 ? calculatePolygonArea(points) : 0;
    const computedLinear = points.length >= 2 ? calculateLinearFeet(points, 1, true) : 0;
    const polygon = await createPolygon(id, {
      id: body.id,
      points,
      classificationId,
      pageNumber: body.pageNumber || 1,
      area: body.area ?? computedArea,
      linearFeet: body.linearFeet ?? computedLinear,
      isComplete: body.isComplete ?? true,
      label: body.label,
    });
    return NextResponse.json({ polygon });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
