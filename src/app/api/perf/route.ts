import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const MetricSchema = z.object({
  name: z.enum(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  delta: z.number(),
  id: z.string(),
  timestamp: z.number().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const parsed = MetricSchema.safeParse(body);
  if (!parsed.success) {
    console.warn('[Perf API] Invalid metric:', parsed.error.flatten());
    return NextResponse.json({ error: 'Invalid metric payload' }, { status: 400 });
  }

  // Dev: log it
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Perf Event]', parsed.data);
  }

  // BUG-A5-5-013: use singleton getSupabase() instead of fresh client per request
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const supabase = getSupabase();
    await supabase.from('mx_perf_events').insert(parsed.data);
  } catch {
    // Table may not exist yet — that's OK
  }

  return NextResponse.json({ ok: true });
}
