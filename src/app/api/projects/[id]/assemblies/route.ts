import { NextResponse } from 'next/server';
import { getAssemblies, createAssembly, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/app/api/ws/route';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const assemblies = await getAssemblies(id);
    return NextResponse.json({ assemblies });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const body = await req.json();
    const { classificationId, name, unit, unitCost, quantityFormula } = body;
    if (!classificationId || !name) {
      return NextResponse.json({ error: 'classificationId and name required' }, { status: 400 });
    }
    const assembly = await createAssembly(id, {
      classificationId,
      name,
      unit: unit || 'SF',
      unitCost: unitCost ?? 0,
      quantityFormula: quantityFormula || 'area',
    });
    broadcastToProject(id, 'assembly:created', assembly);
    return NextResponse.json({ assembly });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
