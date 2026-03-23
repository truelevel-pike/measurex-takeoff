/**
 * GET /api/agent/session?projectId=<id>
 *
 * Returns a machine-readable summary of the current project state for the
 * OpenClaw agent. Provides everything the agent needs to plan its takeoff
 * without having to parse the DOM or take screenshots.
 *
 * Response shape:
 * {
 *   projectId: string,
 *   projectName: string,
 *   totalPages: number,
 *   pagesWithScale: number[],   // 1-based page numbers that have scale set
 *   pagesWithPolygons: number[], // 1-based page numbers that have polygons
 *   classifications: { id, name, type, color, polygonCount }[],
 *   scale: { pixelsPerUnit, unit } | null,
 *   canvasUrl: string,          // URL to open in agent browser
 *   agentUrl: string,           // URL with ?agent=1 param
 * }
 */

import { NextResponse } from 'next/server';
import {
  getProject,
  getClassifications,
  getPolygons,
  getScale,
  getPages,
  initDataDir,
} from '@/server/project-store';

export async function GET(req: Request) {
  try {
    await initDataDir();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId query param required' }, { status: 400 });
    }

    // BUG-W16-001: validate UUID format before hitting the DB (prevents 500 on bad input)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      return NextResponse.json({ error: 'Invalid projectId format — must be a UUID' }, { status: 400 });
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const [classifications, polygons, scale, pages] = await Promise.all([
      getClassifications(projectId).catch(() => []),
      getPolygons(projectId).catch(() => []),
      getScale(projectId).catch(() => null),
      getPages(projectId).catch(() => []),
    ]);

    // Summarise polygon coverage per page and per classification
    const polygonsByPage = new Map<number, number>();
    const polygonsByClassification = new Map<string, number>();

    for (const poly of polygons) {
      const pageNum = poly.pageNumber ?? 1;
      polygonsByPage.set(pageNum, (polygonsByPage.get(pageNum) ?? 0) + 1);
      polygonsByClassification.set(
        poly.classificationId,
        (polygonsByClassification.get(poly.classificationId) ?? 0) + 1
      );
    }

    const classificationSummary = classifications.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      color: c.color,
      polygonCount: polygonsByClassification.get(c.id) ?? 0,
    }));

    // Pages that have scale info — use pages array if available, else just check page 1
    const totalPages = pages.length > 0 ? pages.length : ((project as unknown as Record<string, unknown>).totalPages as number | undefined) ?? 1;

    // Build the canvas URL and agent URL.
    // On Vercel SSR the origin header is often absent — fall back to the
    // configured app host so the returned URLs are always fully-qualified.
    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_HOST ?? '';
    const canvasUrl = `${origin}/?project=${projectId}`;
    const agentUrl = `${origin}/?project=${projectId}&agent=1`;

    return NextResponse.json({
      projectId,
      projectName: project.name,
      totalPages,
      pagesWithPolygons: Array.from(polygonsByPage.keys()).sort((a, b) => a - b),
      totalPolygons: polygons.length,
      classifications: classificationSummary,
      scale,
      canvasUrl,
      agentUrl,
    });
  } catch (err) {
    console.error('[agent/session] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
