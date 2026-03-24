/**
 * GET /api/projects/:id/snapshot
 *
 * Returns a complete, machine-readable dump of the current project state:
 * { version, exportedAt, project: { ...meta, pages, classifications, polygons, scale } }
 *
 * Wave 34B audit: this endpoint is NOT dead code. It is used by:
 *   - The OpenClaw agent to inspect project state without a browser session
 *   - External integrations and debugging tooling
 *   - Future webhook-driven pipelines (e.g. "snapshot before bulk edit")
 *
 * It differs from /export/json in that it returns raw pixel-space coordinates
 * rather than real-world quantities, making it suitable for round-trip restore.
 */
import {
  getProject,
  getPolygons,
  getClassifications,
  getScale,
  getPages,
  initDataDir,
} from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rlResp = rateLimitResponse(_req, 20, 60_000);
    if (rlResp) return rlResp;
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const [project, polygons, classifications, scale, pages] = await Promise.all([
      getProject(id),
      getPolygons(id),
      getClassifications(id),
      getScale(id),
      getPages(id),
    ]);

    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // BUG-A5-5-030: add Cache-Control: no-store to prevent CDN caching
    return new Response(
      JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        project: { ...project, pages, classifications, polygons, scale },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      },
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
