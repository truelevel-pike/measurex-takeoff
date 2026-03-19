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
    } finally {
      recordApiCall(route, Date.now() - start, status);
    }
  };
}
