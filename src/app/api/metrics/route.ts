import { NextResponse } from 'next/server';
import { getMetrics } from '@/lib/perf-monitor';

export async function GET() {
  try {
    return NextResponse.json({ metrics: getMetrics(), timestamp: Date.now() });
  } catch (err) {
    console.error('Metrics error:', err);
    return NextResponse.json({ error: 'Failed to retrieve metrics' }, { status: 500 });
  }
}
