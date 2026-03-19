import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAssemblies, createAssembly, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/app/api/ws/route';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';

const AssemblyBodySchema = z.object({
  classificationId: z.string().uuid(),
  name: z.string().min(1),
}).passthrough();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const assemblies = await getAssemblies(id);
    return NextResponse.json({ assemblies });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = AssemblyBodySchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);
    const { classificationId, name, unit, unitCost, quantityFormula } = body;
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
