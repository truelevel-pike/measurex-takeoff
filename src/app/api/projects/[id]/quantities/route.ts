import { NextResponse } from 'next/server';
import { getPolygons, getClassifications, getScale, listScales, getProject, initDataDir } from '@/server/project-store';
import { calculatePolygonArea, calculateLinearLength } from '@/server/geometry-engine';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { withCache } from '@/lib/with-cache';
import { applyCustomFormula } from '@/lib/formula-eval';
import type { ScaleConfig } from '@/server/geometry-engine';

/** Build a pageNumber → ScaleConfig map from all per-page scales. */
function buildPageScaleMap(
  allScales: Array<{ pageNumber?: number; pixelsPerUnit: number; unit?: string }>,
  fallbackPpu: number,
  fallbackUnit: 'metric' | 'imperial',
): Map<number, ScaleConfig> {
  const map = new Map<number, ScaleConfig>();
  for (const s of allScales) {
    const pg = s.pageNumber ?? 1;
    const u = (s.unit === 'm' || s.unit === 'mm') ? 'metric' as const : 'imperial' as const;
    map.set(pg, { pixelsPerFoot: s.pixelsPerUnit, unit: u });
  }
  if (!map.has(1) && fallbackPpu > 0) {
    map.set(1, { pixelsPerFoot: fallbackPpu, unit: fallbackUnit });
  }
  return map;
}

// BUG-12C-5: quantities must always be fresh — polygon changes should be
// reflected immediately. Use noStore to prevent CDN/browser caching stale data.
export const GET = withCache({ noStore: true }, async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // BUG-PIKE-013 fix: load all per-page scales so multi-page projects compute correctly
    const [polygons, classifications, scale, allScales] = await Promise.all([
      getPolygons(id),
      getClassifications(id),
      getScale(id),
      listScales(id),
    ]);

    // pixelsPerUnit is the scale factor (pixels per real-world unit, e.g. pixels per foot).
    // Always recalculate from points using the geometry engine — the stored area/linearFeet
    // fields are in pixel-space (from the client DrawingTool) and must not be used directly.
    const fallbackPpu = scale?.pixelsPerUnit ?? 0;
    const fallbackUnit = (scale?.unit === 'm' || scale?.unit === 'mm') ? 'metric' as const : 'imperial' as const;

    // BUG-PIKE-013 fix: per-page scale map replaces single global ppu
    const pageScaleMap = buildPageScaleMap(allScales, fallbackPpu, fallbackUnit);
    const fallbackConfig: ScaleConfig = { pixelsPerFoot: fallbackPpu, unit: fallbackUnit };

    // First pass: compute raw quantities per classification (before formula override)
    const rawByClass: Record<string, { area: number; linearFeet: number; count: number }> = {};
    for (const c of classifications) {
      const classPolygons = polygons.filter((p) => p.classificationId === c.id);
      let totalArea = 0;
      let totalLinear = 0;
      const count = classPolygons.length;

      for (const p of classPolygons) {
        // BUG-PIKE-013 fix: use per-page scale when available
        const sc = pageScaleMap.get(p.pageNumber ?? 1) ?? fallbackConfig;
        if (sc.pixelsPerFoot && sc.pixelsPerFoot > 0) {
          if (c.type === 'area') {
            totalArea += calculatePolygonArea(p.points, sc) ?? 0;
          } else if (c.type === 'linear') {
            totalLinear += calculateLinearLength(p.points, sc, true) ?? 0;
          }
        }
      }

      rawByClass[c.id] = { area: totalArea, linearFeet: totalLinear, count };
    }

    // BUG-PIKE-014 fix: build name→rawValue map so custom formulas can reference other classifications
    const classNames = classifications.map((c) => c.name);
    const rawByName: Record<string, number> = {};
    for (const c of classifications) {
      const raw = rawByClass[c.id];
      if (!raw) { rawByName[c.name.toLowerCase()] = 0; continue; }
      if (c.type === 'area') rawByName[c.name.toLowerCase()] = raw.area;
      else if (c.type === 'linear') rawByName[c.name.toLowerCase()] = raw.linearFeet;
      else rawByName[c.name.toLowerCase()] = raw.count;
    }

    // Second pass: apply custom formula overrides, determine display unit
    const quantities = classifications.map((c) => {
      const raw = rawByClass[c.id] ?? { area: 0, linearFeet: 0, count: 0 };
      const unit = (fallbackUnit === 'metric')
        ? (c.type === 'area' ? 'SM' : c.type === 'linear' ? 'M' : 'EA')
        : (c.type === 'area' ? 'SF' : c.type === 'linear' ? 'FT' : 'EA');

      // BUG-PIKE-014 fix: apply custom formula when defined (mirrors QuantitiesPanel client-side logic)
      const formulaResult = applyCustomFormula(c.formula, classNames, rawByName);
      if (formulaResult !== null) {
        return {
          classificationId: c.id,
          name: c.name,
          type: c.type,
          color: c.color,
          count: raw.count,
          area: c.type === 'area' ? Math.round(formulaResult * 100) / 100 : Math.round(raw.area * 100) / 100,
          linearFeet: c.type === 'linear' ? Math.round(formulaResult * 100) / 100 : Math.round(raw.linearFeet * 100) / 100,
          formulaOverride: Math.round(formulaResult * 100) / 100,
          unit: c.formulaUnit || unit,
        };
      }

      return {
        classificationId: c.id,
        name: c.name,
        type: c.type,
        color: c.color,
        count: raw.count,
        area: Math.round(raw.area * 100) / 100,
        linearFeet: Math.round(raw.linearFeet * 100) / 100,
        unit,
      };
    });

    return NextResponse.json({ quantities, scale: scale || null });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
});
