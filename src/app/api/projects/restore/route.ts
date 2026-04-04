import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createProject,
  createClassification,
  createPolygon,
  createPage,
  setScale,
  updateProject,
  initDataDir,
  getProject,
  restoreSnapshot,
} from '@/server/project-store';
import { rateLimitResponse } from '@/lib/rate-limit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SnapshotRestoreSchema = z.object({
  projectId: z.string().uuid(),
  snapshotId: z.string().uuid(),
});

// Restore a project from either a full export object or a snapshot ID.
export async function POST(req: Request) {
  const limited = rateLimitResponse(req, 5, 60_000);
  if (limited) return limited;
  try {
    await initDataDir();
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    // Snapshot restore path: { projectId, snapshotId }
    if (body.projectId && body.snapshotId) {
      // BUG-A5-5-004: validate UUIDs before passing to restoreSnapshot
      const snapshotResult = SnapshotRestoreSchema.safeParse(body);
      if (!snapshotResult.success) {
        return NextResponse.json({ error: 'Invalid projectId or snapshotId (must be UUIDs)' }, { status: 400 });
      }
      const result = await restoreSnapshot(snapshotResult.data.projectId, snapshotResult.data.snapshotId);
      return NextResponse.json({ ok: true, ...result });
    }

    const { project } = body as { version?: number; exportedAt?: string; project?: Record<string, unknown> };
    if (!project || typeof project !== 'object') {
      return NextResponse.json({ error: 'Body must contain a project object' }, { status: 400 });
    }

    const name = (project.name as string) || 'Restored Project';
    const created = await createProject(name);

    const classifications = (project.classifications as Array<Record<string, unknown>>) || [];
    const polygons = (project.polygons as Array<Record<string, unknown>>) || [];
    const pages = (project.pages as Array<Record<string, unknown>>) || [];
    const scale = project.scale as Record<string, unknown> | null | undefined;

    const classificationIdMap = new Map<string, string>();

    for (const c of classifications) {
      // BUG-PIKE-032 fix: copy all extended fields (tileWidth/Height/Unit, slopeFactor)
      // so restored project retains tile count and slope factor settings.
      const newC = await createClassification(created.id, {
        name: c.name as string,
        color: c.color as string,
        type: c.type as 'area' | 'linear' | 'count',
        visible: (c.visible as boolean) ?? true,
        formula: c.formula as string | undefined,
        formulaUnit: c.formulaUnit as string | undefined,
        formulaSavedToLibrary: c.formulaSavedToLibrary as boolean | undefined,
        tileWidth: c.tileWidth as number | undefined,
        tileHeight: c.tileHeight as number | undefined,
        tileUnit: c.tileUnit as 'in' | 'ft' | undefined,
        slopeFactor: c.slopeFactor as number | undefined,
      });
      if (c.id) classificationIdMap.set(c.id as string, newC.id);
    }

    for (const p of polygons) {
      const mappedClassificationId = classificationIdMap.get(p.classificationId as string);
      // BUG-A5-6-053: skip polygon if classification mapping fails instead of using stale ID
      if (!mappedClassificationId) continue;
      await createPolygon(created.id, {
        points: p.points as Array<{ x: number; y: number }>,
        classificationId: mappedClassificationId,
        pageNumber: (p.pageNumber as number) ?? 1,
        area: (p.area as number) ?? 0,
        linearFeet: (p.linearFeet as number) ?? 0,
        isComplete: (p.isComplete as boolean) ?? true,
        label: p.label as string | undefined,
      });
    }

    for (const pg of pages) {
      await createPage(created.id, {
        pageNum: pg.pageNum as number,
        width: pg.width as number,
        height: pg.height as number,
        text: pg.text as string,
        name: pg.name as string | undefined,
        drawingSet: pg.drawingSet as string | undefined,
      });
    }

    if (scale) {
      await setScale(created.id, {
        pixelsPerUnit: scale.pixelsPerUnit as number,
        unit: scale.unit as 'ft' | 'in' | 'm' | 'cm' | 'mm',
        label: (scale.label as string) ?? '',
        source: (scale.source as 'manual' | 'auto' | 'ai') ?? 'manual',
        confidence: scale.confidence as number | undefined,
        pageNumber: scale.pageNumber as number | undefined,
      });
    }

    if (pages.length > 0) {
      await updateProject(created.id, { totalPages: pages.length });
    }

    const newProject = await getProject(created.id);
    return NextResponse.json({ id: created.id, project: newProject ?? created });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
