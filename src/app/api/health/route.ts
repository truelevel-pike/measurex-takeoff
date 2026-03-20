import { NextResponse } from 'next/server';
import { isConfigured, getSupabase } from '@/lib/supabase';

const startTime = Date.now();

export async function GET() {
  let supabaseConnected = false;

  if (isConfigured()) {
    try {
      const sb = getSupabase();
      const { error } = await sb.from('projects').select('id', { count: 'exact', head: true });
      supabaseConnected = !error;
    } catch {
      supabaseConnected = false;
    }
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    supabaseConnected,
  });
}
