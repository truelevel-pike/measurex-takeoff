import { NextResponse } from 'next/server';
import { getFlags } from '@/lib/feature-flags';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    const limited = rateLimitResponse(req, 60, 60_000);
    if (limited) return limited;

    return NextResponse.json({ flags: getFlags() });
  } catch (err) {
    console.error('Feature flags error:', err);
    return NextResponse.json({ error: 'Failed to retrieve flags' }, { status: 500 });
  }
}
