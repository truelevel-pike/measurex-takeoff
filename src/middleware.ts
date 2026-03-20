// BUG-A8-5-008 fix: generate a per-request nonce for CSP script-src instead
// of using 'unsafe-inline' in production. The nonce is placed in:
//   - The `Content-Security-Policy` response header (via headers() override in next.config.ts
//     this middleware sets x-nonce so the header builder can include it).
//   - A response header `x-nonce` so layout.tsx can read it and inject into <script> tags.
//
// NOTE: next.config.ts headers() runs at build time and cannot generate per-request values.
// Middleware runs per-request and CAN set dynamic headers that Next.js forwards to the page
// via request headers. We set `x-nonce` on the request so layout.tsx can call
// headers() to read it and pass it to any inline <script> elements.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function generateNonce(): string {
  // Use crypto.getRandomValues for a 16-byte random nonce, base64-encoded
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64');
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();

  const isDev = process.env.NODE_ENV === 'development';

  // Build CSP — identical to next.config.ts but with per-request nonce instead of 'unsafe-inline'
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    // In dev, also allow unsafe-eval for webpack HMR
    ...(isDev ? ["'unsafe-eval'"] : []),
    // pdf.js loads its worker from CDN
    'https://cdn.jsdelivr.net',
  ].join(' ');

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
    `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://*.supabase.co'} wss://${process.env.NEXT_PUBLIC_APP_HOST ?? 'localhost:3000'} https://*.supabase.co`,
    "worker-src blob: 'self' https://cdn.jsdelivr.net",
    `script-src-elem 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net`,
    "frame-ancestors 'self'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  // Pass nonce to the page so layout.tsx can read it via next/headers
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set CSP on the response (overrides the static one in next.config.ts for matched routes)
  response.headers.set('Content-Security-Policy', csp);
  // Expose nonce to the page via response header as well (for debugging / testing)
  response.headers.set('x-nonce', nonce);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sw.js, manifest.json (public assets that don't need nonce)
     * - API routes (no HTML rendered, CSP not needed)
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|api/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
