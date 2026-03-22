// Middleware: optional API key auth for /api/projects/* routes.
// If API_KEY env var is set, requests to /api/projects/* must include either:
//   - Header: x-api-key: <value>
//   - Query param: ?apiKey=<value>
// If API_KEY is NOT set, all requests pass through (dev mode).
// CSP is handled by next.config.ts static headers.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
  const apiKey = process.env.API_KEY;

  // If API_KEY is configured, enforce it on /api/projects/* requests
  if (apiKey) {
    const headerKey = request.headers.get('x-api-key');
    const queryKey = request.nextUrl.searchParams.get('apiKey');
    if (headerKey !== apiKey && queryKey !== apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Enforce API key auth on all project endpoints
    '/api/projects/:path*',
  ],
};
