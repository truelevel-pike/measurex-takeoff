import { NextResponse } from 'next/server';
import { getFlags } from '@/lib/feature-flags';

export async function GET() {
  try {
    return NextResponse.json({ flags: getFlags() });
  } catch (err) {
    console.error('Feature flags error:', err);
    return NextResponse.json({ error: 'Failed to retrieve flags' }, { status: 500 });
  }
}
