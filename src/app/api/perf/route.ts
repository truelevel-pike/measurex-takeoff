import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitResponse } from '@/lib/rate-limit';

const MetricSchema = z.object({
  name: z.enum(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  delta: z.number(),
  id: z.string(),
  timestamp: z.number().optional(),
}).passthrough(); // allow extra web-vitals fields without rejecting

export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(req, 30, 60_000);
  if (limited) return limited;
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

  try {
    const { getSupabase, isSupabaseConfigured } = await import('@/lib/supabase');
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: true, persisted: false });
    }
    const supabase = getSupabase();
    const { error } = await supabase.from('mx_perf_events').insert(parsed.data);
    if (error) {
      console.warn('[Perf API] Insert failed:', error.message);
      return NextResponse.json({ ok: true, persisted: false });
    }
  } catch (err) {
    console.warn('[Perf API] Insert error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: true, persisted: false });
  }

  return NextResponse.json({ ok: true });
}
