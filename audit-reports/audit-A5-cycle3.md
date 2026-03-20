# AUDIT REPORT — CYCLE 3, SECTOR A5
## API Routes + Backend Libraries
**Repo:** measurex-takeoff
**Date:** 2026-03-20
**Engineers:** E6, E7, E8, E9, E10
**Files audited:** 52 API route files + 51 lib files (103 total)

---

## TOTALS

| Severity | Count |
|----------|-------|
| CRITICAL | 14    |
| HIGH     | 31    |
| MEDIUM   | 47    |
| LOW      | 42    |
| **TOTAL** | **134** |

**Clean files:** 38 (37% of all files)

---

## CRITICAL FINDINGS

BUG-A5-3-001: [src/app/api/admin/errors/route.ts:7] CRITICAL — Auth is completely bypassed when `ADMIN_KEY` env var is not set. The `if (adminKey)` guard means if the env var is undefined, the entire auth check is skipped and anyone can access admin error data. Should fail-closed (deny access when key is unconfigured).

BUG-A5-3-004: [src/app/api/ai-takeoff/route.ts:285] CRITICAL — No authentication check. Unauthenticated users can trigger expensive OpenAI/OpenRouter API calls and create/delete classifications and polygons in any project by guessing a valid UUID.

BUG-A5-3-014: [src/app/api/chat/route.ts:12] CRITICAL — No authentication check. Unauthenticated users can call this endpoint to consume OpenAI API credits at will. Combined with no rate limiting, this is a direct cost-drain vector.

BUG-A5-3-020: [src/app/api/flags/route.ts:8] CRITICAL — No auth on POST. Any unauthenticated user can toggle any feature flag by sending `{ flag, value }`. This allows an attacker to enable/disable features across the entire application (e.g., disabling safety checks, enabling debug modes).

BUG-A5-3-120: [src/app/api/projects/[id]/route.ts:122] CRITICAL — No authentication on DELETE. Any user who knows (or guesses) a project UUID can permanently delete that project and all its data. Combined with BUG-A5-3-117 (unauthenticated project listing), an attacker can enumerate all project IDs then delete them all.

BUG-A5-3-201: [ALL routes in assemblies, batch, chat, classifications, duplicate, estimates, export/*] CRITICAL — No authentication on any route. None of the 11 audited routes verify user identity. Any client with network access can read, create, modify, delete, duplicate, or export any project's data.

BUG-A5-3-213: [src/app/api/projects/[id]/chat/route.ts:189-201] CRITICAL — No rate limiting on paid OpenAI API proxy. This endpoint forwards every request to OpenAI's `gpt-4o` model at $2.50–$10/1M tokens. Without rate limiting or auth, an attacker can rack up unbounded API costs by flooding this endpoint.

BUG-A5-3-301: [src/app/api/projects/[id]/webhooks/route.ts:16-64] CRITICAL — All three handlers (GET, POST, DELETE) lack try/catch. Any thrown error propagates as an unhandled exception, returning a raw 500 with full stack trace to the client. Leaks internal file paths, function names, and potentially sensitive state.

BUG-A5-3-302: [src/app/api/projects/[id]/webhooks/route.ts:12] CRITICAL — SSRF vulnerability. The `WebhookCreateSchema` URL validation only checks `u.startsWith('http')`, allowing `http://localhost`, `http://127.0.0.1`, `http://169.254.169.254` (AWS/GCP metadata), and other internal network addresses. An attacker can register a webhook pointed at internal services, exfiltrating data or triggering internal actions when webhook events fire.

BUG-A5-3-303: [src/app/api/projects/[id]/webhooks/route.ts:46-63] CRITICAL — DELETE handler validates the project `id` from route params but never uses it to scope the deletion. It deletes solely by `webhookId` from the query string. An attacker can delete any webhook across any project by knowing (or brute-forcing) the webhook ID. Additionally, `webhookId` is not validated as UUID.

BUG-A5-3-304: [src/app/api/projects/restore/route.ts:22-23] CRITICAL — `body.projectId` and `body.snapshotId` are cast `as string` and passed directly to `restoreSnapshot` without UUID validation. The full project restore path accepts an entirely unvalidated body — the `project` object, `classifications`, `polygons`, and `pages` arrays are all cast with `as` without any Zod schema validation. Arbitrary data shapes, missing required fields, or wrong types propagate silently.

BUG-A5-3-305: [src/app/api/projects/[id]/pdf/route.ts:21] CRITICAL — `buf.buffer as ArrayBuffer` is unsafe. Node.js `Buffer` instances may share an underlying `ArrayBuffer` from the buffer pool. `buf.buffer` can be larger than `buf` itself, with `buf.byteOffset > 0`. The response serves the entire underlying ArrayBuffer, potentially leaking adjacent memory contents (other PDFs, request data, or sensitive server state). Fix: `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`.

BUG-A5-3-401: [src/lib/webhooks.ts:70] CRITICAL — SSRF vulnerability: `fireWebhook` calls `fetch(w.url, ...)` where `w.url` is user-supplied via `registerWebhook` with zero URL validation. An attacker can register webhooks pointing to internal services (e.g. `http://169.254.169.254/latest/meta-data/`, `http://localhost:5432/`) and exfiltrate data via the POST body or probe internal network topology. No allowlist, no schema check, no private-IP blocklist.

---

## HIGH FINDINGS

BUG-A5-3-007: [src/app/api/ai-takeoff/route.ts:480] HIGH — SSRF risk: `new URL(req.url).origin` derives the internal API base URL from the incoming request. In self-hosted deployments where the `Host` header is not validated by a reverse proxy, an attacker can set `Host: evil.com` and redirect all subsequent internal fetch calls (classifications, polygons) to an attacker-controlled server.

BUG-A5-3-010: [src/app/api/audit-log/route.ts:16] HIGH — No auth on GET. Anyone can read the full audit log, which may contain user IDs, resource IDs, and action metadata.

BUG-A5-3-011: [src/app/api/audit-log/route.ts:20] HIGH — No auth on POST. Anyone can write arbitrary entries into the audit log, polluting it and undermining its integrity as a trust-worthy record.

BUG-A5-3-015: [src/app/api/chat/route.ts:12] HIGH — No rate limiting. The endpoint streams from OpenAI with `model: 'gpt-4o'`. An attacker can make unlimited parallel requests, rapidly draining the API budget.

BUG-A5-3-017: [src/app/api/errors/route.ts:50] HIGH — GET `/api/errors` returns all logged error reports — including stack traces, file paths, context objects, and internal URLs — to any unauthenticated caller. This is a significant information disclosure vulnerability enabling reconnaissance.

BUG-A5-3-101: [src/app/api/image-search/route.ts:197] HIGH — No authentication on POST handler. Unauthenticated users can consume the server's Bing, Google CSE, and Unsplash API keys/quotas. An attacker can proxy unlimited image searches through the server's paid API credentials.

BUG-A5-3-109: [src/app/api/perf/route.ts:13] HIGH — No authentication and no rate limiting on POST. Anyone can insert arbitrary performance events into the `mx_perf_events` Supabase table. An attacker can flood the table with fake data, corrupting real metrics and potentially incurring Supabase storage/row costs.

BUG-A5-3-117: [src/app/api/projects/route.ts:6] HIGH — No authentication on GET (list all projects). Any unauthenticated user can enumerate every project in the system, including names, IDs, thumbnails, and summary counts.

BUG-A5-3-118: [src/app/api/projects/route.ts:25] HIGH — No authentication on POST (create project). Combined with no rate limiting, an attacker can create unlimited projects, filling disk/database storage.

BUG-A5-3-121: [src/app/api/projects/[id]/route.ts:9] HIGH — No authentication on GET, PUT, or PATCH. Any user can read full project state (classifications, polygons, scale data, page info) or modify any project's data without authorization.

BUG-A5-3-126: [src/app/api/projects/[id]/ai-takeoff/route.ts:10] HIGH — No authentication on POST. AI takeoff calls external AI APIs which cost real money per invocation. Any unauthenticated user can trigger expensive AI analysis repeatedly.

BUG-A5-3-130: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:118] HIGH — No authentication on POST. Anyone can inject arbitrary polygons and classifications into any project.

BUG-A5-3-131: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:118] HIGH — No rate limiting on this mutation endpoint. An attacker can flood a project with thousands of polygons/classifications, corrupting data and degrading performance.

BUG-A5-3-204: [src/app/api/projects/[id]/assemblies/route.ts:38] HIGH — POST destructures from raw `body` instead of validated `bodyResult.data`. If the schema ever strips or transforms a field, the raw value is used instead.

BUG-A5-3-208: [src/app/api/projects/[id]/batch/route.ts:41-42] HIGH — Batch endpoint allows up to 500 operations per request with no request-level throttling. An attacker can submit rapid concurrent batch requests, each performing 500 file I/O operations, exhausting server disk I/O and memory.

BUG-A5-3-211: [src/app/api/projects/[id]/chat/route.ts:19-34] HIGH — ChatBodySchema from api-schemas.ts is defined but NOT used. The route performs ad-hoc validation lacking: content length limits, role enum validation, message count limits, and the `.refine()` guard present in the schema.

BUG-A5-3-212: [src/app/api/projects/[id]/chat/route.ts:23,186] HIGH — Prompt injection via unvalidated message roles. The `messages` array accepts objects with any string `role`. Line 186 casts `m.role as 'user' | 'assistant'` at the TypeScript level only — the runtime value passes through unchanged to the OpenAI API. A client can send `role: 'system'` to inject system-level prompt content.

BUG-A5-3-217: [src/app/api/projects/[id]/classifications/route.ts:34,39-41] HIGH — POST passes unvalidated fields from raw body to store. `body.id` (line 34), `body.formula` (line 39), `body.formulaUnit` (line 40), and `body.formulaSavedToLibrary` (line 41) are read directly from the raw request body. These fields are NOT in `ClassificationCreateSchema` and are never validated.

BUG-A5-3-218: [src/app/api/projects/[id]/classifications/[cid]/route.ts:36,38] HIGH — PATCH/PUT passes raw body to updateClassification instead of validated data. Line 38 passes the original `body` to the store — not `bodyResult.data`. Combined with `.passthrough()`, this allows arbitrary fields to be written to the classification record.

BUG-A5-3-224: [src/app/api/projects/[id]/export/excel/route.ts:185-191] HIGH — `unitCosts` query parameter deserialized from base64 without schema validation. The value is base64-decoded, JSON-parsed, and immediately cast as `UnitCostMap` with no Zod or runtime validation.

BUG-A5-3-306: [src/app/api/projects/[id]/scale/route.ts:37-38] HIGH — POST handler reads `label` and `source` from the raw `body` object instead of from `validated` (the Zod-parsed result). The `source` value is cast `as 'manual' | 'auto' | 'ai'` but can be any arbitrary string at runtime.

BUG-A5-3-307: [src/app/api/vision-search/route.ts:30] HIGH — Request body is cast `as VisionSearchBody` with no Zod validation. The `image` and `selectionImage` fields (base64 strings) have no size limits. An attacker can send a multi-hundred-megabyte base64 payload that is fully buffered in memory, causing OOM crashes.

BUG-A5-3-308: [src/app/api/ws/route.ts:5-6] HIGH — `projectId` from the query parameter is not validated as a UUID or any other format. Any arbitrary string becomes a key in `projectClients`, `projectViewers`, and `projectEventBuffer` Maps, enabling Map pollution (memory exhaustion with many unique keys).

BUG-A5-3-309: [src/app/api/ws/route.ts:4-119] HIGH — No limit on concurrent SSE connections per project or globally. Each connection holds a `ReadableStream`, a `setInterval` timer, and entries in two Maps. An attacker can open thousands of SSE connections, exhausting server memory and file descriptors.

BUG-A5-3-310: [src/app/api/projects/compare/route.ts:12-13] HIGH — `projectIdA` and `projectIdB` are destructured from `req.json()` and only checked for truthiness. No UUID validation — any truthy value (numbers, objects, arrays) is passed to `getPolygons` and `getClassifications`.

BUG-A5-3-311: [src/app/api/projects/restore/route.ts:35-38] HIGH — The `classifications`, `polygons`, and `pages` arrays extracted from the request body have no size limits. An attacker can POST a body with millions of entries in each array, causing the server to spend unbounded time in sequential `for` loops creating entities, filling disk storage, and blocking the event loop.

BUG-A5-3-312: [src/app/api/vision-search/route.ts:28] HIGH — No rate limiting on an endpoint that makes expensive OpenAI GPT-4o Vision API calls. Each request sends potentially large images to OpenAI, incurring significant cost.

BUG-A5-3-402: [src/lib/webhooks.ts:26-40] HIGH — No limit on webhook registrations per project. `registerWebhook` inserts into an in-memory Map without any per-project cap. An attacker can register thousands of webhooks for a single project, causing memory exhaustion and O(n) iteration in `fireWebhook` for every event fired.

BUG-A5-3-403: [src/lib/webhooks.ts:68-78] HIGH — No timeout on webhook delivery fetch. `fireWebhook` calls `fetch(w.url, ...)` with no `AbortController`/timeout. A malicious or slow webhook target can hold server connections open indefinitely, exhausting the Node.js connection pool.

BUG-A5-3-404: [src/lib/openai-guard.ts:6,23] HIGH — `getOpenAIKey()` falls back to `process.env.NEXT_PUBLIC_OPENAI_API_KEY`. The `NEXT_PUBLIC_` prefix causes Next.js to bundle this value into client-side JavaScript, exposing the OpenAI API key to any user who inspects page source or network traffic.

BUG-A5-3-405: [src/lib/ai-settings.ts:14,30] HIGH — `saveAiSettings` persists `openaiApiKey` as plaintext in localStorage under key `mx-ai-settings`. Any XSS vulnerability, browser extension, or shared-device scenario leaks the API key. The key should never be stored client-side; it should be proxied through the server.

---

## MEDIUM FINDINGS

BUG-A5-3-003: [src/app/api/admin/errors/route.ts:4] MEDIUM — No rate limiting on admin endpoint. Can be polled aggressively for reconnaissance.

BUG-A5-3-005: [src/app/api/ai-takeoff/route.ts:461] MEDIUM — Upstream OpenAI/OpenRouter error body is passed verbatim to the client, leaking internal API error details, rate-limit headers, or partial key info from the upstream provider.

BUG-A5-3-006: [src/app/api/ai-takeoff/route.ts:388] MEDIUM — When `useOpenRouter` is true but `OPENROUTER_API_KEY` is not set, it silently defaults to an empty string. Should return a clear 500 error.

BUG-A5-3-008: [src/app/api/ai-takeoff/route.ts:504] MEDIUM — Race condition: two concurrent AI takeoff requests for the same project+page will both call `deletePolygonsByPage` then both insert, resulting in duplicate polygon sets.

BUG-A5-3-012: [src/app/api/audit-log/route.ts:20] MEDIUM — No rate limiting on POST. Attacker can spam entries to fill the in-memory array with arbitrarily large `metadata` objects.

BUG-A5-3-013: [src/app/api/audit-log/route.ts:35] MEDIUM — No length limits on `action`, `resource`, or `resourceId` strings. A single POST can store megabytes of data in coerced fields, consuming server memory.

BUG-A5-3-016: [src/app/api/chat/route.ts:131] MEDIUM — Streaming ReadableStream has no `cancel()` handler. If the client disconnects mid-stream, the `start()` function continues reading from the OpenAI response body until fully consumed. The upstream `reader` is never cancelled, leaking the connection and wasting bandwidth/tokens.

BUG-A5-3-018: [src/app/api/errors/route.ts:23] MEDIUM — No rate limiting on POST. Can be spammed to fill the in-memory `loggedErrors` array with attacker-controlled content.

BUG-A5-3-021: [src/app/api/flags/route.ts:4] MEDIUM — No auth on GET. Exposes the full internal feature-flag configuration (names and values) to unauthenticated users, aiding reconnaissance.

BUG-A5-3-102: [src/app/api/image-search/route.ts:8] MEDIUM — `projectId` validated only as `z.string().optional()`, not as UUID. A non-UUID string bypasses the UUID format check that all other project routes enforce.

BUG-A5-3-105: [src/app/api/metrics/route.ts:4] MEDIUM — No authentication. Internal application performance metrics are exposed to any unauthenticated caller.

BUG-A5-3-110: [src/app/api/perf/route.ts:11] MEDIUM — `MetricSchema` uses `.passthrough()`, which preserves any extra fields beyond the declared schema. These extra fields are passed directly to `supabase.from('mx_perf_events').insert(parsed.data)`, potentially enabling arbitrary field injection.

BUG-A5-3-111: [src/app/api/perf/route.ts:32-33] MEDIUM — `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.SUPABASE_SERVICE_ROLE_KEY!` use non-null assertions. If either env var is undefined (common in dev/CI), `createClient(undefined, undefined)` is called.

BUG-A5-3-112: [src/app/api/perf/summary/route.ts:3] MEDIUM — No authentication. Returns the last 100 performance events (including any attacker-injected data from BUG-A5-3-109) to any unauthenticated caller.

BUG-A5-3-122: [src/app/api/projects/[id]/route.ts:110] MEDIUM — PATCH handler does not validate body with a zod schema. `body.thumbnail` can be an arbitrarily long string (megabytes of base64 data) with no length limit, potentially exhausting storage.

BUG-A5-3-123: [src/app/api/projects/[id]/route.ts:80-83] MEDIUM — Type assertions `as 'm' | 'ft' | 'in' | 'mm'` on `s.unit` and `as 'auto' | 'manual' | 'ai'` on `s.source` bypass runtime validation. A value like `unit: "lightyears"` passes zod validation, then the `as` cast silently narrows the TypeScript type without runtime enforcement.

BUG-A5-3-127: [src/app/api/projects/[id]/ai-takeoff/route.ts:70-71] MEDIUM — Error message includes the raw exception message `err.message`, which could contain AI API error details (rate limit info, auth errors with partial key data, internal URLs).

BUG-A5-3-132: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:156-161] MEDIUM — Race condition on concurrent apply requests for the same project/page. The sequence is: (1) deletePolygonsByPage at line 159, (2) getPolygons at line 161, (3) create new polygons. Two concurrent requests result in duplicate data from both batches.

BUG-A5-3-133: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:128] MEDIUM — `page` field extracted as `body?.page ?? 1` with no type or range validation. If `body.page` is `0`, `-5`, `3.7`, or `"abc"`, it is used directly in `deletePolygonsByPage` and `createPolygon`.

BUG-A5-3-202: [ALL 11 routes — assemblies, batch, chat, classifications, duplicate, estimates, export/*] MEDIUM — No rate limiting on any route. Every endpoint can be hammered without restriction.

BUG-A5-3-203: [assemblies/route.ts:24,51 | assemblies/[aid]/route.ts:23,43,60 | batch/route.ts:102,108 | classifications/route.ts:18,48 | classifications/[cid]/route.ts:17,42 | duplicate/route.ts:95 | estimates/route.ts:64,125 | export/contractor/route.ts:411 | export/excel/route.ts:245 | export/json/route.ts:37] MEDIUM — Error messages leak internal details to client. Pattern `err instanceof Error ? err.message : String(err)` exposes file-system paths, JSON parse details, and library-internal error text.

BUG-A5-3-205: [src/app/api/projects/[id]/assemblies/route.ts:13] MEDIUM — AssemblyBodySchema uses `.passthrough()`, allowing arbitrary unvalidated fields to flow through the schema and potentially be written to the data store.

BUG-A5-3-206: [src/app/api/projects/[id]/assemblies/[aid]/route.ts:13] MEDIUM — PATCH handler calls `req.json()` without `.catch()`. If the request body is not valid JSON, parse error details (including the malformed input) are exposed in the 500 response.

BUG-A5-3-207: [src/app/api/projects/[id]/assemblies/[aid]/route.ts:33] MEDIUM — PUT handler has the same `req.json()` without `.catch()` issue as BUG-A5-3-206.

BUG-A5-3-209: [src/app/api/projects/[id]/batch/route.ts:102] MEDIUM — Per-operation errors leak internal details. Each failed operation returns `err.message` to the client in the results array.

BUG-A5-3-210: [src/app/api/projects/[id]/batch/route.ts:62-104] MEDIUM — Race condition with concurrent batch requests. Operations within a batch run sequentially but there is no file locking. Two concurrent batch requests modifying the same project will interleave reads and writes on the JSON data files, causing data corruption or lost writes.

BUG-A5-3-214: [src/app/api/projects/[id]/chat/route.ts:189] MEDIUM — No timeout on fetch to OpenAI. The `fetch()` call has no `AbortController` or `signal` timeout. If OpenAI hangs, the route handler blocks indefinitely, consuming a server connection slot.

BUG-A5-3-215: [src/app/api/projects/[id]/chat/route.ts:22-31] MEDIUM — No message content length limit. A user can send megabytes of text, causing expensive server-side processing and high OpenAI token costs even with a single request.

BUG-A5-3-220: [src/app/api/projects/[id]/duplicate/route.ts:30-89] MEDIUM — Race condition during project duplication. If the source project is modified between the parallel reads and sequential writes, the duplicated project will contain inconsistent data.

BUG-A5-3-221: [src/app/api/projects/[id]/duplicate/route.ts:40-74] MEDIUM — Sequential await loops make duplication a DoS vector. A project with thousands of polygons makes this route take minutes. Combined with no rate limiting and no auth, an attacker can tie up server resources.

BUG-A5-3-222: [src/app/api/projects/[id]/export/contractor/route.ts:147-149] MEDIUM — Classification color values embedded in SVG attributes without HTML escaping. If a malicious color is stored via the classification update bypass (BUG-A5-3-218), it will execute as XSS when the contractor report HTML is rendered in a browser.

BUG-A5-3-313: [src/app/api/projects/[id]/scale/route.ts:36] MEDIUM — `validated.unit` is cast `as 'ft' | 'in' | 'm' | 'mm'` but `ScaleSchema` allows `'cm'` as a valid value. Downstream code that pattern-matches on unit values will miss the `'cm'` case.

BUG-A5-3-314: [src/app/api/projects/[id]/quantities/route.ts:49] MEDIUM — Unit labels are hardcoded as `'SF'` (area), `'FT'` (linear), `'EA'` (count) regardless of the actual scale unit. A metric project shows "SF" instead of "m²" and "FT" instead of "m", misleading the user.

BUG-A5-3-315: [src/app/api/projects/[id]/polygons/[pid]/route.ts:13] MEDIUM — `req.json()` in the PUT handler has no `.catch()`. All other mutation routes return a 400 for invalid JSON; this inconsistency returns a misleading 500 status for a client error.

BUG-A5-3-316: [src/app/api/projects/[id]/pages/route.ts:44-56] MEDIUM — TOCTOU race condition in the PATCH handler's upsert pattern. Two concurrent PATCH requests for the same non-existent page can both call `createPage`, potentially creating duplicate page records.

BUG-A5-3-317: [src/app/api/projects/[id]/scales/route.ts:35-38] MEDIUM — GET handler returns `{ scales: {} }` (empty object) when no `pages` query parameter is provided. The comment says "Return all scales" but actually returns nothing, silently wrong.

BUG-A5-3-318: [src/app/api/projects/[id]/snapshots/route.ts:38] MEDIUM — POST returns the snapshot object directly, while GET wraps results in `{ snapshots }`. Inconsistency means the client must handle two different response shapes for the same resource.

BUG-A5-3-319: [src/app/api/projects/[id]/share/route.ts:37-39] MEDIUM — Race condition in POST: two concurrent requests can both see null and both generate new tokens, creating orphaned tokens or overwriting the first.

BUG-A5-3-320: [src/app/api/projects/[id]/history/[entryId]/restore/route.ts:50-104] MEDIUM — No concurrency guard. Two concurrent restore requests for different history entries on the same project can interleave polygon mutations.

BUG-A5-3-321: [src/app/api/projects/[id]/search-text/route.ts:7] MEDIUM — `query` field in `SearchBodySchema` is `z.string()` with no `.max()` length limit. A multi-megabyte query string causes expensive O(n*m) substring scans on every page, enabling a CPU-bound DoS.

BUG-A5-3-322: [src/app/api/ws/route.ts:24-33] MEDIUM — Race condition in SSE connection setup. Two concurrent connections for the same `projectId` can both evaluate `projectClients.has(projectId)` as `false` and each create a new `Set()`. The second `set()` overwrites the first, orphaning the first connection's controller.

BUG-A5-3-323: [src/app/api/projects/[id]/snapshots/[sid]/route.ts:42] MEDIUM — User-supplied `action` value is reflected verbatim in the error JSON response. If any client renders this error message as raw HTML, it becomes an XSS vector.

BUG-A5-3-324: [src/app/api/projects/restore/route.ts:42-76] MEDIUM — Sequential creation of classifications, polygons, and pages without any transaction or rollback mechanism. If an error occurs mid-way, the project is left in a partially restored state with no way for the client to detect or recover.

BUG-A5-3-406: [src/lib/rate-limit.ts:10] MEDIUM — The `hits` Map stores timestamps per IP but never evicts entries for IPs that stop making requests. Under sustained traffic with diverse IPs, this is an unbounded memory leak.

BUG-A5-3-407: [src/lib/rate-limit.ts:32-33] MEDIUM — `checkRateLimit` pushes the current request's timestamp into the `valid` array *before* checking whether the limit is exceeded. An attacker making constant requests will never see their window expire because each rejected request resets the clock.

BUG-A5-3-408: [src/lib/audit-log.ts:31] MEDIUM — `createAuditEntry` accesses `localStorage.getItem(STORAGE_KEY)` without a `typeof window !== 'undefined'` guard. If called from a server-side context (SSR, API route, middleware), it throws `ReferenceError: localStorage is not defined`.

BUG-A5-3-409: [src/lib/sse-broadcast.ts:8-19] MEDIUM — Four `globalThis` Maps accumulate entries per project ID but never prune entries for deleted or inactive projects. Over the process lifetime, this grows unbounded.

BUG-A5-3-410: [src/lib/supabase.ts:19-23] MEDIUM — The `supabase` Proxy export calls `getSupabase()` on every property access. `getSupabase()` throws `Error('Supabase not configured')` if env vars are missing. Code that imports `supabase` and accesses any property will crash with an unhandled exception instead of gracefully degrading.

BUG-A5-3-411: [src/lib/ws-client.ts:59] MEDIUM — Inside `handleSSEMessage`, the variable `parsed` is re-declared at line 59, shadowing the outer `let parsed: SSEEvent` declared at