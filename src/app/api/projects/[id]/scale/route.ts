import { NextResponse } from 'next/server';
import { getScale, setScale, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { ProjectIdSchema, ScaleSchema, validationError } from '@/lib/api-schemas';
import { withCache } from '@/lib/with-cache';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const url = new URL(req.url);
    const pageNumber = parseInt(url.searchParams.get('pageNumber') || '1', 10) || 1;
    const scale = await getScale(id, pageNumber);
    return NextResponse.json({ scale });
  } catch (err: unknown) {
    return NextResponse.json({ error: `Scale not configured — please set scale before running takeoff (${err instanceof Error ? err.message : String(err)})` }, { status: 500 });
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
    const bodyResult = ScaleSchema.passthrough().safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);
    const validated = bodyResult.data;
    const unitVal = validated.unit as 'ft' | 'in' | 'm' | 'mm';
    const label = typeof body.label === 'string' ? body.label : 'Custom';
    const source = (typeof body.source === 'string' ? body.source : 'manual') as 'manual' | 'auto' | 'ai';
    const scale = await setScale(id, { pixelsPerUnit: validated.pixelsPerUnit, unit: unitVal, label, source, pageNumber: validated.pageNumber || 1 });
    broadcastToProject(id, 'scale:updated', scale);
    return NextResponse.json({ scale });
  } catch (err: unknown) {
    return NextResponse.json({ error: `Scale not configured — please set scale before running takeoff (${err instanceof Error ? err.message : String(err)})` }, { status: 500 });
  }
});
