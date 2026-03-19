import { NextResponse } from 'next/server';
import { getAllExperiments } from '@/lib/ab-testing';

export async function GET(req: Request) {
  const cookieHeader = req.headers.get('cookie') ?? undefined;
  const experiments = getAllExperiments(cookieHeader);
  return NextResponse.json({ experiments });
}
