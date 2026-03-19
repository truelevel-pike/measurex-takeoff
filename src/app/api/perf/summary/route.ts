import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ events: [], note: 'no perf data yet' });
    }
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('mx_perf_events')
      .select('*')
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
