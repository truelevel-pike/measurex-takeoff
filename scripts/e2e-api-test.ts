/**
 * E2E API test script for MeasureX Takeoff core workflow.
 * Run: node --experimental-strip-types scripts/e2e-api-test.ts
 *
 * Tests the full lifecycle: create project → upload PDF → classify →
 * draw polygon → read quantities → export excel → cleanup.
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

let projectId = "";
let classificationId = "";
let passed = 0;
let failed = 0;

// ── helpers ────────────────────────────────────────────────────────

async function test(name: string, fn: () => Promise<void>) {
  const t0 = performance.now();
  try {
    await fn();
    const ms = (performance.now() - t0).toFixed(0);
    console.log(`  ✅ PASS  ${name}  (${ms}ms)`);
    passed++;
  } catch (err: unknown) {
    const ms = (performance.now() - t0).toFixed(0);
    console.log(`  ❌ FAIL  ${name}  (${ms}ms)`);
    console.log(`          ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function json(res: Response) {
  assert(res.ok, `HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

// ── tests ──────────────────────────────────────────────────────────

console.log(`\n🔧 MeasureX Takeoff — E2E API Tests\n   ${BASE}\n`);

// Test 1 — Create project
await test("Create project", async () => {
  const res = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E Test Project" }),
  });
  const data = await json(res);
  projectId = data.project?.id ?? data.id;
  assert(!!projectId, "No project id returned");
});

// Test 2 — Upload PDF
await test("Upload PDF", async () => {
  // Use an existing PDF from data/uploads if available, else create a minimal one
  const fs = await import("node:fs");
  const path = await import("node:path");

  const uploadsDir = path.resolve(
    import.meta.dirname ?? ".",
    "../data/uploads"
  );
  let pdfBuf: Buffer;

  const existing = fs.readdirSync(uploadsDir).find((f: string) => f.endsWith(".pdf"));
  if (existing) {
    pdfBuf = fs.readFileSync(path.join(uploadsDir, existing));
  } else {
    // Minimal valid PDF (1 blank page)
    const minimal =
      "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n" +
      "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n" +
      "0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF";
    pdfBuf = Buffer.from(minimal);
  }

  // Build multipart form data manually (Node native)
  const boundary = "----E2ETestBoundary" + Date.now();
  const header =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="test.pdf"\r\n` +
    `Content-Type: application/pdf\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(header),
    pdfBuf,
    Buffer.from(footer),
  ]);

  const res = await fetch(`${BASE}/api/projects/${projectId}/upload`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const data = await json(res);
  assert(typeof data.pages === "number" && data.pages > 0, `Expected pages > 0, got ${data.pages}`);
});

// Test 3 — Create classification
await test("Create classification", async () => {
  const res = await fetch(`${BASE}/api/projects/${projectId}/classifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Living Room",
      color: "#3b82f6",
      type: "area",
    }),
  });
  const data = await json(res);
  classificationId = data.classification?.id ?? data.id;
  assert(!!classificationId, "No classification id returned");
});

// Test 4 — Add polygon
await test("Add polygon", async () => {
  const res = await fetch(`${BASE}/api/projects/${projectId}/polygons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      classificationId,
      points: [
        { x: 10, y: 10 },
        { x: 100, y: 10 },
        { x: 100, y: 100 },
        { x: 10, y: 100 },
      ],
      pageNumber: 1,
    }),
  });
  const data = await json(res);
  const area = data.polygon?.area ?? data.area ?? 0;
  assert(area > 0, `Expected area > 0, got ${area}`);
});

// Test 5 — Read quantities
await test("Read quantities", async () => {
  const res = await fetch(`${BASE}/api/projects/${projectId}/quantities`);
  const data = await json(res);
  assert(Array.isArray(data.quantities), "quantities should be an array");
  const match = data.quantities.find(
    (q: Record<string, unknown>) => q.classificationId === classificationId
  );
  assert(match, "Classification not found in quantities");
  assert(match.area > 0 || match.count > 0, "Expected area or count > 0");
});

// Test 6 — Export Excel
await test("Export Excel", async () => {
  const res = await fetch(`${BASE}/api/projects/${projectId}/export/excel`);
  assert(res.ok, `HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  assert(
    ct.includes("spreadsheet") || ct.includes("octet-stream") || ct.includes("xlsx"),
    `Unexpected content-type: ${ct}`
  );
  const buf = await res.arrayBuffer();
  assert(buf.byteLength > 100, "Excel file too small");
});

// Test 7 — Cleanup (delete project)
await test("Delete project", async () => {
  const res = await fetch(`${BASE}/api/projects/${projectId}`, {
    method: "DELETE",
  });
  assert(res.ok, `HTTP ${res.status}`);
});

// ── summary ────────────────────────────────────────────────────────

console.log(`\n─────────────────────────────────────`);
console.log(`  Total: ${passed + failed}   Passed: ${passed}   Failed: ${failed}`);
console.log(`─────────────────────────────────────\n`);

process.exit(failed > 0 ? 1 : 0);
