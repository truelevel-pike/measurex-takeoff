import { NextResponse } from 'next/server';
import { getPolygons, getClassifications, getScale, initDataDir } from '@/server/project-store';
import { calculatePolygonArea, calculateLinearLength } from '@/server/geometry-engine';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { withCache } from '@/lib/with-cache';

export const GET = withCache({ maxAge: 30, sMaxAge: 30 }, async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const [polygons, classifications, scale] = await Promise.all([
      getPolygons(id),
      getClassifications(id),
      getScale(id),
    ]);

    // pixelsPerUnit is the scale factor (pixels per real-world unit, e.g. pixels per foot).
    // Always recalculate from points using the geometry engine — the stored area/linearFeet
    // fields are in pixel-space (from the client DrawingTool) and must not be used directly.
    const ppu = scale?.pixelsPerUnit ?? null;
    const unit = (scale?.unit === 'm' || scale?.unit === 'mm') ? 'metric' as const : 'imperial' as const;
    const scaleConfig = { pixelsPerFoot: ppu, unit };

    const quantities = classifications.map((c) => {
      const classPolygons = polygons.filter((p) => p.classificationId === c.id);
      let totalArea = 0;
      let totalLinear = 0;
      const count = classPolygons.length;

      for (const p of classPolygons) {
        if (c.type === 'area') {
          // Always compute from geometry — stored area is pixel² not real-world SF
          totalArea += calculatePolygonArea(p.points, scaleConfig) ?? 0;
        } else if (c.type === 'linear') {
          totalLinear += calculateLinearLength(p.points, scaleConfig, true) ?? 0;
        }
      }

      return {
        classificationId: c.id,
        name: c.name,
        type: c.type,
        color: c.color,
        count,
        area: Math.round(totalArea * 100) / 100,
        linearFeet: Math.round(totalLinear * 100) / 100,
        unit: c.type === 'area' ? 'SF' : c.type === 'linear' ? 'FT' : 'EA',
      };
    });

    return NextResponse.json({ quantities, scale: scale || null });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
});

