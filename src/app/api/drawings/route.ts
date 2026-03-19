import { NextResponse } from 'next/server';
import { DrawingBodySchema } from '@/lib/api-schemas';
import { validateBody } from '@/lib/api/validate';

export async function GET() {
  // Placeholder for drawings listing if needed
  return NextResponse.json({ drawings: [] });
}

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const validated = validateBody(DrawingBodySchema, raw);
    if ('error' in validated) return validated.error;
    return NextResponse.json({ ok: true, body: validated.data });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Upload failed') }, { status: 500 });
  }
}
