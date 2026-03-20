import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import withSerwistInit from "@serwist/next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  turbopack: {},
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // BUG-A8-003 fix: narrow connect-src from "wss: https:" (any host)
            // to explicit trusted origins only.
            // BUG-A8-010 fix: remove blob: from script-src-elem — service worker
            // is served from /sw.js (same origin), not a blob URL. Dynamically
            // created blob scripts are an XSS vector.
            // Also removed esm.sh from script-src (arbitrary user packages).
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // R-A8-007 fix: gate 'unsafe-eval' to dev only (required by webpack HMR + pdf.js eval).
              // BUG-A8-5-008 fix: remove 'unsafe-inline' from production script-src.
              // Per-request nonces are injected by src/middleware.ts for HTML pages;
              // this static header is only a fallback for non-HTML assets.
              `script-src 'self' ${process.env.NODE_ENV === "development" ? "'unsafe-eval' 'unsafe-inline'" : ""} https://cdn.jsdelivr.net`,
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              // BUG-A8-4-L017 fix: narrow img-src from all HTTPS to specific trusted origins
              "img-src 'self' data: blob: https://*.supabase.co",
              "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
              // Narrowed: only self + Supabase domains + project-specific WebSocket host.
              // BUG-A8-4-002: AI calls are exclusively server-proxied via /api/ai-takeoff,
              // so no external AI API domains are needed in connect-src.
              // BUG-A8-5-038 fix: warn at build time in production if NEXT_PUBLIC_APP_HOST is
              // not set — prevents silent CSP breakage where wss://localhost:3000 is emitted.
              // NOTE: Changed from hard throw to warn+default so CI/preview builds succeed even
              // when the env var is not configured. Operators should always set this in production.
              (() => {
                if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_APP_HOST) {
                  console.warn(
                    '[next.config.ts] WARNING: NEXT_PUBLIC_APP_HOST is not set in production. ' +
                    'Set it to your deployment hostname (e.g. app.measurex.io). ' +
                    'Without it the CSP connect-src falls back to wss://localhost:3000 ' +
                    'which will block real-time WebSocket connections in production.'
                  );
                }
                const host = process.env.NEXT_PUBLIC_APP_HOST ?? 'localhost:3000';
                return `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://*.supabase.co"} wss://${host} https://*.supabase.co`;
              })(),
              // BUG-A8-4-003: blob: is in worker-src because pdfjs-dist dynamically creates
              // a blob-URL Web Worker at runtime (via new Worker(URL.createObjectURL(blob))).
              // blob: is intentionally NOT in script-src (removed in BUG-A8-010) because
              // script-src blob: would also allow arbitrary script execution.
              "worker-src blob: 'self' https://cdn.jsdelivr.net",
              // script-src-elem: blob: removed (BUG-A8-010)
              "script-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              // BLOCKER-002 fix: allow same-origin framing so OpenClaw sandbox browser can load the app.
              // X-Frame-Options: DENY (below) is removed in favor of CSP frame-ancestors which is more flexible.
              "frame-ancestors 'self'",
            ].join("; "),
          },
          // BLOCKER-001 fix: removed X-Frame-Options: DENY — was blocking OpenClaw sandbox iframe.
          // Framing is now controlled by CSP frame-ancestors 'self' above (more precise, supersedes XFO).
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // R-A8-011 fix: add HSTS header to prevent SSL-stripping
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/api/ws",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-transform" },
          { key: "Connection", value: "keep-alive" },
          { key: "X-Accel-Buffering", value: "no" },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(withSerwist(nextConfig));
