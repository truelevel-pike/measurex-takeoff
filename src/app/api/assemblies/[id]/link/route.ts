/**
 * POST /api/assemblies/[id]/link  — link assembly to a classificationId
 * Body: { classificationId: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { linkAssemblyToClassification } from '@/server/assembly-store';

const LinkSchema = z.object({ classificationId: z.string().min(1) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const parsed = LinkSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    const updated = await linkAssemblyToClassification(id, parsed.data.classificationId);
    if (!updated) return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    return NextResponse.json({ assembly: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
