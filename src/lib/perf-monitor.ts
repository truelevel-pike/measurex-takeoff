import type { CLSMetric, FCPMetric, INPMetric, LCPMetric, TTFBMetric } from 'web-vitals';

// ---------------------------------------------------------------------------
// Lightweight server-side performance monitor — stores last N API calls
// Uses globalThis to survive Next.js hot reload in dev
// ---------------------------------------------------------------------------

interface PerfRecord {
  route: string;
  durationMs: number;
  statusCode: number;
  timestamp: number;
}

const MAX_RECORDS = 200;

function getBuffer(): PerfRecord[] {
  if (!(globalThis as Record<string, unknown>).__perfMetrics) {
    (globalThis as Record<string, unknown>).__perfMetrics = [];
  }
  return (globalThis as Record<string, unknown>).__perfMetrics as PerfRecord[];
}

export function recordApiCall(route: string, durationMs: number, statusCode: number): void {
  const buf = getBuffer();
  buf.push({ route, durationMs, statusCode, timestamp: Date.now() });
  // Trim to max
  if (buf.length > MAX_RECORDS) buf.splice(0, buf.length - MAX_RECORDS);
}

export interface RouteMetrics {
  route: string;
  avgMs: number;
  p95Ms: number;
  count: number;
  errorRate: number;
}

export function getMetrics(): RouteMetrics[] {
  const buf = getBuffer();
  const byRoute = new Map<string, PerfRecord[]>();
  for (const rec of buf) {
    if (!byRoute.has(rec.route)) byRoute.set(rec.route, []);
    byRoute.get(rec.route)!.push(rec);
  }

  const result: RouteMetrics[] = [];
  for (const [route, records] of byRoute) {
    const durations = records.map((r) => r.durationMs).sort((a, b) => a - b);
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? durations[durations.length - 1] ?? 0;
    const errors = records.filter((r) => r.statusCode >= 400).length;
    result.push({
      route,
      avgMs: Math.round(avg),
      p95Ms: Math.round(p95),
      count: records.length,
      errorRate: Math.round((errors / records.length) * 1000) / 1000,
    });
  }
  return result.sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Client-side Web Vitals monitoring types & initializer
// web-vitals is imported dynamically in initPerfMonitor to avoid server-side issues
// ---------------------------------------------------------------------------

export type VitalsMetric = {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
};

export type PerfMonitorOptions = {
  /** Send to endpoint (e.g. /api/perf) — POST JSON. Optional. */
  reportUrl?: string;
  /** Log to console (default: process.env.NODE_ENV !== 'production') */
  logToConsole?: boolean;
  /** Additional tags to attach to every metric */
  tags?: Record<string, string>;
};

// BUG-A6-006 fix: module-level guard so web-vitals listeners are only registered once,
// regardless of how many times initPerfMonitor is called (StrictMode double-mount, hot-reload).
let _perfMonitorInitialized = false;

export async function initPerfMonitor(options: PerfMonitorOptions = {}) {
  if (_perfMonitorInitialized) return;
  _perfMonitorInitialized = true;

  const { reportUrl, logToConsole = process.env.NODE_ENV !== 'production', tags = {} } = options;

  type WebVitalMetric = CLSMetric | FCPMetric | INPMetric | LCPMetric | TTFBMetric;

  function handleMetric(metric: WebVitalMetric) {
    if (logToConsole) {
      const emoji = metric.rating === 'good' ? '✅' : metric.rating === 'needs-improvement' ? '⚠️' : '❌';
      console.log(`[Perf] ${emoji} ${metric.name}: ${metric.value.toFixed(1)} (${metric.rating})`);
    }

    if (reportUrl) {
      const body = JSON.stringify({ ...metric, ...tags, timestamp: Date.now() });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(reportUrl, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(reportUrl, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
      }
    }
  }

  const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import('web-vitals');
  onCLS((metric) => handleMetric(metric));
  onFCP((metric) => handleMetric(metric));
  onINP((metric) => handleMetric(metric));
  onLCP((metric) => handleMetric(metric));
  onTTFB((metric) => handleMetric(metric));
}
