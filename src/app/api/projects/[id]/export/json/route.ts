import { getProject, getPolygons, getClassifications, getAssemblies, getScale, getPages, initDataDir } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { fireWebhook } from '@/lib/webhooks';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-055 / BUG-A5-6-056: add rate limiting to export endpoint
  const limited = rateLimitResponse(_req, 20, 60_000);
  if (limited) return limited;

  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    // P3-04 fix (BUG-PIKE-021): include assemblies in JSON export
    const [project, polygons, classifications, assemblies, scale, pages] = await Promise.all([
      getProject(id),
      getPolygons(id),
      getClassifications(id),
      getAssemblies(id),
      getScale(id),
      getPages(id),
    ]);

    if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    // BUG-A5-6-055: strip internal-only fields from export payload
    const INTERNAL_KEYS = ['_rev', '_seq', '_deleted', '_attachments', 'internalId', 'ownerId', 'webhookSecret'];
    const stripInternal = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
      const cleaned = { ...obj };
      for (const key of INTERNAL_KEYS) {
        delete (cleaned as Record<string, unknown>)[key];
      }
      return cleaned;
    };
    const cleanedProject = stripInternal(project as unknown as Record<string, unknown>);
    // P3-04 fix (BUG-PIKE-021): include assemblies so full cost data is exported
    const payload = { project: cleanedProject, pages, classifications, polygons, assemblies, scale };
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
