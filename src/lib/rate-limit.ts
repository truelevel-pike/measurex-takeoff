/**
 * In-memory sliding-window rate limiter.
 * Stores request timestamps per IP in a Map; prunes entries older than the window.
 */

const DEFAULT_MAX = 10;
const DEFAULT_WINDOW_MS = 60_000; // 60 seconds

// IP -> list of request timestamps (ms)
const hits: Map<string, number[]> = new Map();

// REG-002 fix (BUG-A5-3-406): Prune stale IP entries every 5 minutes to prevent unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of hits) {
    // Remove IPs whose entire timestamp history is older than the longest possible window (10 min).
    // Using a generous 10-minute TTL so entries survive any reasonable window size.
    if (timestamps.every((t) => now - t >= 10 * 60_000)) {
      hits.delete(ip);
    }
  }
}, 5 * 60_000);

interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the oldest entry in the window expires (for Retry-After header) */
  retryAfterSec: number;
}

/**
 * Check whether `ip` is within the rate limit.
 * Call this at the top of a route handler; if `allowed` is false, return 429.
 */
export function checkRateLimit(
  ip: string,
  max: number = DEFAULT_MAX,
  windowMs: number = DEFAULT_WINDOW_MS,
): RateLimitResult {
  const now = Date.now();
  const timestamps = hits.get(ip) ?? [];

  // Prune entries older than the window
  const valid = timestamps.filter((t) => now - t < windowMs);

  // REG-001 fix (BUG-A5-3-407): Check the limit BEFORE recording the current timestamp.
  // Previously, the timestamp was pushed first, so a request at the exact limit boundary
  // would reset the window instead of being rejected.
  if (valid.length >= max) {
    // Oldest entry determines when the window resets
    const oldest = valid[0];
    const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  // Request is within limits — now record it.
  valid.push(now);
  hits.set(ip, valid);
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Helper that returns a 429 NextResponse if the request is rate-limited,
 * or null if the request is allowed.
 */
export function rateLimitResponse(req: Request, max?: number, windowMs?: number): Response | null {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  const { allowed, retryAfterSec } = checkRateLimit(ip, max, windowMs);
  if (allowed) return null;

  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}
