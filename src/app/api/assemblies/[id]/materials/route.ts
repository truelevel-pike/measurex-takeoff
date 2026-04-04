/**
 * GET  /api/assemblies/[id]/materials   — list materials for an assembly
 * POST /api/assemblies/[id]/materials   — add a material to an assembly
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listAssemblyMaterials, addAssemblyMaterial, getAssembly } from '@/server/assembly-store';

const MaterialSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  quantityPerUnit: z.number().min(0),
  unitCost: z.number().min(0),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const materials = await listAssemblyMaterials(id);
    return NextResponse.json({ materials });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const assembly = await getAssembly(id);
    if (!assembly) return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const parsed = MaterialSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    const material = await addAssemblyMaterial(id, parsed.data);
    return NextResponse.json({ material }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
