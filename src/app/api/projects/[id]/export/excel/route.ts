import { NextResponse } from 'next/server';
import { getPolygons, getClassifications, getScale, initDataDir } from '@/server/project-store';
import { calculatePolygonArea, calculateLinearLength } from '@/server/geometry-engine';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const [polygons, classifications, scale] = await Promise.all([
      getPolygons(id),
      getClassifications(id),
      getScale(id),
    ]);

    const scaleConfig = { pixelsPerFoot: scale?.pixelsPerUnit || 1, unit: 'imperial' as const };

    // Build CSV (xlsx requires extra dep — CSV works for now)
    const rows: string[][] = [['Classification', 'Type', 'Count', 'Area (SF)', 'Linear (FT)', 'Unit']];

    for (const c of classifications) {
      const classPolygons = polygons.filter((p) => p.classificationId === c.id);
      let totalArea = 0;
      let totalLinear = 0;

      for (const p of classPolygons) {
        if (c.type === 'area') totalArea += calculatePolygonArea(p.points, scaleConfig);
        else if (c.type === 'linear') totalLinear += calculateLinearLength(p.points, scaleConfig);
      }

      rows.push([
        c.name,
        c.type,
        String(classPolygons.length),
        String(Math.round(totalArea * 100) / 100),
        String(Math.round(totalLinear * 100) / 100),
        c.type === 'area' ? 'SF' : c.type === 'linear' ? 'FT' : 'EA',
      ]);
    }

    const csv = rows.map((r) => r.join(',')).join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="measurex-export-${id}.csv"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
