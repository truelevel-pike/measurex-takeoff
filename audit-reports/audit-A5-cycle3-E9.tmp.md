# Audit Report — Cycle 3, Sector A5, Engineer E9

**Date**: 2026-03-20
**Scope**: API routes — history, pages, pdf, polygons, quantities, scale, scales, search-text, share, snapshot, snapshots, upload, webhooks, compare, recent, restore, share/[token], share/[token]/export, vision-search, ws

---

## E9 FINDINGS — Routes: history, pages, pdf, polygons, quantities, scale, search-text, share, snapshot, upload, webhooks, compare, recent, restore, share/[token], vision-search, ws

---

### CRITICAL

BUG-A5-3-301: [src/app/api/projects/[id]/webhooks/route.ts:16-64] CRITICAL — All three handlers (GET, POST, DELETE) lack try/catch. Any thrown error (e.g. from `registerWebhook`, `unregisterWebhook`, or `getWebhooksForProject`) propagates as an unhandled exception, returning a raw 500 with full stack trace to the client. This leaks internal file paths, function names, and potentially sensitive state.

BUG-A5-3-302: [src/app/api/projects/[id]/webhooks/route.ts:12] CRITICAL — SSRF vulnerability. The `WebhookCreateSchema` URL validation only checks `u.startsWith('http')` which allows `http://localhost`, `http://127.0.0.1`, `http://169.254.169.254` (AWS/GCP metadata), `http://10.x.x.x`, `http://192.168.x.x`, and other internal network addresses. An attacker can register a webhook pointed at internal services, exfiltrating data or triggering internal actions when webhook events fire.

BUG-A5-3-303: [src/app/api/projects/[id]/webhooks/route.ts:46-63] CRITICAL — DELETE handler validates the project `id` from route params but never uses it to scope the deletion. It deletes solely by `webhookId` from the query string. An attacker can delete any webhook across any project by knowing (or brute-forcing) the webhook ID. Additionally, `webhookId` is not validated as UUID — any arbitrary string is passed to `unregisterWebhook`.

BUG-A5-3-304: [src/app/api/projects/restore/route.ts:22-23] CRITICAL — `body.projectId` and `body.snapshotId` are cast `as string` and passed directly to `restoreSnapshot` without UUID validation. Malformed or malicious values bypass all safety checks. The full project restore path (lines 27-91) accepts an entirely unvalidated body — the `project` object, `classifications`, `polygons`, and `pages` arrays are all cast with `as` without any Zod schema validation. Arbitrary data shapes, missing required fields, or wrong types propagate silently.

BUG-A5-3-305: [src/app/api/projects/[id]/pdf/route.ts:21] CRITICAL — `buf.buffer as ArrayBuffer` is unsafe. Node.js `Buffer` instances may share an underlying `ArrayBuffer` from the buffer pool. `buf.buffer` can be larger than `buf` itself, with `buf.byteOffset > 0`. The response serves the entire underlying ArrayBuffer, potentially leaking adjacent memory contents (other PDFs, request data, or sensitive server state). Fix: `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`.

---

### HIGH

BUG-A5-3-306: [src/app/api/projects/[id]/scale/route.ts:37-38] HIGH — POST handler reads `label` and `source` from the raw `body` object instead of from `validated` (the Zod-parsed result). Although `ScaleSchema.passthrough()` is used (line 33), `label` and `source` are not fields in `ScaleSchema`, so they completely bypass validation. The `source` value is cast `as 'manual' | 'auto' | 'ai'` but can be any arbitrary string at runtime, violating the type contract downstream.

BUG-A5-3-307: [src/app/api/vision-search/route.ts:30] HIGH — Request body is cast `as VisionSearchBody` with no Zod validation. The `image` and `selectionImage` fields (base64 strings) have no size limits. An attacker can send a multi-hundred-megabyte base64 payload that is fully buffered in memory, causing OOM crashes. This is also the only route making expensive third-party API calls (OpenAI) with no rate limiting at all.

BUG-A5-3-308: [src/app/api/ws/route.ts:5-6] HIGH — `projectId` from the query parameter is not validated as a UUID or any other format. Any arbitrary string becomes a key in `projectClients`, `projectViewers`, and `projectEventBuffer` Maps. This enables Map pollution (memory exhaustion with many unique keys) and allows subscribing to events for non-existent projects, which could mask bugs or be exploited for information gathering.

BUG-A5-3-309: [src/app/api/ws/route.ts:4-119] HIGH — No limit on concurrent SSE connections per project or globally. Each connection holds a `ReadableStream`, a `setInterval` timer, and entries in two Maps. An attacker can open thousands of SSE connections, exhausting server memory and file descriptors, effectively DoS-ing all real-time features.

BUG-A5-3-310: [src/app/api/projects/compare/route.ts:12-13] HIGH — `projectIdA` and `projectIdB` are destructured from `req.json()` and only checked for truthiness (`if (!projectIdA || !projectIdB)`). No UUID validation — any truthy value (numbers, objects, arrays) is passed to `getPolygons` and `getClassifications`. This could cause unexpected behavior in the data layer or bypass path-based access controls.

BUG-A5-3-311: [src/app/api/projects/restore/route.ts:35-38] HIGH — The `classifications`, `polygons`, and `pages` arrays extracted from the request body have no size limits. An attacker can POST a body with millions of entries in each array, causing the server to spend unbounded time in the sequential `for` loops (lines 42-76) creating entities, filling disk storage, and blocking the event loop.

BUG-A5-3-312: [src/app/api/vision-search/route.ts:28] HIGH — No rate limiting on an endpoint that makes expensive OpenAI GPT-4o Vision API calls. Each request sends potentially large images to OpenAI, incurring significant cost. An attacker can run up API bills or exhaust rate limits, denying service to legitimate users.

---

### MEDIUM

BUG-A5-3-313: [src/app/api/projects/[id]/scale/route.ts:36] MEDIUM — `validated.unit` is cast `as 'ft' | 'in' | 'm' | 'mm'` but `ScaleSchema` (in api-schemas.ts:47) allows `'cm'` as a valid value. If a user sets `unit: 'cm'`, it passes Zod validation but the TypeScript type silently narrows to the 4-value union. Downstream code that pattern-matches on unit values will miss the `'cm'` case, potentially producing incorrect calculations or falling through to default branches.

BUG-A5-3-314: [src/app/api/projects/[id]/quantities/route.ts:49] MEDIUM — Unit labels are hardcoded as `'SF'` (area), `'FT'` (linear), `'EA'` (count) regardless of the actual scale unit. Line 23 correctly detects metric scales (`unit === 'm' || unit === 'mm'`) but line 49 ignores this, always reporting imperial labels. A metric project shows "SF" instead of "m²" and "FT" instead of "m", misleading the user.

BUG-A5-3-315: [src/app/api/projects/[id]/polygons/[pid]/route.ts:13] MEDIUM — `req.json()` in the PUT handler has no `.catch()`. If the client sends invalid JSON, the call throws, caught by the outer `catch` which returns a 500 error. All other mutation routes use `req.json().catch(() => null)` and return a 400 for invalid JSON. This inconsistency returns a misleading 500 status for a client error.

BUG-A5-3-316: [src/app/api/projects/[id]/pages/route.ts:44-56] MEDIUM — TOCTOU race condition in the PATCH handler's upsert pattern. `updatePage` returns null (page doesn't exist), then `createPage` is called. If two concurrent PATCH requests for the same non-existent page both see `updatePage` return null, both will call `createPage`, potentially creating duplicate page records.

BUG-A5-3-317: [src/app/api/projects/[id]/scales/route.ts:35-38] MEDIUM — GET handler returns `{ scales: {} }` (empty object) when no `pages` query parameter is provided. The comment on line 36 says "Return all scales" but actually returns nothing. Callers expecting all per-page scales get an empty result, which is silently wrong and can cause the client to render as if no scales are configured.

BUG-A5-3-318: [src/app/api/projects/[id]/snapshots/route.ts:38] MEDIUM — POST returns the snapshot object directly (`NextResponse.json(snapshot)`), while GET wraps results in `{ snapshots }`. This inconsistency means the client must handle two different response shapes for the same resource. Convention throughout the codebase wraps in a named key (e.g. `{ polygon }`, `{ pages }`).

BUG-A5-3-319: [src/app/api/projects/[id]/share/route.ts:37-39] MEDIUM — Race condition in POST: `getShareToken(id)` returns null, then `generateShareToken(id)` is called. Two concurrent POST requests can both see null and both generate new tokens. Depending on the storage implementation, this creates orphaned tokens or overwrites the first, invalidating links already shared.

BUG-A5-3-320: [src/app/api/projects/[id]/history/[entryId]/restore/route.ts:50-104] MEDIUM — No concurrency guard. The restore handler creates, updates, or deletes polygons and broadcasts SSE events without any locking. Two concurrent restore requests for different history entries on the same project can interleave polygon mutations, leaving the project in an inconsistent state that matches neither history entry.

BUG-A5-3-321: [src/app/api/projects/[id]/search-text/route.ts:7] MEDIUM — `query` field in `SearchBodySchema` is `z.string()` with no `.max()` length limit. The search performs `O(n * m)` substring scans across all page text (lines 48-59). A multi-megabyte query string causes expensive scans on every page, enabling a CPU-bound DoS.

BUG-A5-3-322: [src/app/api/ws/route.ts:24-33] MEDIUM — Race condition in SSE connection setup. Two concurrent connections for the same `projectId` can both evaluate `projectClients.has(projectId)` as `false` and each create a new `Set()`. The second `set()` call overwrites the first, orphaning the first connection's controller. That client never receives updates and its keepalive interval leaks.

BUG-A5-3-323: [src/app/api/projects/[id]/snapshots/[sid]/route.ts:42] MEDIUM — User-supplied `action` value is reflected verbatim in the error JSON response (`Unknown action: ${action}`). While JSON serialization prevents direct XSS, if any client renders this error message as raw HTML (common in toast notifications), it becomes an XSS vector. The `action` field should be validated against an allowlist or sanitized.

BUG-A5-3-324: [src/app/api/projects/restore/route.ts:42-76] MEDIUM — Sequential creation of classifications, polygons, and pages without any transaction or rollback mechanism. If an error occurs mid-way (e.g., at polygon 50 of 200), the project is left in a partially restored state with some classifications and some polygons but not all. There is no way for the client to detect or recover from a partial restore.

---

### LOW

BUG-A5-3-325: [Multiple routes] LOW — `err.message` or `String(err)` is returned to clients in error responses across 15+ routes: history/route.ts:23, pages/route.ts:23+59, polygons/route.ts:19+37+72, polygons/[pid]/route.ts:20+34, quantities/route.ts:55, scale/route.ts:43, scales/route.ts:49+83, search-text/route.ts:115, share/route.ts:19+45+66, share/[token]/route.ts:72, share/[token]/export/route.ts:269, recent/route.ts:15, restore/route.ts:97, compare/route.ts:84. Internal error messages can leak file paths, database connection strings, or stack traces.

BUG-A5-3-326: [src/app/api/projects/[id]/scale/route.ts:43] LOW — The POST error handler wraps the actual error in a misleading message: `"Scale not configured — please set scale before running takeoff (${err.message})"`. This message is copied from the GET 404 response and makes no sense in a POST context (the user is trying to *set* the scale). It confuses both end users and developers debugging issues.

BUG-A5-3-327: [src/app/api/projects/[id]/upload/route.ts] LOW — No rate limiting on the file upload endpoint. Each request accepts up to 50MB files, processes them through PDF parsing, renders page images, and optionally calls the AI sheet namer. Repeated uploads can exhaust disk space, CPU (PDF rendering), and AI API quotas.

BUG-A5-3-328: [src/app/api/projects/compare/route.ts:8 → src/lib/rate-limit.ts:51] LOW — The compare route is the only route with rate limiting, but it relies on `x-forwarded-for` header for IP identification. This header is trivially spoofable by the client — each request with a different `X-Forwarded-For` value gets a fresh rate limit quota, effectively bypassing the protection entirely. The rate limiter should use the actual socket IP or a trusted proxy-stripped header.

BUG-A5-3-329: [src/app/api/projects/[id]/history/[entryId]/restore/route.ts:53-88] LOW — Heavy use of `as` type assertions on `beforeData` snapshot fields (lines 58-65, 82-88). The snapshot data structure is `Record<string, unknown>` with fields accessed via `as string`, `as number`, `as boolean`, etc. If the stored snapshot has mismatched types (e.g., `area` stored as string `"123"` instead of number `123`), the `??` fallback chain silently passes wrong types to `createPolygon`/`updatePolygon`, corrupting polygon data without any error.

BUG-A5-3-330: [src/app/api/projects/[id]/share/[token]/export/route.ts:245] LOW — `XLSX.write(wb, { type: 'array' }) as ArrayBuffer` — the XLSX library returns `ArrayBuffer | Buffer | string` depending on the `type` option. The `as ArrayBuffer` cast is safe for `type: 'array'` in the current version, but a library update changing the return type would silently break the cast, potentially serving corrupted Excel files.

---

### CLEAN VERDICTS

CLEAN: [src/app/api/projects/[id]/history/route.ts] — Well-structured: try/catch, UUID validation via ProjectIdSchema, limit parameter clamped to [1, 200], proper error handling. Only minor issue is err.message leak (covered in BUG-A5-3-325).

CLEAN: [src/app/api/projects/recent/route.ts] — Simple GET with try/catch, no params to validate, uses initDataDir. Only issue is err.message leak (covered in BUG-A5-3-325).

CLEAN: [src/app/api/share/[token]/route.ts] — Good share-token-as-auth pattern, UUID validation on token, Promise.all with .catch() fallbacks for each data fetch, consistent response shape.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5     |
| HIGH     | 7     |
| MEDIUM   | 12    |
| LOW      | 6     |
| **Total**| **30**|

### Systemic Issues

1. **No authentication on any project route**: Every `[id]`-scoped route trusts the UUID alone as an authorization token. If deployed to a network (not purely localhost), any user who knows or guesses a project UUID has full read/write access including file upload, polygon mutation, history restore, and share token management.

2. **Rate limiting nearly absent**: Only `compare/route.ts` has rate limiting, and it's bypassable via header spoofing. High-cost endpoints (upload, vision-search, webhooks, SSE) are completely unprotected.

3. **Error message leakage**: 15+ routes return `err.message` or `String(err)` to clients, risking exposure of internal paths, database errors, or stack traces.

---

*Engineer E9 — Cycle 3, Sector A5 — 2026-03-20*
