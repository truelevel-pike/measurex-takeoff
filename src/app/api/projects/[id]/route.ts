import { NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject, initDataDir, getClassifications, getPolygons, getScale, setScale, getPages, getThumbnail } from '@/server/project-store';
import type { Classification, Polygon } from '@/lib/types';
import type { PageInfo, ProjectMeta } from '@/server/project-store';
import { ProjectIdSchema, ProjectPutSchema, validationError } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';
import { withCache } from '@/lib/with-cache';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-085: add rate limiting to project CRUD
  const limited = rateLimitResponse(_req);
  if (limited) return limited;

  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Bundle full state so the client can hydrate in a single round-trip
    const [classifications, polygons, scale, pages, thumbnail] = await Promise.all([
      getClassifications(id).catch(() => [] as Classification[]),
      getPolygons(id).catch(() => [] as Polygon[]),
      getScale(id).catch(() => null),
      getPages(id).catch((e) => { console.error('getPages error:', e); return [] as PageInfo[]; }),
      getThumbnail(id).catch(() => null),
    ]);

    // totalPages: prefer stored value (project.totalPages), fall back to mx_pages count
    const totalPages = (project.totalPages && project.totalPages > 1)
      ? project.totalPages
      : (pages.length > 1 ? pages.length : (project.totalPages ?? 1));

    // Build sheetNames and drawingSets maps from stored page data
    const sheetNames: Record<number, string> = {};
    const drawingSets: Record<number, string> = {};
    for (const p of pages) {
      if (p.name) sheetNames[p.pageNum] = p.name;
      if (p.drawingSet) drawingSets[p.pageNum] = p.drawingSet;
    }

    return NextResponse.json({
      project: {
        ...project,
        thumbnail,
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
    console.error("[project route]", err);
    // BUG-A5-6-087: return generic error message, do not leak err.message
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PUT = withCache({ noStore: true }, async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-085: add rate limiting to project CRUD
  const limitedPut = rateLimitResponse(req);
  if (limitedPut) return limitedPut;

  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const raw = await req.json();
    const validated = validateBody(ProjectPutSchema, raw);
    if ('error' in validated) return validated.error;
    const body = validated.data;

    // If the body contains a `state` payload (autosave from client), persist
    // the scale from that state. Polygons/classifications are synced individually
    // via their own endpoints as they're created, so we only need to handle scale here.
    const state = body.state;
    if (state?.scale) {
      const s = state.scale;
      await setScale(id, {
        pixelsPerUnit: s.pixelsPerUnit,
        unit: s.unit as 'ft' | 'in' | 'm' | 'cm' | 'mm',
        label: s.label || 'Custom',
        source: (s.source || 'manual') as 'auto' | 'manual' | 'ai',
        pageNumber: s.pageNumber || 1,
        confidence: s.confidence,
      }).catch(() => null); // non-fatal
    }

    // Update project metadata (name, totalPages) if provided — extract only safe fields
    const metaPatch: { name?: string; totalPages?: number } = {};
    if (body.name) metaPatch.name = body.name;
    if (state?.totalPages && state.totalPages > 0) {
      metaPatch.totalPages = state.totalPages;
    }
    const updated = await updateProject(id, metaPatch);
    if (!updated) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ project: updated });
  } catch (err: unknown) {
    console.error("[project route]", err);
    // BUG-A5-6-087: return generic error message, do not leak err.message
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const PATCH = withCache({ noStore: true }, async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-085: add rate limiting to project CRUD
  const limitedPatch = rateLimitResponse(req);
  if (limitedPatch) return limitedPatch;

  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const body = await req.json();
    const patch: Partial<Pick<ProjectMeta, 'name' | 'thumbnail'>> = {};
    // BUG-A5-6-086: reject oversized thumbnails (~375KB limit)
    if (typeof body.thumbnail === 'string') {
      if (body.thumbnail.length > 500_000) {
        return NextResponse.json({ error: 'Thumbnail too large (max ~375KB)' }, { status: 400 });
      }
      patch.thumbnail = body.thumbnail;
    }
    if (typeof body.name === 'string') {
      if (body.name.trim().length === 0 || body.name.length > 200) {
        return NextResponse.json({ error: 'name must be between 1 and 200 characters' }, { status: 400 });
      }
      patch.name = body.name;
    }
    const updated = await updateProject(id, patch);
    if (!updated) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ project: updated });
  } catch (err: unknown) {
    // BUG-A5-6-087: return generic error message, do not leak err.message
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const DELETE = withCache({ noStore: true }, async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-085: add rate limiting to project CRUD
  const limitedDelete = rateLimitResponse(_req);
  if (limitedDelete) return limitedDelete;

  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const ok = await deleteProject(id);
    if (!ok) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ ok });
  } catch (err: unknown) {
    console.error("[project route]", err);
    // BUG-A5-6-087: return generic error message, do not leak err.message
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
