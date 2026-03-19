import { NextResponse } from 'next/server';
import { getPolygons } from '@/server/project-store';
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

    const [polygonsA, polygonsB] = await Promise.all([
      getPolygons(projectIdA),
      getPolygons(projectIdB),
    ]) as [Polygon[], Polygon[]];

    // Match polygons by classificationId + similar area (within 20%)
    function isMatch(a: Polygon, b: Polygon): boolean {
      if (a.classificationId !== b.classificationId) return false;
      const maxArea = Math.max(a.area, b.area, 1);
      return Math.abs(a.area - b.area) / maxArea < 0.2;
    }

    const added = polygonsB.filter((b) => !polygonsA.some((a) => isMatch(a, b)));
    const removed = polygonsA.filter((a) => !polygonsB.some((b) => isMatch(a, b)));
    const unchanged = polygonsB.filter((b) => !added.includes(b));

    return NextResponse.json({
      added,
      removed,
      unchanged,
      summary: {
        addedCount: added.length,
        removedCount: removed.length,
        unchangedCount: unchanged.length,
      },
    });
  } catch (err: unknown) {
    console.error('[compare route]', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
