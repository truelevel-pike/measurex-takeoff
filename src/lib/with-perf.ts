import { recordApiCall } from './perf-monitor';

/**
 * withPerf wraps a Next.js route handler, times it, and records the result.
 * Usage: export const GET = withPerf('/api/projects', handler);
 */
export function withPerf(
  route: string,
  handler: (req: Request, ctx?: unknown) => Promise<Response>
): (req: Request, ctx?: unknown) => Promise<Response> {
  return async (req: Request, ctx?: unknown) => {
    const start = Date.now();
    let status = 500;
    try {
      const res = await handler(req, ctx);
      status = res.status;
      return res;
    } catch (err) {
      // BUG-A5-6-194: wrap raw errors in a 500 Response instead of re-throwing
      console.error(`[withPerf] ${route} threw:`, err);
      status = 500;
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    } finally {
      recordApiCall(route, Date.now() - start, status);
    }
  };
}
