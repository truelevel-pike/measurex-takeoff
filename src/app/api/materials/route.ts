/**
 * GET  /api/materials              — list all material library items (?category= filter)
 * POST /api/materials              — create a new material library item
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listMaterialLibrary, createMaterialLibraryItem } from '@/server/assembly-store';

const CreateSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  defaultUnitCost: z.number().min(0),
  category: z.string().min(1),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') ?? undefined;
    const materials = await listMaterialLibrary(category);
    return NextResponse.json({ materials });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    const material = await createMaterialLibraryItem(parsed.data);
    return NextResponse.json({ material }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
