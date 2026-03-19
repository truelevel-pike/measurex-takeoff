/**
 * MeasureX Load Test — Wave 13
 *
 * Spawns 10 concurrent API clients. Each client:
 *   1. Creates a project
 *   2. Creates a classification
 *   3. Creates 20 polygons
 *   4. Gets quantities
 *   5. Exports CSV (contractor report)
 *
 * Reports: requests/sec, avg latency, p99 latency, error rate
 *
 * Usage:
 *   npm run load-test
 *   npm run load-test -- --url http://localhost:3001
 *   npm run load-test -- --workers 5
 */

export {};

const POLYGONS_PER_CLIENT = 20;

type HttpMethod = "GET" | "POST" | "DELETE";

type RequestMetric = {
  endpoint: string;
  method: HttpMethod;
  durationMs: number;
  ok: boolean;
  status?: number;
  error?: string;
};

type LoadConfig = {
  baseUrl: string;
  workers: number;
};

type ProjectCreateResponse = {
  project?: { id?: string };
  id?: string;
};

type ClassificationCreateResponse = {
  classification?: { id?: string };
  id?: string;
};

function parseArgs(argv: string[]): LoadConfig {
  let baseUrl = process.env.MEASUREX_URL || "http://localhost:3000";
  let workers = 10;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--url") {
      baseUrl = argv[i + 1] || baseUrl;
      i++;
    } else if (arg.startsWith("--url=")) {
      baseUrl = arg.slice("--url=".length);
    } else if (arg === "--workers") {
      workers = Number(argv[i + 1] || workers);
      i++;
    } else if (arg.startsWith("--workers=")) {
      workers = Number(arg.slice("--workers=".length));
    }
  }

  if (!Number.isInteger(workers) || workers <= 0) {
    throw new Error(`Invalid --workers value: ${workers}`);
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), workers };
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(sortedValues.length - 1, Math.max(0, rank))];
}

function formatMs(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

// ── Tracked Fetch ──────────────────────────────────────────────────────

async function requestTracked(
  metrics: RequestMetric[],
  baseUrl: string,
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const started = performance.now();

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await parseJsonSafe(res);
    const durationMs = performance.now() - started;

    metrics.push({
      endpoint: path,
      method,
      durationMs,
      ok: res.ok,
      status: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    });

    if (!res.ok) {
      const details = typeof payload === "string" ? payload : JSON.stringify(payload);
      throw new Error(`${method} ${path} failed: HTTP ${res.status} ${details}`);
    }

    return payload;
  } catch (err: unknown) {
    const durationMs = performance.now() - started;
    metrics.push({
      endpoint: path,
      method,
      durationMs,
      ok: false,
      error: errorMessage(err),
    });
    throw err;
  }
}

// ── Test Data Helpers ──────────────────────────────────────────────────

function randomHexColor(): string {
  const hex = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `#${hex}`;
}

function randomPoints(n: number): { x: number; y: number }[] {
  const cx = Math.random() * 800 + 100;
  const cy = Math.random() * 600 + 100;
  const r = Math.random() * 50 + 20;
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return {
      x: Math.round((cx + r * Math.cos(angle)) * 100) / 100,
      y: Math.round((cy + r * Math.sin(angle)) * 100) / 100,
    };
  });
}

// ── Client Workflow ────────────────────────────────────────────────────

async function runClient(
  metrics: RequestMetric[],
  baseUrl: string,
  clientId: number,
): Promise<void> {
  let projectId = "";

  try {
    // 1. Create project
    const projData = (await requestTracked(metrics, baseUrl, "POST", "/api/projects", {
      name: `Load Test Project ${clientId}`,
    })) as ProjectCreateResponse;

    projectId = projData.project?.id || projData.id || "";
    if (!projectId) throw new Error("Create project response missing project id");

    // 2. Create classification
    const classData = (await requestTracked(
      metrics,
      baseUrl,
      "POST",
      `/api/projects/${projectId}/classifications`,
      {
        name: `Area Class ${clientId}`,
        type: "area",
        color: randomHexColor(),
      },
    )) as ClassificationCreateResponse;

    const classificationId = classData.classification?.id || classData.id || "";
    if (!classificationId) throw new Error("Create classification response missing id");

    // 3. Create 20 polygons
    for (let i = 0; i < POLYGONS_PER_CLIENT; i++) {
      await requestTracked(
        metrics,
        baseUrl,
        "POST",
        `/api/projects/${projectId}/polygons`,
        {
          classificationId,
          points: randomPoints(4 + Math.floor(Math.random() * 4)),
          pageNumber: 1,
          label: `poly-${clientId}-${i}`,
        },
      );
    }

    // 4. Get quantities
    await requestTracked(metrics, baseUrl, "GET", `/api/projects/${projectId}/quantities`);

    // 5. Export CSV (contractor report)
    await requestTracked(metrics, baseUrl, "GET", `/api/projects/${projectId}/export/contractor`);
  } finally {
    // Cleanup: delete the project
    if (projectId) {
      try {
        await requestTracked(metrics, baseUrl, "DELETE", `/api/projects/${projectId}`);
      } catch {
        // Cleanup failure already tracked in metrics
      }
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────

function printReport(
  config: LoadConfig,
  metrics: RequestMetric[],
  elapsedMs: number,
): void {
  const total = metrics.length;
  const successes = metrics.filter((m) => m.ok).length;
  const failures = total - successes;
  const errorRate = total === 0 ? 0 : (failures / total) * 100;
  const latencies = metrics.map((m) => m.durationMs).sort((a, b) => a - b);
  const avgLatency = latencies.reduce((s, d) => s + d, 0) / (latencies.length || 1);
  const rps = total / (elapsedMs / 1000);

  const rows: Array<[string, string]> = [
    ["Base URL", config.baseUrl],
    ["Concurrent clients", String(config.workers)],
    ["Polygons per client", String(POLYGONS_PER_CLIENT)],
    ["Total requests", String(total)],
    ["Successful", String(successes)],
    ["Failed", String(failures)],
    ["Requests/sec", rps.toFixed(1)],
    ["Avg latency", formatMs(avgLatency)],
    ["p50 latency", formatMs(percentile(latencies, 50))],
    ["p95 latency", formatMs(percentile(latencies, 95))],
    ["p99 latency", formatMs(percentile(latencies, 99))],
    ["Error rate", formatPct(errorRate)],
    ["Wall time", formatMs(elapsedMs)],
  ];

  const lw = Math.max(...rows.map(([k]) => k.length), "Metric".length);
  const rw = Math.max(...rows.map(([, v]) => v.length), "Value".length);
  const border = `+-${"-".repeat(lw)}-+-${"-".repeat(rw)}-+`;

  console.log("\n══════════════════════════════════════════");
  console.log("  MeasureX Load Test Results");
  console.log("══════════════════════════════════════════");
  console.log(border);
  console.log(`| ${"Metric".padEnd(lw)} | ${"Value".padEnd(rw)} |`);
  console.log(border);
  for (const [metric, value] of rows) {
    console.log(`| ${metric.padEnd(lw)} | ${value.padEnd(rw)} |`);
  }
  console.log(border);

  // Top errors breakdown
  if (failures > 0) {
    const errorMap = new Map<string, number>();
    for (const m of metrics.filter((m) => !m.ok)) {
      const key = m.error || `HTTP ${m.status}`;
      errorMap.set(key, (errorMap.get(key) || 0) + 1);
    }
    const errorRows = [...errorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log("\n  Top Errors:");
    for (const [msg, count] of errorRows) {
      console.log(`    [${count}x] ${msg}`);
    }
  }
  console.log("");
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs(process.argv.slice(2));

  console.log(
    `\nStarting load test: ${config.workers} clients × ${POLYGONS_PER_CLIENT} polygons against ${config.baseUrl}`,
  );

  const metrics: RequestMetric[] = [];
  const started = performance.now();

  const results = await Promise.allSettled(
    Array.from({ length: config.workers }, (_, i) => runClient(metrics, config.baseUrl, i)),
  );

  const elapsedMs = performance.now() - started;

  const fatalErrors = results.filter((r) => r.status === "rejected");
  if (fatalErrors.length > 0) {
    console.error(`\n${fatalErrors.length} client(s) threw fatal errors:`);
    for (const f of fatalErrors) {
      if (f.status === "rejected") console.error("  ", errorMessage(f.reason));
    }
  }

  printReport(config, metrics, elapsedMs);
  process.exit(fatalErrors.length > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(`Load test failed: ${errorMessage(err)}`);
  process.exit(1);
});
