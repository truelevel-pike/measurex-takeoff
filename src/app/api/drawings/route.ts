import { NextResponse } from 'next/server';

export async function GET() {
  // Placeholder for drawings listing if needed
  return NextResponse.json({ drawings: [] });
}

export async function POST(req: Request) {
  try {
    // TODO: Add Zod validation when drawing upload schema is finalized
    // Placeholder for drawing uploads (would use storage service)
    const body = await req.json();
    return NextResponse.json({ ok: true, body });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Upload failed') }, { status: 500 });
  }
}
