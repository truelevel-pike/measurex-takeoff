/**
 * GET /api/classifications/[id]/assembly
 * Returns the global assembly linked to a given classificationId, or 404.
 */

import { NextResponse } from 'next/server';
import { getAssemblyForClassification, listAssemblyMaterials } from '@/server/assembly-store';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const assembly = await getAssemblyForClassification(id);
    if (!assembly) return NextResponse.json({ error: 'No assembly linked' }, { status: 404 });
    const materials = await listAssemblyMaterials(assembly.id);
    return NextResponse.json({ assembly: { ...assembly, materials } });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
