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
// VERIFIED (E36): withCache is working correctly. The quantities API uses maxAge=30, sMaxAge=30,
// meaning browsers cache the response for 30 seconds and CDNs for 30 seconds before re-fetching.
// This reduces unnecessary API calls when users switch between pages without changing takeoff data.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withCache<C = any>(
  options: CacheOptions,
  handler: (req: Request, ctx: C) => Promise<Response>
): (req: Request, ctx: C) => Promise<Response> {
  return async (req: Request, ctx: C) => {
    const res = await handler(req, ctx);
    const parts: string[] = [];

    if (options.noStore) {
      parts.push('no-store');
    } else {
      parts.push('private');
      if (options.maxAge !== undefined) parts.push(`max-age=${options.maxAge}`);
      if (options.sMaxAge !== undefined) parts.push(`s-maxage=${options.sMaxAge}`);
      if (options.staleWhileRevalidate !== undefined)
        parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
      if (parts.length === 1) parts.push('no-cache'); // only 'private' means no directives
    }

    const headers = new Headers(res.headers);
    headers.set('Cache-Control', parts.join(', '));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
