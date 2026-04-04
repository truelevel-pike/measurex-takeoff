/**
 * GET    /api/assemblies/[id] — get single assembly with materials
 * PUT    /api/assemblies/[id] — update assembly
 * DELETE /api/assemblies/[id] — delete assembly + all its materials
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAssembly,
  updateGlobalAssembly,
  deleteGlobalAssembly,
  listAssemblyMaterials,
} from '@/server/assembly-store';

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  classificationId: z.string().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const assembly = await getAssembly(id);
    if (!assembly) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const materials = await listAssemblyMaterials(id);
    return NextResponse.json({ assembly: { ...assembly, materials } });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

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
    const updated = await updateGlobalAssembly(id, parsed.data);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const materials = await listAssemblyMaterials(id);
    return NextResponse.json({ assembly: { ...updated, materials } });
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
    const ok = await deleteGlobalAssembly(id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
