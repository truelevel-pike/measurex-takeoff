import { NextResponse } from 'next/server';
import {
  createClassification,
  createPage,
  createPolygon,
  createProject,
  deleteProject,
  getClassifications,
  getPages,
  getPolygons,
  getProject,
  getScale,
  initDataDir,
  setScale,
  updateProject,
} from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimitResponse(req, 10, 60_000);
  if (limited) return limited;
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const sourceProject = await getProject(id);
    if (!sourceProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const customName = body?.name?.trim();
    const sourceName = sourceProject.name?.trim() || 'Untitled Project';
    const finalName = customName || `Copy of ${sourceName}`;

    const [classifications, polygons, scale, pages] = await Promise.all([
      getClassifications(id),
      getPolygons(id),
      getScale(id),
      getPages(id),
    ]);

    const duplicated = await createProject(finalName);

    try {
      const classificationIdMap = new Map<string, string>();

      for (const classification of classifications) {
        const created = await createClassification(duplicated.id, {
          name: classification.name,
          color: classification.color,
          type: classification.type,
          visible: classification.visible,
          formula: classification.formula,
          formulaUnit: classification.formulaUnit,
          formulaSavedToLibrary: classification.formulaSavedToLibrary,
        });
        classificationIdMap.set(classification.id, created.id);
      }

      for (const polygon of polygons) {
        // BUG-A5-5-009: skip orphaned polygons whose classificationId isn't in the map
        const mappedClassificationId = classificationIdMap.get(polygon.classificationId);
        if (!mappedClassificationId) {
          console.warn(`[duplicate] skipping orphaned polygon ${polygon.id} — classificationId ${polygon.classificationId} not in map`);
          continue;
        }
        await createPolygon(duplicated.id, {
          points: polygon.points,
          classificationId: mappedClassificationId,
          pageNumber: polygon.pageNumber,
          area: polygon.area,
          linearFeet: polygon.linearFeet,
          isComplete: polygon.isComplete,
          label: polygon.label,
        });
      }

      for (const page of pages) {
        await createPage(duplicated.id, {
          pageNum: page.pageNum,
          width: page.width,
          height: page.height,
          text: page.text,
          name: page.name,
          drawingSet: page.drawingSet,
        });
      }

      if (scale) {
        await setScale(duplicated.id, {
          pixelsPerUnit: scale.pixelsPerUnit,
          unit: scale.unit,
          label: scale.label,
          source: scale.source,
          confidence: scale.confidence,
          pageNumber: scale.pageNumber,
        });
      }

      if (pages.length > 0) {
        await updateProject(duplicated.id, { totalPages: pages.length });
      }

      const newProject = await getProject(duplicated.id);
      return NextResponse.json({ project: newProject ?? duplicated });
    } catch (dupErr: unknown) {
      // BUG-A5-6-015: cleanup partially-created project on failure
      console.error(`[duplicate] failed to duplicate project ${id}, cleaning up ${duplicated.id}`, dupErr);
      try {
        await deleteProject(duplicated.id);
      } catch (cleanupErr) {
        console.error(`[duplicate] cleanup of ${duplicated.id} also failed`, cleanupErr);
      }
      throw dupErr;
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
