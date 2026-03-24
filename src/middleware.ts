// Middleware: optional API key auth for /api/projects/* routes.
// If API_KEY env var is set, requests to /api/projects/* must include either:
//   - Header: x-api-key: <value>
//   - Query param: ?apiKey=<value>
// If API_KEY is NOT set, all requests pass through (dev mode).
// CSP is handled by next.config.ts static headers.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
};

export function middleware(request: NextRequest): NextResponse {
  // Handle CORS preflight for all API routes
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const apiKey = process.env.API_KEY;

  // If API_KEY is configured, enforce it on /api/projects/* requests
  if (apiKey) {
    const headerKey = request.headers.get('x-api-key');
    const queryKey = request.nextUrl.searchParams.get('apiKey');
    if (headerKey !== apiKey && queryKey !== apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
    }
  }

  const response = NextResponse.next();
  // Inject CORS headers on all API responses in dev (vercel.json handles prod)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    // API key auth + CORS on all API routes
    '/api/:path*',
  ],
};
