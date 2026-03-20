import { NextResponse } from 'next/server';
import { getPolygons, createPolygon, deletePolygonsByPage, initDataDir } from '@/server/project-store';
import { calculatePolygonArea, calculateLinearFeet } from '@/lib/polygon-utils';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { ProjectIdSchema, PolygonSchema, validationError } from '@/lib/api-schemas';
import { fireWebhook } from '@/lib/webhooks';
import { emitPluginEvent } from '@/lib/plugin-system';
import { withCache } from '@/lib/with-cache';

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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const url = new URL(req.url);
    const page = url.searchParams.get('page');
    if (!page) return NextResponse.json({ error: 'Missing ?page query param' }, { status: 400 });
    const pageNumber = parseInt(page, 10);
    if (isNaN(pageNumber) || pageNumber < 1) return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
    await deletePolygonsByPage(id, pageNumber);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export const POST = withCache({ noStore: true }, async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = PolygonSchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);
    const data = bodyResult.data;
    // Compute area/perimeter from points if caller didn't supply them
    const computedArea = data.points.length >= 3 ? calculatePolygonArea(data.points) : 0;
    const computedLinear = data.points.length >= 2 ? calculateLinearFeet(data.points, 1, true) : 0;
    const polygon = await createPolygon(id, {
      id: data.id,
      points: data.points,
      classificationId: data.classificationId,
      pageNumber: data.pageNumber || 1,
      area: data.area ?? computedArea,
      linearFeet: data.linearFeet ?? computedLinear,
      isComplete: data.isComplete ?? true,
      label: data.label,
      confidence: data.confidence,
      detectedByModel: data.detectedByModel,
    });
    broadcastToProject(id, 'polygon:created', polygon);
    fireWebhook(id, 'polygon.created', polygon);
    await emitPluginEvent('onPolygonCreated', polygon, id);
    return NextResponse.json({ polygon }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
});
