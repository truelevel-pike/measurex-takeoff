import { NextResponse } from 'next/server';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const limited = rateLimitResponse(req, 10, 60_000);
  if (limited) return limited;

  try {
    const { getSupabase, isSupabaseConfigured } = await import('@/lib/supabase');
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ events: [], note: 'no perf data yet' });
    }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('mx_perf_events')
      .select('timestamp, name, value, rating')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ events: [], note: 'no perf data yet' });
    }

    return NextResponse.json({ events: data ?? [] });
  } catch {
    return NextResponse.json({ events: [], note: 'no perf data yet' });
  }
}
