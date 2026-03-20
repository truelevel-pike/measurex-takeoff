import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClassifications, createClassification, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { ProjectIdSchema, ClassificationCreateSchema, validationError } from '@/lib/api-schemas';
import { fireWebhook } from '@/lib/webhooks';
import { emitPluginEvent } from '@/lib/plugin-system';
import { withCache } from '@/lib/with-cache';
import { rateLimitResponse } from '@/lib/rate-limit';

// BUG-A5-6-102,103: extend schema to validate id and formula fields instead of reading raw body
const ClassificationCreateBodySchema = ClassificationCreateSchema.extend({
  id: z.string().uuid().optional(),
  formula: z.string().optional(),
  formulaUnit: z.string().optional(),
  formulaSavedToLibrary: z.boolean().optional(),
});

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

export const POST = withCache({ noStore: true }, async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-101: add rate limiting to POST handler
  const limited = rateLimitResponse(req);
  if (limited) return limited;
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = ClassificationCreateBodySchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);
    const data = bodyResult.data;
    const classification = await createClassification(id, {
      // BUG-A5-6-102: use validated id from schema instead of raw body
      id: data.id,
      name: data.name,
      type: data.type,
      color: data.color || '#3b82f6',
      visible: data.visible ?? true,
      // BUG-A5-6-103: use validated formula fields from schema instead of raw body
      formula: data.formula,
      formulaUnit: data.formulaUnit,
      formulaSavedToLibrary: data.formulaSavedToLibrary,
    });
    broadcastToProject(id, 'classification:created', classification);
    fireWebhook(id, 'classification.created', classification);
    await emitPluginEvent('onClassificationCreated', classification, id);
    return NextResponse.json({ classification }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
});
