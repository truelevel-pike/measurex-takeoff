import { NextResponse } from 'next/server';
import { getPolygons, createPolygon, initDataDir } from '@/server/project-store';
import { calculatePolygonArea, calculateLinearFeet } from '@/lib/polygon-utils';
import { broadcastToProject } from '@/app/api/ws/route';
import { ProjectIdSchema, PolygonSchema, validationError } from '@/lib/api-schemas';
import { fireWebhook } from '@/lib/webhooks';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const polygons = await getPolygons(id);
    return NextResponse.json({ polygons });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = PolygonSchema.passthrough().safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);
    const { points, classificationId } = bodyResult.data;
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
    broadcastToProject(id, 'polygon:created', polygon);
    fireWebhook(id, 'polygon.created', polygon);
    return NextResponse.json({ polygon });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
