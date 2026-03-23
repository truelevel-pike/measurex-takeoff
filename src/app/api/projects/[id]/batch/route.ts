import { NextResponse } from 'next/server';
import { createPolygon, deletePolygon as deletePolygonStore, getPolygons, createClassification, deleteClassification, initDataDir } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { z } from 'zod';
import { rateLimitResponse } from '@/lib/rate-limit';
import type { Polygon } from '@/lib/types';

// BUG-A5-6-116: add .finite() to x and y to reject NaN/Infinity
const PointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

const BatchOpSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('createPolygon'),
    data: z.object({
      id: z.string().uuid().optional(),
      classificationId: z.string().uuid(),
      points: z.array(PointSchema).min(1),
      pageNumber: z.number().int().positive().optional(),
      area: z.number().optional(),
      linearFeet: z.number().optional(),
      label: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      detectedByModel: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('deletePolygon'),
    data: z.object({ id: z.string().uuid() }),
  }),
  z.object({
    type: z.literal('createClassification'),
    data: z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      type: z.enum(['area', 'linear', 'count']),
      color: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('deleteClassification'),
    data: z.object({ id: z.string().uuid() }),
  }),
]);

const BatchBodySchema = z.object({
  operations: z.array(BatchOpSchema).min(1).max(500),
});

/**
 * POST /api/projects/:id/batch
 * Execute multiple operations in a single request to reduce round-trips.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-114: add rate limiting to batch handler
  const limited = rateLimitResponse(req);
  if (limited) return limited;
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = BatchBodySchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);

    const results: Array<{ type: string; ok: boolean; id?: string; error?: string }> = [];
    // Track created polygons for the enriched response shape agents expect
    const createdPolygons: Polygon[] = [];

    for (const op of bodyResult.data.operations) {
      try {
        switch (op.type) {
          case 'createPolygon': {
            const p = await createPolygon(id, {
              id: op.data.id,
              points: op.data.points,
              classificationId: op.data.classificationId,
              pageNumber: op.data.pageNumber || 1,
              area: op.data.area ?? 0,
              linearFeet: op.data.linearFeet ?? 0,
              isComplete: true,
              label: op.data.label,
              confidence: op.data.confidence,
              detectedByModel: op.data.detectedByModel,
            });
            results.push({ type: op.type, ok: true, id: p.id });
            createdPolygons.push(p);
            break;
          }
          case 'deletePolygon': {
            // BUG-A5-6-117: verify polygon belongs to project before deleting
            const projectPolygons = await getPolygons(id);
            const polygonExists = projectPolygons.some((p) => p.id === op.data.id);
            if (!polygonExists) {
              results.push({ type: op.type, ok: false, id: op.data.id, error: 'Polygon not found in this project' });
              break;
            }
            await deletePolygonStore(id, op.data.id);
            results.push({ type: op.type, ok: true, id: op.data.id });
            break;
          }
          case 'createClassification': {
            const c = await createClassification(id, {
              id: op.data.id,
              name: op.data.name,
              type: op.data.type,
              color: op.data.color || '#3b82f6',
              visible: true,
            });
            results.push({ type: op.type, ok: true, id: c.id });
            break;
          }
          case 'deleteClassification': {
            await deleteClassification(id, op.data.id);
            results.push({ type: op.type, ok: true, id: op.data.id });
            break;
          }
        }
      } catch (err) {
        results.push({ type: op.type, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // BUG-A5-6-115: report partial failures with 207 Multi-Status
    const hasFailures = results.some((r) => !r.ok);
    const allFailed = results.every((r) => !r.ok);
    const status = allFailed ? 500 : hasFailures ? 207 : 200;

    // Return enriched shape: { created, polygons, results }
    // so agents can get polygon data directly without a follow-up GET.
    return NextResponse.json(
      {
        results,
        created: createdPolygons.length,
        polygons: createdPolygons,
      },
      { status },
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
