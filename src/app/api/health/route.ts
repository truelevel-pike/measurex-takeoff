import { NextResponse } from 'next/server';
import { isConfigured, getSupabase } from '@/lib/supabase';
import { promises as fs } from 'fs';
import path from 'path';

const startTime = Date.now();

export async function GET(req: Request) {
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

  // Check whether GEMINI_API_KEY is configured
  const geminiConnected = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  // Check whether the data directory is writable
  let storageWritable = false;
  try {
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    const probe = path.join(dataDir, `.health-probe-${Date.now()}`);
    await fs.writeFile(probe, '');
    await fs.unlink(probe);
    storageWritable = true;
  } catch {
    storageWritable = false;
  }

  // Read version from package.json (cached after first read)
  let version = 'unknown';
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
    version = pkg.version ?? 'unknown';
  } catch {
    // ignore
  }

  // Resolve the app's base URL — same logic as /api/agent/session
  const rawHost = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_HOST ?? '';
  const appUrl = rawHost.startsWith('http') ? rawHost : rawHost ? `https://${rawHost}` : '';

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    supabaseConnected,
    geminiConnected,
    storageWritable,
    version,
    appUrl: appUrl || undefined,
    agentUrl: appUrl ? `${appUrl}/agent` : undefined,
  });
}
