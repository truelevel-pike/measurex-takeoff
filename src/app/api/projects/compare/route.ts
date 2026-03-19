import { NextResponse } from 'next/server';
import { getPolygons, getClassifications } from '@/server/project-store';
import type { Polygon } from '@/lib/types';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: Request) {
  // Rate limit: 10 req/min per IP
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    const { projectIdA, projectIdB } = await req.json();
    if (!projectIdA || !projectIdB) {
      return NextResponse.json({ error: 'Missing projectIdA or projectIdB' }, { status: 400 });
    }

    const [polygonsA, polygonsB, classificationsA, classificationsB] = await Promise.all([
      getPolygons(projectIdA),
      getPolygons(projectIdB),
      getClassifications(projectIdA),
      getClassifications(projectIdB),
    ]);

    // Match polygons by classificationId + similar area (within 20%)
    function isMatch(a: Polygon, b: Polygon): boolean {
      if (a.classificationId !== b.classificationId) return false;
      const maxArea = Math.max(a.area, b.area, 1);
      return Math.abs(a.area - b.area) / maxArea < 0.2;
    }

    const added = polygonsB.filter((b) => !polygonsA.some((a) => isMatch(a, b)));
    const removed = polygonsA.filter((a) => !polygonsB.some((b) => isMatch(a, b)));
    const unchanged = polygonsB.filter((b) => !added.includes(b));

    // Build classification-level quantity diff
    const classNameMap = new Map<string, string>();
    for (const c of classificationsA) classNameMap.set(c.id, c.name);
    for (const c of classificationsB) classNameMap.set(c.id, c.name);

    const sumByClass = (polys: Polygon[]) => {
      const map = new Map<string, number>();
      for (const p of polys) {
        map.set(p.classificationId, (map.get(p.classificationId) ?? 0) + p.area);
      }
      return map;
    };

    const totalsA = sumByClass(polygonsA);
    const totalsB = sumByClass(polygonsB);
    const allClassIds = new Set([...totalsA.keys(), ...totalsB.keys()]);

    const classificationDiff = [...allClassIds].map((cid) => {
      const qtyA = totalsA.get(cid) ?? 0;
      const qtyB = totalsB.get(cid) ?? 0;
      const delta = qtyB - qtyA;
      let status: 'added' | 'removed' | 'changed' | 'same';
      if (qtyA === 0) status = 'added';
      else if (qtyB === 0) status = 'removed';
      else if (delta !== 0) status = 'changed';
      else status = 'same';
      return {
        classificationId: cid,
        name: classNameMap.get(cid) ?? cid,
        qtyA,
        qtyB,
        delta,
        status,
      };
    });

    return NextResponse.json({
      added,
      removed,
      unchanged,
      summary: {
        addedCount: added.length,
        removedCount: removed.length,
        unchangedCount: unchanged.length,
      },
      classificationDiff,
    });
  } catch (err: unknown) {
    console.error('[compare route]', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
