import { NextResponse } from 'next/server';
import { getPolygons, getClassifications, getAssemblies, getScale, listScales, getProject, initDataDir } from '@/server/project-store';
import { calculatePolygonArea, calculateLinearLength, computeDeductions, aggregateDeductions } from '@/server/geometry-engine';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { applyCustomFormula } from '@/lib/formula-eval';
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
 * Build a page-number → pixelsPerUnit map from all per-page scales.
 * Falls back to page-1 scale when a polygon's page has no dedicated scale.
 */
function buildScaleMap(
  allScales: Array<{ pageNumber?: number; pixelsPerUnit: number; unit?: string }>,
  fallbackScale: { pixelsPerUnit: number; unit?: string } | null,
): Map<number, { pixelsPerUnit: number; unit: string }> {
  const map = new Map<number, { pixelsPerUnit: number; unit: string }>();
  for (const s of allScales) {
    const pg = s.pageNumber ?? 1;
    map.set(pg, {
      pixelsPerUnit: s.pixelsPerUnit,
      unit: s.unit ?? 'ft',
    });
  }
  // Ensure page 1 has an entry (used as the ultimate fallback)
  if (!map.has(1) && fallbackScale) {
    map.set(1, { pixelsPerUnit: fallbackScale.pixelsPerUnit, unit: fallbackScale.unit ?? 'ft' });
  }
  return map;
}

/** Return per-page scale config for a polygon, falling back to page 1, then zero. */
function scaleForPage(
  scaleMap: Map<number, { pixelsPerUnit: number; unit: string }>,
  pageNumber: number,
): { pixelsPerFoot: number; unit: 'metric' | 'imperial' } {
  const s = scaleMap.get(pageNumber) ?? scaleMap.get(1) ?? { pixelsPerUnit: 0, unit: 'ft' };
  return {
    pixelsPerFoot: s.pixelsPerUnit,
    unit: (s.unit === 'm' || s.unit === 'mm') ? 'metric' : 'imperial',
  };
}

/**
 * GET /api/projects/:id/estimates
 * Compute a cost estimate based on polygon quantities and optional unit costs.
 * BUG-PIKE-012 fix: use per-page scales so multi-page projects compute correctly.
 * BUG-PIKE-023 fix: apply classification.formula overrides so custom formulas
 *   affect the quantity used in cost estimates (consistent with /api/quantities).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-118: add rate limiting to GET handler
  const limited = rateLimitResponse(_req, 30, 60_000);
  if (limited) return limited;
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const [polygons, classifications, assemblies, fallbackScale, allScales] = await Promise.all([
      getPolygons(id),
      getClassifications(id),
      getAssemblies(id),
      getScale(id),       // page-1 scale (fallback)
      listScales(id),     // all per-page scales
    ]);

    // BUG-PIKE-012 fix: build per-page scale map instead of using a single ppu
    const scaleMap = buildScaleMap(allScales, fallbackScale);

    // Group polygons by classification and compute totals using per-page scale
    const classificationMap = new Map(classifications.map((c) => [c.id, c]));
    const byClassification = new Map<string, { area: number; linearFeet: number; count: number }>();
    for (const p of polygons) {
      const cls = classificationMap.get(p.classificationId);
      const entry = byClassification.get(p.classificationId) ?? { area: 0, linearFeet: 0, count: 0 };
      const cfg = scaleForPage(scaleMap, p.pageNumber ?? 1);
      if (cfg.pixelsPerFoot > 0) {
        if (cls?.type === 'area') {
          entry.area += calculatePolygonArea(p.points, cfg) ?? 0;
        } else if (cls?.type === 'linear') {
          entry.linearFeet += calculateLinearLength(p.points, cfg, true) ?? 0;
        }
      }
      entry.count += 1;
      byClassification.set(p.classificationId, entry);
    }

    // BUG-PIKE-042 fix: apply backout deductions to linear quantities (consistent with /api/quantities)
    const fallbackCfg = scaleForPage(scaleMap, 1);
    const autoDeductMapGet = aggregateDeductions(
      computeDeductions(polygons, classifications, fallbackCfg),
    );
    for (const cls of classifications) {
      if (cls.type !== 'linear') continue;
      const entry = byClassification.get(cls.id);
      if (!entry) continue;
      const backoutTotal = (cls.backouts ?? []).reduce((sum, b) => sum + (b.width || 0) * (b.count || 1), 0);
      const autoDeductTotal = autoDeductMapGet.get(cls.id)?.total ?? 0;
      const manualDeductTotal = (cls.deductions ?? []).reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
      entry.linearFeet = Math.max(0, entry.linearFeet - backoutTotal - autoDeductTotal - manualDeductTotal);
      byClassification.set(cls.id, entry);
    }

    // BUG-PIKE-023 fix: build raw-quantity map for formula evaluation (same pattern as /api/quantities)
    const classNames = classifications.map((c) => c.name);
    const rawByName: Record<string, number> = {};
    for (const [clsId, totals] of byClassification.entries()) {
      const cls = classificationMap.get(clsId);
      if (!cls) continue;
      const raw = cls.type === 'linear' ? totals.linearFeet
        : cls.type === 'count' ? totals.count
        : totals.area;
      rawByName[cls.name.toLowerCase()] = raw;
    }

    const lines = Array.from(byClassification.entries()).map(([clsId, totals]) => {
      const cls = classificationMap.get(clsId);
      // BUG-PIKE-023: apply formula override when classification has a custom formula
      const formulaResult = cls?.formula
        ? applyCustomFormula(cls.formula, classNames, rawByName)
        : null;
      const effectiveArea = (formulaResult !== null && cls?.type === 'area')
        ? formulaResult
        : totals.area;
      const effectiveLinear = (formulaResult !== null && cls?.type === 'linear')
        ? formulaResult
        : totals.linearFeet;
      // BUG-PIKE-028 fix: apply formula override to count type as well
      const effectiveCount = (formulaResult !== null && cls?.type === 'count')
        ? formulaResult
        : totals.count;
      return {
        classificationId: clsId,
        name: cls?.name ?? 'Unknown',
        type: cls?.type ?? 'area',
        totalArea: Math.round(effectiveArea * 100) / 100,
        totalLinearFeet: Math.round(effectiveLinear * 100) / 100,
        count: Math.round(effectiveCount * 100) / 100,
        formulaOverride: formulaResult !== null ? Math.round(formulaResult * 100) / 100 : undefined,
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
 * BUG-PIKE-012 fix: use per-page scales so multi-page projects compute correctly.
 * BUG-PIKE-023 fix: apply classification.formula overrides before computing cost.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-119: add rate limiting to POST handler
  const limited = rateLimitResponse(req, 30, 60_000);
  if (limited) return limited;
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const projectCheck = await getProject(id);
    if (!projectCheck) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = EstimateBodySchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);

    const unitCostMap = new Map(
      (bodyResult.data.unitCosts ?? []).map((uc) => [uc.classificationId, uc]),
    );

    const [polygons, classifications, fallbackScale, allScales] = await Promise.all([
      getPolygons(id),
      getClassifications(id),
      getScale(id),     // page-1 scale (fallback)
      listScales(id),   // all per-page scales
    ]);

    // BUG-PIKE-012 fix: build per-page scale map instead of using a single ppu
    const scaleMap = buildScaleMap(allScales, fallbackScale);

    const classificationMap = new Map(classifications.map((c) => [c.id, c]));
    const byClassification = new Map<string, { area: number; linearFeet: number; count: number }>();
    for (const p of polygons) {
      const cls = classificationMap.get(p.classificationId);
      const entry = byClassification.get(p.classificationId) ?? { area: 0, linearFeet: 0, count: 0 };
      const cfg = scaleForPage(scaleMap, p.pageNumber ?? 1);
      if (cfg.pixelsPerFoot > 0) {
        if (cls?.type === 'area') {
          entry.area += calculatePolygonArea(p.points, cfg) ?? 0;
        } else if (cls?.type === 'linear') {
          entry.linearFeet += calculateLinearLength(p.points, cfg, true) ?? 0;
        }
      }
      entry.count += 1;
      byClassification.set(p.classificationId, entry);
    }

    // BUG-PIKE-042 fix: apply backout deductions to linear quantities (consistent with /api/quantities)
    const fallbackCfgPost = scaleForPage(scaleMap, 1);
    const autoDeductMapPost = aggregateDeductions(
      computeDeductions(polygons, classifications, fallbackCfgPost),
    );
    for (const cls of classifications) {
      if (cls.type !== 'linear') continue;
      const entry = byClassification.get(cls.id);
      if (!entry) continue;
      const backoutTotal = (cls.backouts ?? []).reduce((sum, b) => sum + (b.width || 0) * (b.count || 1), 0);
      const autoDeductTotal = autoDeductMapPost.get(cls.id)?.total ?? 0;
      const manualDeductTotal = (cls.deductions ?? []).reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
      entry.linearFeet = Math.max(0, entry.linearFeet - backoutTotal - autoDeductTotal - manualDeductTotal);
      byClassification.set(cls.id, entry);
    }

    // BUG-PIKE-023 fix: build raw-quantity map for formula evaluation
    const classNames = classifications.map((c) => c.name);
    const rawByName: Record<string, number> = {};
    for (const [clsId, totals] of byClassification.entries()) {
      const cls = classificationMap.get(clsId);
      if (!cls) continue;
      const raw = cls.type === 'linear' ? totals.linearFeet
        : cls.type === 'count' ? totals.count
        : totals.area;
      rawByName[cls.name.toLowerCase()] = raw;
    }

    let totalCost = 0;

    const lines = Array.from(byClassification.entries()).map(([clsId, totals]) => {
      const cls = classificationMap.get(clsId);
      const uc = unitCostMap.get(clsId);
      const rawQuantity = cls?.type === 'linear' ? totals.linearFeet
        : cls?.type === 'count' ? totals.count
        : totals.area;
      // BUG-PIKE-023: apply formula override when classification has a custom formula
      const formulaResult = cls?.formula
        ? applyCustomFormula(cls.formula, classNames, rawByName)
        : null;
      const effectiveQuantity = formulaResult !== null ? formulaResult : rawQuantity;
      const quantity = Math.round(effectiveQuantity * 100) / 100;
      const lineCost = uc ? quantity * uc.unitCost : 0;
      totalCost += lineCost;
      return {
        classificationId: clsId,
        name: cls?.name ?? 'Unknown',
        type: cls?.type ?? 'area',
        quantity,
        unitCost: uc?.unitCost ?? 0,
        lineCost,
        formulaOverride: formulaResult !== null ? Math.round(formulaResult * 100) / 100 : undefined,
      };
    });

    return NextResponse.json({ lines, totalCost });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
