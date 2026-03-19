/**
 * Load test for MeasureX takeoff workflow.
 *
 * Run:
 *   npx ts-node scripts/load-test.ts --workers 10 --requests 5 --url http://localhost:3000
 */

export {};

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
  requestsPerWorker: number;
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
  let requestsPerWorker = 5;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--url") {
      baseUrl = argv[i + 1] || baseUrl;
      i++;
      continue;
    }

    if (arg.startsWith("--url=")) {
      baseUrl = arg.slice("--url=".length);
      continue;
    }

    if (arg === "--workers") {
      workers = Number(argv[i + 1] || workers);
      i++;
      continue;
    }

    if (arg.startsWith("--workers=")) {
      workers = Number(arg.slice("--workers=".length));
      continue;
    }

    if (arg === "--requests") {
      requestsPerWorker = Number(argv[i + 1] || requestsPerWorker);
      i++;
      continue;
    }

    if (arg.startsWith("--requests=")) {
      requestsPerWorker = Number(arg.slice("--requests=".length));
      continue;
    }
  }

  if (!Number.isInteger(workers) || workers <= 0) {
    throw new Error(`Invalid --workers value: ${workers}`);
  }

  if (!Number.isInteger(requestsPerWorker) || requestsPerWorker <= 0) {
    throw new Error(`Invalid --requests value: ${requestsPerWorker}`);
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), workers, requestsPerWorker };
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
  const idx = Math.min(sortedValues.length - 1, Math.max(0, rank));
  return sortedValues[idx];
}

function formatMs(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function requestTracked(
  metrics: RequestMetric[],
  baseUrl: string,
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const started = performance.now();
  let recorded = false;

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await parseJsonSafe(res);
    const durationMs = performance.now() - started;
    const ok = res.ok;

    metrics.push({
      endpoint: path,
      method,
      durationMs,
      ok,
      status: res.status,
      error: ok ? undefined : `HTTP ${res.status}`,
    });
    recorded = true;

    if (!ok) {
      const details = typeof payload === "string" ? payload : JSON.stringify(payload);
      throw new Error(`${method} ${path} failed: HTTP ${res.status} ${details}`);
    }

    return payload;
  } catch (err: unknown) {
    if (!recorded) {
      const durationMs = performance.now() - started;
      metrics.push({
        endpoint: path,
        method,
        durationMs,
        ok: false,
        error: errorMessage(err),
      });
    }

    throw err;
  }
}

async function runWorkflowIteration(
  metrics: RequestMetric[],
  baseUrl: string,
  workerId: number,
  iteration: number,
): Promise<void> {
  let projectId = "";

  try {
    const projectData = (await requestTracked(metrics, baseUrl, "POST", "/api/projects", {
      name: `Load Test Project W${workerId}-I${iteration}`,
    })) as ProjectCreateResponse;

    projectId = projectData.project?.id || projectData.id || "";
    if (!projectId) {
      throw new Error("Create project response did not include project id");
    }

    const classificationData = (await requestTracked(
      metrics,
      baseUrl,
      "POST",
      `/api/projects/${projectId}/classifications`,
      {
        name: `Area-${workerId}-${iteration}`,
        type: "area",
        color: "#3b82f6",
      },
    )) as ClassificationCreateResponse;

    const classificationId = classificationData.classification?.id || classificationData.id || "";
    if (!classificationId) {
      throw new Error("Create classification response did not include classification id");
    }

    await requestTracked(metrics, baseUrl, "POST", `/api/projects/${projectId}/polygons`, {
      classificationId,
      pageNumber: 1,
      points: [
        { x: 100, y: 100 },
        { x: 400, y: 100 },
        { x: 400, y: 350 },
        { x: 100, y: 350 },
      ],
    });

    await requestTracked(metrics, baseUrl, "GET", `/api/projects/${projectId}/quantities`);
  } finally {
    if (projectId) {
      try {
        await requestTracked(metrics, baseUrl, "DELETE", `/api/projects/${projectId}`);
      } catch {
        // Keep test running even if cleanup fails; failure already tracked.
      }
    }
  }
}

async function runWorker(
  metrics: RequestMetric[],
  config: LoadConfig,
  workerId: number,
): Promise<{ completed: number; failed: number }> {
  let completed = 0;
  let failed = 0;

  for (let i = 1; i <= config.requestsPerWorker; i++) {
    try {
      await runWorkflowIteration(metrics, config.baseUrl, workerId, i);
      completed++;
    } catch {
      failed++;
    }
  }

  return { completed, failed };
}

function printSummary(
  config: LoadConfig,
  metrics: RequestMetric[],
  workflowResults: Array<{ completed: number; failed: number }>,
  elapsedMs: number,
): void {
  const totalRequests = metrics.length;
  const successfulRequests = metrics.filter((m) => m.ok).length;
  const failedRequests = totalRequests - successfulRequests;
  const successRate = totalRequests === 0 ? 0 : (successfulRequests / totalRequests) * 100;
  const latencies = metrics.map((m) => m.durationMs).sort((a, b) => a - b);

  const totalWorkflows = config.workers * config.requestsPerWorker;
  const workflowsCompleted = workflowResults.reduce((sum, r) => sum + r.completed, 0);
  const workflowsFailed = workflowResults.reduce((sum, r) => sum + r.failed, 0);

  const errors = new Map<string, number>();
  for (const metric of metrics) {
    if (!metric.ok) {
      const key = metric.error || (metric.status ? `HTTP ${metric.status}` : "Unknown error");
      errors.set(key, (errors.get(key) || 0) + 1);
    }
  }

  const errorRows = [...errors.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([message, count]) => [message, String(count)]);

  const summaryRows: Array<[string, string]> = [
    ["Base URL", config.baseUrl],
    ["Workers", String(config.workers)],
    ["Iterations per worker", String(config.requestsPerWorker)],
    ["Total workflows", String(totalWorkflows)],
    ["Workflows completed", String(workflowsCompleted)],
    ["Workflows failed", String(workflowsFailed)],
    ["Total requests", String(totalRequests)],
    ["Successful requests", String(successfulRequests)],
    ["Failed requests", String(failedRequests)],
    ["Success rate", formatPct(successRate)],
    ["p50 latency", formatMs(percentile(latencies, 50))],
    ["p95 latency", formatMs(percentile(latencies, 95))],
    ["p99 latency", formatMs(percentile(latencies, 99))],
    ["Elapsed", formatMs(elapsedMs)],
  ];

  const leftWidth = Math.max(...summaryRows.map(([k]) => k.length), "Metric".length);
  const rightWidth = Math.max(...summaryRows.map(([, v]) => v.length), "Value".length);

  const border = `+-${"-".repeat(leftWidth)}-+-${"-".repeat(rightWidth)}-+`;
  console.log("\nLoad Test Summary");
  console.log(border);
  console.log(`| ${"Metric".padEnd(leftWidth)} | ${"Value".padEnd(rightWidth)} |`);
  console.log(border);
  for (const [metric, value] of summaryRows) {
    console.log(`| ${metric.padEnd(leftWidth)} | ${value.padEnd(rightWidth)} |`);
  }
  console.log(border);

  if (errorRows.length > 0) {
    const errLeftWidth = Math.max(...errorRows.map(([e]) => e.length), "Error".length);
    const errRightWidth = Math.max(...errorRows.map(([, c]) => c.length), "Count".length);
    const errBorder = `+-${"-".repeat(errLeftWidth)}-+-${"-".repeat(errRightWidth)}-+`;

    console.log("\nTop Errors");
    console.log(errBorder);
    console.log(`| ${"Error".padEnd(errLeftWidth)} | ${"Count".padEnd(errRightWidth)} |`);
    console.log(errBorder);
    for (const [message, count] of errorRows) {
      console.log(`| ${message.padEnd(errLeftWidth)} | ${count.padEnd(errRightWidth)} |`);
    }
    console.log(errBorder);
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const metrics: RequestMetric[] = [];

  console.log(
    `Starting MeasureX load test: workers=${config.workers}, requests=${config.requestsPerWorker}, url=${config.baseUrl}`,
  );

  const started = performance.now();
  const workflowResults = await Promise.all(
    Array.from({ length: config.workers }, (_, i) => runWorker(metrics, config, i + 1)),
  );
  const elapsedMs = performance.now() - started;

  printSummary(config, metrics, workflowResults, elapsedMs);

  const failedRequests = metrics.filter((m) => !m.ok).length;
  process.exit(failedRequests > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(`Load test failed to run: ${errorMessage(err)}`);
  process.exit(1);
});
