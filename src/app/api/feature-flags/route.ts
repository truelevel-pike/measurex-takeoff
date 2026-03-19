import { NextResponse } from 'next/server';
import { getFlags } from '@/lib/feature-flags';

export async function GET() {
  return NextResponse.json({ flags: getFlags() });
}
