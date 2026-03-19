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

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Cache Next.js static assets, fonts, icons with CacheFirst
    {
      matcher: ({ request, url }) =>
        url.pathname.startsWith("/_next/static/") ||
        request.destination === "font" ||
        request.destination === "image",
      handler: new CacheFirst({
        cacheName: "static-assets",
      }),
    },
    // Cache PDF files (cache first — they don't change)
    {
      matcher: ({ url }) => /\.pdf$/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: "pdf-files",
      }),
    },
    // Cache images (stale while revalidate)
    {
      matcher: ({ url }) => /\.(png|jpg|jpeg|svg|gif|webp|ico)$/.test(url.pathname),
      handler: new StaleWhileRevalidate({
        cacheName: "images",
      }),
    },
    // Cache project API data with NetworkFirst
    {
      matcher: ({ url }) => /^\/api\/projects/.test(url.pathname),
      handler: new NetworkFirst({
        cacheName: "api-projects",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 86400,
          }),
        ],
      }),
    },
    // Other API routes: NetworkFirst with 3s timeout
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "api-cache",
        networkTimeoutSeconds: 3,
      }),
    },
    // Include default Next.js caching strategies
    ...defaultCache,
  ],
});

serwist.addEventListeners();
