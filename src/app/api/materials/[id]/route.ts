/**
 * PUT    /api/materials/[id] — update material library item
 * DELETE /api/materials/[id] — delete material library item
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateMaterialLibraryItem, deleteMaterialLibraryItem } from '@/server/assembly-store';

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  defaultUnitCost: z.number().min(0).optional(),
  category: z.string().min(1).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    const updated = await updateMaterialLibraryItem(id, parsed.data);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ material: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ok = await deleteMaterialLibraryItem(id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
