import { getProject, getPolygons, getClassifications, getScale, getPages, initDataDir } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { fireWebhook } from '@/lib/webhooks';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const payload = { project, pages, classifications, polygons, scale };
    const json = JSON.stringify(payload, null, 2);
    const safeName = (project.name || 'project').replace(/[^a-zA-Z0-9-_]/g, '-');

    // Fire export.requested webhook (fire-and-forget)
    void fireWebhook(id, 'export.requested', { format: 'json', projectName: project.name || id, polygons: polygons.length });

    return new Response(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="measurex-${safeName}.json"`,
        'Content-Length': String(new TextEncoder().encode(json).byteLength),
      },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
