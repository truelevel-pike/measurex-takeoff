import { NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject, initDataDir, getClassifications, getPolygons, getScale } from '@/server/project-store';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Bundle full state so the client can hydrate in a single round-trip
    const [classifications, polygons, scale] = await Promise.all([
      getClassifications(id).catch(() => []),
      getPolygons(id).catch(() => []),
      getScale(id).catch(() => null),
    ]);

    return NextResponse.json({
      project: {
        ...project,
        state: {
          classifications,
          polygons,
          scale,
          scales: {},
          currentPage: 1,
          totalPages: 1,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const body = await req.json();
    const updated = await updateProject(id, body);
    return NextResponse.json({ project: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const ok = await deleteProject(id);
    return NextResponse.json({ ok });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
