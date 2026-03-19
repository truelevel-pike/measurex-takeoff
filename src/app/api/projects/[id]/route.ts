import { NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject, initDataDir, getClassifications, getPolygons, getScale, setScale, getPages, getThumbnail } from '@/server/project-store';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    // Validate id is a safe UUID/alphanumeric string
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Bundle full state so the client can hydrate in a single round-trip
    const [classifications, polygons, scale, pages, thumbnail] = await Promise.all([
      getClassifications(id).catch(() => [] as any[]),
      getPolygons(id).catch(() => [] as any[]),
      getScale(id).catch(() => null),
      getPages(id).catch((e) => { console.error('getPages error:', e); return [] as any[]; }),
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
  } catch (err: any) {
    console.error("[project route]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    // Validate id is a safe UUID/alphanumeric string
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }
    const body = await req.json();

    // If the body contains a `state` payload (autosave from client), persist
    // the scale from that state. Polygons/classifications are synced individually
    // via their own endpoints as they're created, so we only need to handle scale here.
    const state = body.state;
    if (state?.scale) {
      const s = state.scale;
      await setScale(id, {
        pixelsPerUnit: s.pixelsPerUnit,
        unit: s.unit,
        label: s.label || 'Custom',
        source: s.source || 'manual',
        pageNumber: s.pageNumber || 1,
        confidence: s.confidence,
      }).catch(() => null); // non-fatal
    }

    // Update project metadata (name, totalPages) if provided — extract only safe fields
    const metaPatch: { name?: string; totalPages?: number } = {};
    if (typeof body.name === 'string') metaPatch.name = body.name;
    if (typeof state?.totalPages === 'number' && state.totalPages > 0) {
      metaPatch.totalPages = state.totalPages;
    }
    const updated = await updateProject(id, metaPatch);
    return NextResponse.json({ project: updated });
  } catch (err: any) {
    console.error("[project route]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (typeof body.thumbnail === 'string') patch.thumbnail = body.thumbnail;
    const updated = await updateProject(id, patch as any);
    return NextResponse.json({ project: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    // Validate id is a safe UUID/alphanumeric string
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }
    const ok = await deleteProject(id);
    return NextResponse.json({ ok });
  } catch (err: any) {
    console.error("[project route]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
