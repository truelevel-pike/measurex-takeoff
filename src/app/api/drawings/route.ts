import { NextResponse } from 'next/server';

export async function GET() {
  // Placeholder for drawings listing if needed
  return NextResponse.json({ drawings: [] });
}

export async function POST(req: Request) {
  try {
    // Placeholder for drawing uploads (would use storage service)
    const body = await req.json();
    return NextResponse.json({ ok: true, body });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
