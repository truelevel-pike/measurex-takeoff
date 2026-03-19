import {
  getProject,
  getPolygons,
  getClassifications,
  getScale,
  getPages,
  initDataDir,
} from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';

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

    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        project: { ...project, pages, classifications, polygons, scale },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
