import { NextResponse } from 'next/server';
import { isConfigured, getSupabase } from '@/lib/supabase';

// Read version once at module load
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../../../package.json');

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
    version,
  });
}
