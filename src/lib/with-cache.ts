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
      parts.push('public');
      if (options.maxAge !== undefined) parts.push(`max-age=${options.maxAge}`);
      if (options.sMaxAge !== undefined) parts.push(`s-maxage=${options.sMaxAge}`);
      if (options.staleWhileRevalidate !== undefined)
        parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
      if (parts.length === 1) parts.push('no-cache'); // only 'public' means no directives
    }

    const headers = new Headers(res.headers);
    headers.set('Cache-Control', parts.join(', '));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
