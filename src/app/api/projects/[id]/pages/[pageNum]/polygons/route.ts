import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getProject,
  getPolygons,
  getClassifications,
  initDataDir,
} from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';

const ParamsSchema = z.object({
  id: z.string().uuid(),
  pageNum: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * GET /api/projects/:id/pages/:pageNum/polygons
 *
 * Returns all polygons on a specific page, enriched with their classification
 * info (type, name, color). Critical for agent verification after takeoff —
 * the agent can confirm what was drawn on each page without needing the full
 * polygon list for the entire project.
 *
 * Response:
 * {
 *   pageNum: number,
 *   polygons: [
 *     {
 *       id, points, area, linearFeet, label, confidence,
 *       classification: { id, name, type, color }
 *     }
 *   ],
 *   count: number,
 *   summary: { areas: number, linears: number, counts: number }
 * }
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; pageNum: string }> },
) {
  const limited = rateLimitResponse(req, 60, 60_000);
  if (limited) return limited;

  try {
    await initDataDir();

    const raw = await params;
    const paramsResult = ParamsSchema.safeParse(raw);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id, pageNum } = paramsResult.data;

    if (!Number.isFinite(pageNum) || pageNum < 1) {
      return NextResponse.json({ error: 'pageNum must be a positive integer' }, { status: 400 });
    }

    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const [allPolygons, classifications] = await Promise.all([
      getPolygons(id),
      getClassifications(id),
    ]);

    // Index classifications by id for O(1) lookup
    const clsById = new Map(classifications.map((c) => [c.id, c]));

    // Filter to requested page and enrich with classification info
    const polygons = allPolygons
      .filter((p) => p.pageNumber === pageNum)
      .map((p) => {
        const cls = clsById.get(p.classificationId);
        return {
          id: p.id,
          points: p.points,
          area: p.area,
          linearFeet: p.linearFeet,
          isComplete: p.isComplete,
          label: p.label ?? null,
          confidence: p.confidence ?? null,
          pageNumber: p.pageNumber,
          classificationId: p.classificationId,
          classification: cls
            ? { id: cls.id, name: cls.name, type: cls.type, color: cls.color }
            : null,
        };
      });

    // Per-type summary for quick agent assertions
    const summary = {
      areas: polygons.filter((p) => p.classification?.type === 'area').length,
      linears: polygons.filter((p) => p.classification?.type === 'linear').length,
      counts: polygons.filter((p) => p.classification?.type === 'count').length,
    };

    return NextResponse.json({ pageNum, polygons, count: polygons.length, summary });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
