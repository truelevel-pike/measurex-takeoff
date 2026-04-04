/**
 * PUT    /api/assemblies/[id]/materials/[mid] — update a material line item
 * DELETE /api/assemblies/[id]/materials/[mid] — remove a material line item
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateAssemblyMaterial, deleteAssemblyMaterial } from '@/server/assembly-store';

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  quantityPerUnit: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  try {
    const { mid } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    const updated = await updateAssemblyMaterial(mid, parsed.data);
    if (!updated) return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    return NextResponse.json({ material: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  try {
    const { mid } = await params;
    const ok = await deleteAssemblyMaterial(mid);
    if (!ok) return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
