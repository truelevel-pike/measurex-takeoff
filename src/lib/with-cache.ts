type CacheOptions = {
  maxAge?: number;               // browser cache seconds
  sMaxAge?: number;              // CDN cache seconds
  staleWhileRevalidate?: number; // seconds
  noStore?: boolean;             // no caching (use for mutations)
};

/**
 * withCache — wraps a route handler and injects Cache-Control headers.
 * Usage: export const GET = withCache({ maxAge: 30, sMaxAge: 60 }, handler);
 */
export function withCache(
  options: CacheOptions,
  handler: (req: Request, ctx?: unknown) => Promise<Response>
): (req: Request, ctx?: unknown) => Promise<Response> {
  return async (req: Request, ctx?: unknown) => {
    const res = await handler(req, ctx);
    const parts: string[] = [];

    if (options.noStore) {
      parts.push('no-store');
    } else {
      if (options.maxAge !== undefined) parts.push(`max-age=${options.maxAge}`);
      if (options.sMaxAge !== undefined) parts.push(`s-maxage=${options.sMaxAge}`);
      if (options.staleWhileRevalidate !== undefined)
        parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
      if (parts.length === 0) parts.push('no-cache');
    }

    const headers = new Headers(res.headers);
    headers.set('Cache-Control', parts.join(', '));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
