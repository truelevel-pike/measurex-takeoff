import { NextResponse } from 'next/server';

export async function GET() {
  // Placeholder for polygon listing; real impl would query project state
  return NextResponse.json({ polygons: [] });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Placeholder persists; real impl would update project state in DB
    return NextResponse.json({ ok: true, polygon: body });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Persist failed') }, { status: 500 });
  }
}
