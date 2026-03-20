/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { defaultCache } from "@serwist/next/worker";
import {
  Serwist,
  CacheFirst,
  StaleWhileRevalidate,
  NetworkFirst,
  ExpirationPlugin,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// BUG-A8-4-L009: defer skipWaiting until the page explicitly requests it
// via a "SKIP_WAITING" message, so in-progress operations are not disrupted.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // BUG-A8-5-007 fix: route matchers ordered from most-specific to least-specific
    // to avoid overlap. Each URL matches at most one rule.

    // 1. Next.js static build assets — CacheFirst (content-hashed, safe to cache forever)
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "static-assets",
      }),
    },
    // 2. PDF files from API — NetworkFirst with expiry so re-uploads are reflected
    //    BUG-A8-5-023 fix: was CacheFirst with no expiry; re-uploaded PDFs were never refreshed.
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/") && /\.pdf$|\/pdf$/.test(url.pathname),
      handler: new NetworkFirst({
        cacheName: "pdf-files",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 10,
            maxAgeSeconds: 3600, // 1 hour
          }),
        ],
      }),
    },
    // 3. Project API data — NetworkFirst with reduced TTL
    //    BUG-A8-5-022 fix: was 86400s (24h); deleted projects appeared in list for up to 24h.
    {
      matcher: ({ url }) => /^\/api\/projects/.test(url.pathname),
      handler: new NetworkFirst({
        cacheName: "api-projects",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 300, // 5 minutes
          }),
        ],
      }),
    },
    // 4. Other API routes — NetworkFirst with 3s timeout (no caching of sensitive data)
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "api-cache",
        networkTimeoutSeconds: 3,
      }),
    },
    // 5. Fonts — CacheFirst (versioned by CDN, safe to cache)
    {
      matcher: ({ request }) => request.destination === "font",
      handler: new CacheFirst({
        cacheName: "fonts",
        plugins: [
          new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
      }),
    },
    // 6. Static images (non-API) — StaleWhileRevalidate
    {
      matcher: ({ url }) =>
        !url.pathname.startsWith("/api/") &&
        /\.(png|jpg|jpeg|svg|gif|webp|ico)$/.test(url.pathname),
      handler: new StaleWhileRevalidate({
        cacheName: "images",
        plugins: [
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
      }),
    },
    // Include default Next.js caching strategies
    ...defaultCache,
  ],
});

serwist.addEventListeners();
