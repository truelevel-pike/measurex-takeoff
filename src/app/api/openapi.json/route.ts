import { NextResponse } from 'next/server';
import spec from '../openapi-spec.json';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const limited = rateLimitResponse(req, 30, 60_000);
  if (limited) return limited;

  return NextResponse.json(spec);
}
