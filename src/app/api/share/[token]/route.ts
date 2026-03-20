import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  initDataDir,
  getProjectByShareToken,
  getClassifications,
  getPolygons,
  getScale,
  getPages,
} from '@/server/project-store';
import { validationError } from '@/lib/api-schemas';
import { withCache } from '@/lib/with-cache';
import { rateLimitResponse } from '@/lib/rate-limit';
import type { Classification, Polygon } from '@/lib/types';
import type { PageInfo } from '@/server/project-store';

const TokenSchema = z.object({ token: z.string().uuid() });

export const GET = withCache({ maxAge: 10, sMaxAge: 10 }, async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // BUG-A5-5-002: token-level rate limiting
    const limited = rateLimitResponse(_req, 30, 60_000);
    if (limited) return limited;

    await initDataDir();
    const paramsResult = TokenSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { token } = paramsResult.data;

    const project = await getProjectByShareToken(token);
    if (!project) {
      return NextResponse.json({ error: 'Share link not found or revoked' }, { status: 404 });
    }

    // BUG-A5-5-002: check expiry if the field exists
    const expiresAt = (project as Record<string, unknown>).expiresAt;
    if (expiresAt && new Date(expiresAt as string) < new Date()) {
      return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
    }

    const [classifications, polygons, scale, pages] = await Promise.all([
      getClassifications(project.id).catch(() => [] as Classification[]),
      getPolygons(project.id).catch(() => [] as Polygon[]),
      getScale(project.id).catch(() => null),
      getPages(project.id).catch(() => [] as PageInfo[]),
    ]);

    const totalPages = (project.totalPages && project.totalPages > 1)
      ? project.totalPages
      : (pages.length > 1 ? pages.length : (project.totalPages ?? 1));

    const sheetNames: Record<number, string> = {};
    const drawingSets: Record<number, string> = {};
    for (const p of pages) {
      if (p.name) sheetNames[p.pageNum] = p.name;
      if (p.drawingSet) drawingSets[p.pageNum] = p.drawingSet;
    }

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        readOnly: true,
        state: {
          classifications,
          polygons,
          scale,
          scales: {},
          currentPage: 1,
          totalPages,
          sheetNames,
          drawingSets,
        },
      },
    });
  } catch (err: unknown) {
    console.error('[share token GET]', err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
});
