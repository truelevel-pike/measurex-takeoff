import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getMetrics } from '@/lib/perf-monitor';

export async function GET(req: Request) {
  try {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const secretBuffer = Buffer.from(adminSecret);
    const headerBuffer = Buffer.from(req.headers.get('x-admin-secret') ?? '');
    if (secretBuffer.length !== headerBuffer.length || !timingSafeEqual(secretBuffer, headerBuffer)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ metrics: getMetrics(), timestamp: Date.now() });
  } catch (err) {
    console.error('Metrics error:', err);
    return NextResponse.json({ error: 'Failed to retrieve metrics' }, { status: 500 });
  }
}
