import { NextResponse } from 'next/server';
import { getClassifications, createClassification, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/app/api/ws/route';
import { ProjectIdSchema, ClassificationCreateSchema, validationError } from '@/lib/api-schemas';
import { fireWebhook } from '@/lib/webhooks';
import { emitPluginEvent } from '@/lib/plugin-system';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const classifications = await getClassifications(id);
    return NextResponse.json({ classifications });
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
    const bodyResult = ClassificationCreateSchema.passthrough().safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);
    const { name, type } = bodyResult.data;
    const classification = await createClassification(id, {
      id: body.id,
      name,
      type,
      color: body.color || '#3b82f6',
      visible: body.visible ?? true,
      formula: body.formula,
      formulaUnit: body.formulaUnit,
      formulaSavedToLibrary: body.formulaSavedToLibrary,
    });
    broadcastToProject(id, 'classification:created', classification);
    fireWebhook(id, 'classification.created', classification);
    await emitPluginEvent('onClassificationCreated', classification, id);
    return NextResponse.json({ classification });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
