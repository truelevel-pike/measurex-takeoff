import { NextResponse } from 'next/server';
import spec from '../openapi-spec.json';

export async function GET() {
  return NextResponse.json(spec, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
