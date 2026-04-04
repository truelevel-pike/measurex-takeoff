/**
 * GET  /api/assemblies       — list all global assemblies (with materials)
 * POST /api/assemblies       — create assembly + optional materials
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  listAssemblies,
  createGlobalAssembly,
  listAssemblyMaterials,
  addAssemblyMaterial,
} from '@/server/assembly-store';

const MaterialSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  quantityPerUnit: z.number().min(0),
  unitCost: z.number().min(0),
});

const CreateBodySchema = z.object({
  name: z.string().min(1),
  classificationId: z.string().optional(),
  materials: z.array(MaterialSchema).optional(),
});

export async function GET() {
  try {
    const assemblies = await listAssemblies();
    const allMaterials = await listAssemblyMaterials();
    const matsByAssembly = new Map<string, typeof allMaterials>();
    for (const m of allMaterials) {
      const arr = matsByAssembly.get(m.assemblyId) ?? [];
      arr.push(m);
      matsByAssembly.set(m.assemblyId, arr);
    }
    const result = assemblies.map((a) => ({
      ...a,
      materials: matsByAssembly.get(a.id) ?? [],
    }));
    return NextResponse.json({ assemblies: result });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const parsed = CreateBodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    const { name, classificationId, materials = [] } = parsed.data;
    const assembly = await createGlobalAssembly({ name, classificationId });
    const savedMaterials = await Promise.all(
      materials.map((m) => addAssemblyMaterial(assembly.id, m)),
    );
    return NextResponse.json({ assembly: { ...assembly, materials: savedMaterials } }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
