# Audit A5 — Cycle 3 — Engineer E9

**Auditor:** E9-SENTINEL
**Date:** 2026-03-20
**Scope:** 20 API route files under `src/app/api/`
**Checklist:** 14-point security & quality checklist (missing try/catch, auth, input validation, env vars, SQL/Supabase, response format, rate limiting, path traversal, type safety, dead code, error leakage, Content-Type, streaming cleanup, race conditions)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 5     |
| MEDIUM   | 13    |
| LOW      | 8     |
| **Total**| **28**|

---

## Findings

### CRITICAL

**BUG-A5-3-151:** All 20 route files — no line-specific ref, systemic **CRITICAL** — No authentication or authorization on any API route. Every route under `/api/projects/[id]/` is callable by any unauthenticated client who knows (or guesses) a project UUID. This includes destructive operations: polygon deletion (`polygons/route.ts` DELETE), share token generation/revocation (`share/route.ts` POST/DELETE), snapshot restore (`snapshots/[sid]/route.ts` POST), history restore (`history/[entryId]/restore/route.ts` POST), file upload (`upload/route.ts` POST), and webhook registration (`webhooks/route.ts` POST). In Supabase/cloud mode this is exploitable over the public internet.

**BUG-A5-3-152:** `src/app/api/projects/[id]/webhooks/route.ts:42` + `src/lib/webhooks.ts:70` **CRITICAL** — Server-Side Request Forgery (SSRF) via webhook registration. A caller can register an arbitrary URL (e.g. `http://169.254.169.254/latest/meta-data/`, `http://localhost:5432/`, internal service endpoints) and the server will POST to it from `fireWebhook()`. The Zod schema on line 12 only checks `url().refine(u => u.startsWith('http'))` which allows any HTTP(S) URL including RFC-1918 addresses, cloud metadata endpoints, and localhost services. No allowlist, no SSRF protection.

---

### HIGH

**BUG-A5-3-153:** `src/app/api/projects/[id]/webhooks/route.ts:46-63` **HIGH** — Cross-project webhook deletion. The DELETE handler extracts `webhookId` from the query string and calls `unregisterWebhook(webhookId)` without verifying the webhook belongs to the project in the URL path. Any caller who knows a webhook ID can delete any other project's webhook. The `paramsResult` extracts `id` from the URL but it is never used to scope the deletion.

**BUG-A5-3-154:** `src/app/api/vision-search/route.ts:28-47` **HIGH** — Unauthenticated proxy to paid OpenAI API. The vision-search endpoint forwards requests to OpenAI's GPT-4o with no authentication, no rate limiting, and no request size limits. An attacker can abuse this to run unlimited OpenAI API calls at the operator's expense. The `image` and `selectionImage` fields accept arbitrarily large base64 strings with no length cap, enabling memory exhaustion on the server.

**BUG-A5-3-155:** `src/app/api/vision-search/route.ts:30-33` **HIGH** — No input size validation on base64 image payloads. The `image` and `selectionImage` fields are extracted via `asString()` which imposes no max-length constraint. A malicious client can send a multi-GB base64 payload causing OOM on the server. The body is also not validated against a Zod schema — only manual `asString()` checks are used.

**BUG-A5-3-156:** `src/app/api/projects/[id]/upload/route.ts:10` **HIGH** — No rate limiting on file upload endpoint. PDF upload triggers heavy server-side processing: file write to disk/Supabase, PDF parsing via `processPDF`, image rendering via `renderPageAsImage` for each page, and AI sheet naming calls. Without rate limiting, an attacker can exhaust server CPU/memory/disk by uploading many files in parallel.

**BUG-A5-3-157:** `src/app/api/projects/[id]/pdf/route.ts:21` **HIGH** — Potential memory data leak via `Buffer.buffer`. The code returns `buf.buffer as ArrayBuffer` where `buf` is a Node.js `Buffer` from `fs.readFile()`. Node.js Buffers may be allocated from a shared memory pool, meaning `buf.buffer` can be larger than `buf.byteLength` and contain data from unrelated operations. The safe pattern is `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)` or simply passing `buf` directly (as `Uint8Array`) to the `Response` constructor.

---

### MEDIUM

**BUG-A5-3-158:** `src/app/api/projects/[id]/webhooks/route.ts:16-64` **MEDIUM** — GET, POST, and DELETE handlers are missing try/catch blocks. Any uncaught exception (e.g. from `req.json()`, `registerWebhook`, or `getWebhooksForProject`) will propagate as an unhandled rejection, causing Next.js to return a generic 500 with potentially sensitive stack trace details. Every other route file in this audit uses try/catch.

**BUG-A5-3-159:** `src/app/api/ws/route.ts:5` **MEDIUM** — `projectId` query parameter is not validated as UUID. The route accepts any arbitrary string as `projectId` (e.g. `../../etc/passwd`, SQL keywords, very long strings). While it's used as a Map key rather than in file/DB operations, it creates unbounded keyspace in the global `projectClients`/`projectViewers`/`projectEventBuffer`/`projectEventCounters` Maps, enabling memory exhaustion via many unique projectId values.

**BUG-A5-3-160:** `src/app/api/ws/route.ts:19-110` **MEDIUM** — No maximum SSE connection limit per project or globally. An attacker can open thousands of SSE connections, each allocating a `ReadableStreamDefaultController`, a `viewerId`, interval timers, and Map entries. There is no cap on total connections or per-project connections. Combined with BUG-A5-3-159, this enables a low-effort resource exhaustion attack.

**BUG-A5-3-161:** `src/app/api/projects/[id]/scale/route.ts:37-38` **MEDIUM** — `label` and `source` are read from the raw unvalidated `body` object instead of the Zod-validated `validated` output. Line 37: `typeof body.label === 'string' ? body.label : 'Custom'` and line 38: `typeof body.source === 'string' ? body.source : 'manual'`. The `ScaleSchema.passthrough()` on line 33 means these extra fields pass through Zod but are not typed or constrained. A caller can inject any string value for `label` or `source`, bypassing the intent of validation.

**BUG-A5-3-162:** Multiple routes **MEDIUM** — Error responses leak `err.message` or `String(err)` to clients. Affected files: `history/route.ts:23`, `pages/route.ts:23,59`, `polygons/route.ts:19,37,72`, `polygons/[pid]/route.ts:20,34`, `quantities/route.ts:55`, `scale/route.ts:21,43`, `scales/route.ts:49,83`, `search-text/route.ts:115`, `share/route.ts:19,45,66`, `share/[token]/route.ts:72`, `share/[token]/export/route.ts:269`, `vision-search/route.ts:131`. Internal error messages (file paths, stack info, DB errors) can aid attackers in reconnaissance. Use generic messages for 500 responses.

**BUG-A5-3-163:** All 20 route files **MEDIUM** — No rate limiting on any endpoint. None of the audited endpoints implement rate limiting (via middleware, headers, or in-route checks). This enables brute-forcing project UUIDs, DoS via repeated heavy operations (upload, vision-search, snapshot creation), and abuse of the OpenAI proxy. This is a systemic gap.

**BUG-A5-3-164:** `src/app/api/projects/[id]/history/[entryId]/restore/route.ts:18-108` **MEDIUM** — No idempotency guard on restore. Calling restore twice on the same `delete` action entry will create duplicate polygons. Calling restore twice on a `create` action will fail silently on the second call (deletePolygon returns false) but returns `{ restored: true, action: 'deleted', ok: false }` — a misleading success response. There is no check for whether the restore has already been applied.

**BUG-A5-3-165:** `src/app/api/projects/[id]/history/[entryId]/restore/route.ts:53-88` **MEDIUM** — Heavy reliance on `as` type assertions for snapshot data. Lines 53, 58-66, 73, 82-88 cast `entry.beforeData` fields via `as Record<string, unknown>`, `as string`, `as number`, `as boolean`, etc. If the stored snapshot data shape has drifted (schema migration, manual edit), these casts will silently produce `undefined` or wrong types with no runtime validation, potentially creating malformed polygons.

**BUG-A5-3-166:** `src/app/api/projects/[id]/polygons/route.ts:41-70` **MEDIUM** — POST handler does not verify project existence before creating a polygon. Unlike the history, share, upload, and snapshots routes which call `getProject(id)` and return 404, the polygons POST creates data in a potentially non-existent project directory. This could create orphaned data.

**BUG-A5-3-167:** `src/app/api/projects/[id]/quantities/route.ts:7-57` **MEDIUM** — GET handler does not verify project existence. It calls `getPolygons(id)`, `getClassifications(id)`, `getScale(id)` directly. For a non-existent project UUID, these return empty arrays/null and the route returns `{ quantities: [], scale: null }` — a 200 OK that misleads the client into thinking the project exists but has no data.

**BUG-A5-3-168:** `src/app/api/projects/[id]/snapshot/route.ts:18-24` **MEDIUM** — Snapshot export reads project, polygons, classifications, scale, and pages via `Promise.all` without transactional isolation. If another request modifies polygons or classifications between these reads, the exported snapshot will be internally inconsistent (e.g., polygons referencing a classification that was deleted mid-read).

**BUG-A5-3-169:** `src/app/api/vision-search/route.ts:30` **MEDIUM** — Request body is not validated with a Zod schema. The route casts body via `as VisionSearchBody` (a TypeScript-only construct) and uses the manual `asString()` helper. This is inconsistent with every other route in the codebase which uses Zod schemas for body validation, and allows unexpected fields to pass through silently.

---

### LOW

**BUG-A5-3-170:** `src/app/api/projects/[id]/snapshots/[sid]/route.ts:39` **LOW** — The `action` field in the POST body is read from unvalidated JSON (`body?.action`) without Zod schema validation. While the only accepted value is `'restore'` (line 41), arbitrary strings are accepted and reflected in the error message on line 42: `Unknown action: ${action}`. This is an input reflection issue; while not exploitable as XSS in a JSON response, it violates the principle of input validation.

**BUG-A5-3-171:** `src/app/api/projects/[id]/polygons/[pid]/route.ts:13` **LOW** — `req.json()` in the PUT handler lacks `.catch(() => null)` guard. Unlike every other POST/PUT/PATCH route in this audit, this route does not catch JSON parse errors gracefully. A malformed body triggers a `SyntaxError` that falls through to the outer catch, returning the raw parse error message (e.g. `"Unexpected token < in JSON at position 0"`) to the client, which is an information leak.

**BUG-A5-3-172:** `src/app/api/projects/[id]/search-text/route.ts:7` **LOW** — The `query` field in `SearchBodySchema` has no `.max()` length constraint. A caller can send a multi-MB query string, causing the `toLowerCase()` and `indexOf()` loops (lines 34, 48-59) to perform expensive string operations. Add `.max(500)` or similar.

**BUG-A5-3-173:** `src/app/api/projects/[id]/scale/route.ts:33` **LOW** — `ScaleSchema.passthrough()` accepts arbitrary extra fields in the request body. Any unrecognized keys in the body will be included in `bodyResult.data` and potentially persisted. Use `.strict()` or `.strip()` to reject or remove unknown fields.

**BUG-A5-3-174:** `src/app/api/projects/[id]/scales/route.ts:35-37` **LOW** — GET handler returns `{ scales: {} }` (empty object) when no `?pages` query param is provided, instead of returning all scales for the project. This is misleading — the caller gets a 200 OK with an empty result when they likely intended to fetch all scales. Either return all scales or return 400 for missing param.

**BUG-A5-3-175:** `src/app/api/projects/[id]/search-text/route.ts:10-17` **LOW** — `TextSearchResult` interface is exported from a route file. Route files in Next.js App Router should only export HTTP method handlers. While not a runtime bug, importing from route files can cause bundling issues and is a code organization smell. Move to `@/lib/types`.

**BUG-A5-3-176:** `src/app/api/projects/[id]/pdf/route.ts:10` **LOW** — Unlike every other project route, this handler does not call `initDataDir()` before accessing project data. If `loadPDF` is the first call in a fresh deployment and the data directory doesn't exist, the local file read will fail silently (caught), but in Supabase mode the local cache write on line 120 of `pdf-storage.ts` depends on the directory existing (it calls `mkdir` internally, so actually safe). Flagging for consistency.

**BUG-A5-3-177:** `src/app/api/projects/[id]/scale/route.ts:43` **LOW** — POST error message is misleading: `"Scale not configured — please set scale before running takeoff (${err.message})"`. This message makes sense as a 404 in the GET handler but is incorrect for a POST failure (which is about saving, not reading). The error should reflect the actual operation.

**BUG-A5-3-178:** `src/app/api/share/[token]/export/route.ts:245` **LOW** — `XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer` uses a type assertion. The SheetJS `write()` function with `type: 'array'` returns `ArrayBuffer`, but the `as` cast suppresses any future type-checking if the library changes its return type. Prefer explicit typing or a runtime check.

---

## Clean Files

None of the 20 files are fully clean. Every file is affected by at least BUG-A5-3-151 (no auth) and BUG-A5-3-163 (no rate limiting). Individual file-specific issues are noted above.

---

## Systemic Observations

1. **Auth is entirely absent.** The codebase appears to be designed as a local-first app, but with Supabase mode and share tokens, it also supports cloud deployment. Auth middleware should be added before any cloud/multi-tenant deployment.

2. **Rate limiting is entirely absent.** No route uses any form of rate limiting — no middleware, no in-route counters, no external service. This is the single highest-impact gap for production deployment.

3. **Error message discipline is inconsistent.** Some routes return sanitized messages (upload, pdf), while most pass `err.message` or `String(err)` directly. A centralized error handler or utility would fix this.

4. **Zod validation is well-adopted but inconsistent.** Most routes use Zod schemas. Notable exceptions: `vision-search/route.ts` (no schema), `snapshots/[sid]/route.ts` (action field unvalidated), `scale/route.ts` (reads from raw body after validation).

5. **Project existence checks are inconsistent.** Routes like `polygons/route.ts` POST and `quantities/route.ts` GET skip the `getProject()` existence check, while `share/route.ts`, `upload/route.ts`, and `snapshots/route.ts` include it.

6. **The webhook system has the most concentrated issues** — missing try/catch, SSRF, cross-project deletion, no auth. It should be considered unsafe for production use in current form.

---

*End of audit — E9-SENTINEL — 2026-03-20*
