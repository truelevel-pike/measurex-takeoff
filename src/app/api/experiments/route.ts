import { NextResponse } from 'next/server';
import { getAllExperiments } from '@/lib/ab-testing';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    const limited = rateLimitResponse(req);
    if (limited) return limited;

    const cookieHeader = req.headers.get('cookie') ?? undefined;
    const experiments = getAllExperiments(cookieHeader);
    return NextResponse.json({ experiments });
  } catch (err) {
    console.error('Experiments error:', err);
    return NextResponse.json({ error: 'Failed to retrieve experiments' }, { status: 500 });
  }
}
