import { NextResponse } from 'next/server';
import { getMetrics } from '@/lib/perf-monitor';

export async function GET() {
  return NextResponse.json({ metrics: getMetrics(), timestamp: Date.now() });
}
