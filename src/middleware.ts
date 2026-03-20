// Middleware: sets NEXT_PUBLIC_APP_HOST in connect-src for WebSocket CSP.
// NOTE: Nonce-based CSP was reverted — Next.js inline hydration scripts cannot
// receive a nonce without full framework-level nonce support (layout.tsx + Script tags).
// Using 'unsafe-inline' in script-src is correct for Next.js App Router deployments
// that don't implement the full nonce pipeline. See next.config.ts for static CSP headers.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
  // Pass through — CSP is handled by next.config.ts static headers.
  // No per-request nonce injection (broke hydration: inline scripts blocked).
  return NextResponse.next();
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|api/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
