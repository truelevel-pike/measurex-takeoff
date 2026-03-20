import { NextResponse } from 'next/server';
import { getPolygons, getClassifications, getAssemblies, initDataDir } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { z } from 'zod';
import { rateLimitResponse } from '@/lib/rate-limit';

const UnitCostSchema = z.object({
  classificationId: z.string().uuid(),
  unitCost: z.number().nonnegative(),
  unit: z.string().optional(),
});

const EstimateBodySchema = z.object({
  unitCosts: z.array(UnitCostSchema).optional(),
});

/**
 * GET /api/projects/:id/estimates
 * Compute a cost estimate based on polygon quantities and optional unit costs.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-118: add rate limiting to GET handler
  const limited = rateLimitResponse(_req);
  if (limited) return limited;
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const [polygons, classifications, assemblies] = await Promise.all([
      getPolygons(id),
      getClassifications(id),
      getAssemblies(id),
    ]);

    // Group polygons by classification and compute totals
    const byClassification = new Map<string, { area: number; linearFeet: number; count: number }>();
    for (const p of polygons) {
      const entry = byClassification.get(p.classificationId) ?? { area: 0, linearFeet: 0, count: 0 };
      entry.area += p.area ?? 0;
      entry.linearFeet += p.linearFeet ?? 0;
      entry.count += 1;
      byClassification.set(p.classificationId, entry);
    }

    const classificationMap = new Map(classifications.map((c) => [c.id, c]));

    const lines = Array.from(byClassification.entries()).map(([clsId, totals]) => {
      const cls = classificationMap.get(clsId);
      return {
        classificationId: clsId,
        name: cls?.name ?? 'Unknown',
        type: cls?.type ?? 'area',
        totalArea: totals.area,
        totalLinearFeet: totals.linearFeet,
        count: totals.count,
      };
    });

    return NextResponse.json({
      lines,
      assemblies,
      totalPolygons: polygons.length,
      totalClassifications: classifications.length,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

/**
 * POST /api/projects/:id/estimates
 * Compute a cost estimate with provided unit costs.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-119: add rate limiting to POST handler
  const limited = rateLimitResponse(req);
  if (limited) return limited;
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = EstimateBodySchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);

    const unitCostMap = new Map(
      (bodyResult.data.unitCosts ?? []).map((uc) => [uc.classificationId, uc]),
    );

    const [polygons, classifications] = await Promise.all([
      getPolygons(id),
      getClassifications(id),
    ]);

    const byClassification = new Map<string, { area: number; linearFeet: number; count: number }>();
    for (const p of polygons) {
      const entry = byClassification.get(p.classificationId) ?? { area: 0, linearFeet: 0, count: 0 };
      entry.area += p.area ?? 0;
      entry.linearFeet += p.linearFeet ?? 0;
      entry.count += 1;
      byClassification.set(p.classificationId, entry);
    }

    const classificationMap = new Map(classifications.map((c) => [c.id, c]));
    let totalCost = 0;

    const lines = Array.from(byClassification.entries()).map(([clsId, totals]) => {
      const cls = classificationMap.get(clsId);
      const uc = unitCostMap.get(clsId);
      const quantity = cls?.type === 'linear' ? totals.linearFeet
        : cls?.type === 'count' ? totals.count
        : totals.area;
      const lineCost = uc ? quantity * uc.unitCost : 0;
      totalCost += lineCost;
      return {
        classificationId: clsId,
        name: cls?.name ?? 'Unknown',
        type: cls?.type ?? 'area',
        quantity,
        unitCost: uc?.unitCost ?? 0,
        lineCost,
      };
    });

    return NextResponse.json({ lines, totalCost });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
