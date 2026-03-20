# Audit Report — A5 Cycle 6

**Scope:** All files in `src/app/api/` (55 files) and `src/lib/` (49 files)
**Date:** 2026-03-20
**Auditor:** E5-PIKE (A5 Cycle 6)

---

## API Routes — `src/app/api/`

### src/app/api/projects/recent/route.ts

BUG-A5-6-001: [src/app/api/projects/recent/route.ts:4] MEDIUM — No authentication or authorization check. Any unauthenticated user can list all recent projects, potentially leaking project names and metadata belonging to other users.

### src/app/api/openapi.json/route.ts

BUG-A5-6-002: [src/app/api/openapi.json/route.ts:6] MEDIUM — `Access-Control-Allow-Origin: '*'` allows any origin to fetch the full OpenAPI spec, exposing all API endpoints, parameter schemas, and internal structure to any attacker for reconnaissance.

BUG-A5-6-003: [src/app/api/openapi.json/route.ts:4] LOW — No authentication. The full API specification is publicly accessible, aiding reconnaissance.

### src/app/api/perf/summary/route.ts

BUG-A5-6-004: [src/app/api/perf/summary/route.ts:7] CRITICAL — Uses `SUPABASE_SERVICE_ROLE_KEY` (admin key) to create a Supabase client, bypassing Row Level Security. Combined with no authentication, any anonymous user reads the `mx_perf_events` table with admin privileges.

BUG-A5-6-005: [src/app/api/perf/summary/route.ts:3] MEDIUM — No authentication or authorization. Anyone can query the last 100 performance events, which may contain timing information or internal metrics.

BUG-A5-6-006: [src/app/api/perf/summary/route.ts:14] LOW — `select('*')` fetches all columns. If the table schema grows to include sensitive fields, they are returned to unauthenticated callers without filtering.

### src/app/api/health/route.ts

BUG-A5-6-007: [src/app/api/health/route.ts:6] MEDIUM — `require('../../../../package.json')` exposes the application version to unauthenticated callers via the response, helping attackers identify known vulnerabilities for the specific version.

### src/app/api/perf/route.ts

BUG-A5-6-008: [src/app/api/perf/route.ts:32] CRITICAL — `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.SUPABASE_SERVICE_ROLE_KEY!` use non-null assertions. If undefined, `createClient(undefined, undefined)` throws inside the catch block which silently swallows the error — the client gets `{ ok: true }` even though the metric was never persisted (silent data loss).

BUG-A5-6-009: [src/app/api/perf/route.ts:13] MEDIUM — No authentication or rate limiting. Any caller can POST arbitrary performance metrics persisted to the database. An attacker could flood the `mx_perf_events` table with garbage data (DoS).

BUG-A5-6-010: [src/app/api/perf/route.ts:11] MEDIUM — Zod schema uses `.passthrough()`, allowing arbitrary extra fields to be included in parsed data and persisted to the database via `insert(parsed.data)`.

BUG-A5-6-011: [src/app/api/perf/route.ts:31] MEDIUM — Uses `SUPABASE_SERVICE_ROLE_KEY` (service/admin key) to insert data, bypassing Row Level Security. Combined with no authentication, any anonymous user writes directly to the database with admin privileges.

### src/app/api/image-search/route.ts

BUG-A5-6-012: [src/app/api/image-search/route.ts:172] MEDIUM — The `projectId` parameter from untrusted user input is passed directly to `getPages(projectId)` without ownership verification. Any user who knows or guesses a project UUID can search through that project's sheets.

### src/app/api/projects/[id]/duplicate/route.ts

BUG-A5-6-013: [src/app/api/projects/[id]/duplicate/route.ts:18] HIGH — No authentication or authorization. Any unauthenticated caller can duplicate any project by ID, creating copies of potentially sensitive project data (classifications, polygons, pages, scale data).

BUG-A5-6-014: [src/app/api/projects/[id]/duplicate/route.ts:56] MEDIUM — Fallback `classificationIdMap.get(polygon.classificationId) || polygon.classificationId` silently uses the original classification ID if mapping fails, creating a cross-project data reference integrity issue.

BUG-A5-6-015: [src/app/api/projects/[id]/duplicate/route.ts:40] LOW — Sequential `for...of` loops with `await`. If any creation fails midway, the duplicate project is left in an incomplete/inconsistent state with no cleanup or rollback.

### src/app/api/projects/[id]/history/route.ts

BUG-A5-6-016: [src/app/api/projects/[id]/history/route.ts:5] HIGH — No authentication or authorization. Any unauthenticated caller can read the full edit history of any project by ID.

BUG-A5-6-017: [src/app/api/projects/[id]/history/route.ts:19] LOW — `Cache-Control: public, max-age=60` on project history data means any intermediary proxy/CDN can cache this response and serve it to the wrong user.

### src/app/api/errors/route.ts

BUG-A5-6-018: [src/app/api/errors/route.ts:50] HIGH — The GET endpoint has no authentication. Returns all logged error reports which may contain stack traces, URLs, user agents, and context data — significant information disclosure.

BUG-A5-6-019: [src/app/api/errors/route.ts:20] MEDIUM — `loggedErrors` array is stored in-memory, shared across requests. In serverless/edge environment, state is ephemeral and inconsistent across instances.

BUG-A5-6-020: [src/app/api/errors/route.ts:23] MEDIUM — No rate limiting on POST. An attacker can flood the error reporting endpoint, filling the in-memory array with garbage data. `console.error` at line 46 writes attacker-controlled content to server logs (log injection).

BUG-A5-6-021: [src/app/api/errors/route.ts:27] MEDIUM — No validation or size limits on the payload body. `message`, `stack`, `context`, `url`, and `userAgent` fields accept arbitrarily large strings. The `context` field accepts any plain object of unlimited depth/size.

### src/app/api/flags/route.ts

BUG-A5-6-022: [src/app/api/flags/route.ts:8] CRITICAL — No authentication on the POST endpoint. Any unauthenticated user can toggle any feature flag by name, potentially enabling experimental/unsafe features or disabling security features.

BUG-A5-6-023: [src/app/api/flags/route.ts:4] MEDIUM — No authentication on GET. All feature flags exposed, revealing internal application configuration.

### src/app/api/projects/[id]/snapshot/route.ts

BUG-A5-6-024: [src/app/api/projects/[id]/snapshot/route.ts:11] HIGH — No authentication. Any unauthenticated user can export a full project snapshot (all polygons, classifications, pages, scale data) by project ID — complete data exfiltration vector.

### src/app/api/projects/[id]/snapshots/route.ts

BUG-A5-6-025: [src/app/api/projects/[id]/snapshots/route.ts:5] HIGH — No authentication on GET. Any unauthenticated user can list all snapshots of any project.

BUG-A5-6-026: [src/app/api/projects/[id]/snapshots/route.ts:23] HIGH — No authentication on POST. Any unauthenticated user can create snapshots for any project, potentially exhausting storage.

### src/app/api/projects/[id]/snapshots/[sid]/route.ts

BUG-A5-6-027: [src/app/api/projects/[id]/snapshots/[sid]/route.ts:27] HIGH — No authentication on POST (restore). Any unauthenticated user can restore any project to a previous snapshot, potentially destroying current project data.

BUG-A5-6-028: [src/app/api/projects/[id]/snapshots/[sid]/route.ts:55] HIGH — No authentication on DELETE. Any unauthenticated user can delete any snapshot, causing permanent data loss.

BUG-A5-6-029: [src/app/api/projects/[id]/snapshots/[sid]/route.ts:39] MEDIUM — The `action` field from the request body is not validated. If `action` is a large string or object, it's interpolated into the error message on line 42 (response manipulation / log pollution).

BUG-A5-6-030: [src/app/api/projects/[id]/snapshots/[sid]/route.ts:50] LOW — Error message string matching (`msg === 'Snapshot not found'`) to determine HTTP status is fragile. If the message changes, returns 500 instead of 404.

### src/app/api/audit-log/route.ts

BUG-A5-6-031: [src/app/api/audit-log/route.ts:16] HIGH — No authentication on GET. Any unauthenticated user can read the entire audit log, revealing user activity patterns and internal resource identifiers.

BUG-A5-6-032: [src/app/api/audit-log/route.ts:20] HIGH — No authentication on POST. Any unauthenticated user can inject fake audit entries to cover tracks, frame users, or pollute the audit trail.

BUG-A5-6-033: [src/app/api/audit-log/route.ts:14] MEDIUM — Audit log stored in-memory only. In serverless/multi-instance environment, entries are lost on cold-start and inconsistent across instances.

BUG-A5-6-034: [src/app/api/audit-log/route.ts:22] MEDIUM — No input size validation on `action`, `resource`, `resourceId`, or `metadata`. Attacker can submit extremely large strings or deeply nested metadata objects.

### src/app/api/projects/[id]/quantities/route.ts

BUG-A5-6-035: [src/app/api/projects/[id]/quantities/route.ts:49] LOW — Unit label is hardcoded as 'SF' and 'FT' even when the scale unit is metric. When metric is detected at line 23, should be 'SM'/'M', not 'SF'/'FT'.

BUG-A5-6-036: [src/app/api/projects/[id]/quantities/route.ts:24] MEDIUM — If `ppu` (pixelsPerUnit) is null (no scale set), `null` is passed for `pixelsPerFoot` — `calculatePolygonArea` and `calculateLinearLength` must handle null or calculations silently produce wrong results.

### src/app/api/projects/[id]/classifications/[cid]/route.ts

BUG-A5-6-037: [src/app/api/projects/[id]/classifications/[cid]/route.ts:38] HIGH — Raw unvalidated `body` (not `bodyResult.data`) is passed directly to `updateClassification`, bypassing Zod transformations. Combined with `.passthrough()`, a malicious client can inject arbitrary keys (e.g., `id`, `createdAt`, `projectId`) into the classification record.

BUG-A5-6-038: [src/app/api/projects/[id]/classifications/[cid]/route.ts:12] MEDIUM — `deleteClassification` returns boolean `ok`, but when `ok` is false the route returns `{ ok: false }` with status 200 instead of 404.

### src/app/api/projects/[id]/history/[entryId]/restore/route.ts

BUG-A5-6-039: [src/app/api/projects/[id]/history/[entryId]/restore/route.ts:36] MEDIUM — `getHistory(projectId, 200)` caps retrieval at 200 entries. If the target `entryId` is older than 200th entry, restore incorrectly reports "History entry not found".

BUG-A5-6-040: [src/app/api/projects/[id]/history/[entryId]/restore/route.ts:53] MEDIUM — `entry.beforeData` could be `undefined` (not just null). The null check at line 54 would not catch `undefined`, allowing crash when accessing properties.

### src/app/api/projects/[id]/polygons/[pid]/route.ts

BUG-A5-6-041: [src/app/api/projects/[id]/polygons/[pid]/route.ts:13] MEDIUM — `req.json()` has no `.catch()` handler. Malformed JSON throws unhandled into the generic catch, returning 500 instead of 400.

BUG-A5-6-042: [src/app/api/projects/[id]/polygons/[pid]/route.ts:16] LOW — When `updatePolygon` returns null/undefined (not found), route returns `{ polygon: null }` with status 200 instead of 404.

### src/app/api/vision-search/route.ts

BUG-A5-6-043: [src/app/api/vision-search/route.ts:28] HIGH — No authentication or rate limiting. This endpoint proxies requests to the OpenAI API using the server's API key. Any unauthenticated client can send unlimited requests, burning through the OpenAI API budget (cost-exhaustion vector).

BUG-A5-6-044: [src/app/api/vision-search/route.ts:30] MEDIUM — No size validation on the `image` and `selectionImage` base64 strings. Client could send extremely large payloads causing memory exhaustion and expensive API calls.

BUG-A5-6-045: [src/app/api/vision-search/route.ts:58] MEDIUM — User-controlled `query` string is interpolated directly into the prompt text without sanitization, enabling prompt injection attacks.

### src/app/api/chat/route.ts

BUG-A5-6-046: [src/app/api/chat/route.ts:12] HIGH — No rate limiting on the chat endpoint. Streams OpenAI API responses and any unauthenticated client can send unlimited requests, exhausting the OpenAI API budget.

BUG-A5-6-047: [src/app/api/chat/route.ts:133] LOW — If `resp.body` is null, the stream closes immediately with no data. Client receives an empty SSE stream with no error indication.

### src/app/api/projects/compare/route.ts

BUG-A5-6-048: [src/app/api/projects/compare/route.ts:12] HIGH — `projectIdA` and `projectIdB` are extracted from request body with no UUID validation. Arbitrary strings (including path traversal payloads) get passed directly to `getPolygons` and `getClassifications`.

BUG-A5-6-049: [src/app/api/projects/compare/route.ts:6] MEDIUM — No authentication. Any client can compare any two projects, accessing data from other users' projects.

### src/app/api/projects/[id]/search-text/route.ts

BUG-A5-6-050: [src/app/api/projects/[id]/search-text/route.ts:7] LOW — No minimum or maximum length on `query` field. An extremely long query string would be used in repeated `.indexOf()` searches across all page text, causing CPU exhaustion.

### src/app/api/projects/restore/route.ts

BUG-A5-6-051: [src/app/api/projects/restore/route.ts:22] HIGH — `body.projectId` and `body.snapshotId` passed to `restoreSnapshot` with only an `as string` cast and no UUID validation. Malicious client can inject arbitrary strings (path traversal) into the restore path.

BUG-A5-6-052: [src/app/api/projects/restore/route.ts:15] MEDIUM — No authentication on restore endpoint. Any client can restore any project from any snapshot or create new projects from exported data.

BUG-A5-6-053: [src/app/api/projects/restore/route.ts:57] MEDIUM — When restoring polygons, if classificationId mapping fails, it falls back to the original `p.classificationId` from the export — a stale ID referencing a classification that doesn't exist in the new project.

### src/app/api/projects/[id]/share/route.ts

BUG-A5-6-054: [src/app/api/projects/[id]/share/route.ts:15] LOW — GET handler does not check whether the project exists before returning the share token. Non-existent project returns `{ token: null }` with status 200 instead of 404.

### src/app/api/projects/[id]/export/json/route.ts

BUG-A5-6-055: [src/app/api/projects/[id]/export/json/route.ts:21] MEDIUM — Full project data including all polygons, classifications, pages, and scale exported without any field filtering. Internal-only fields (IDs, server metadata) are leaked.

BUG-A5-6-056: [src/app/api/projects/[id]/export/json/route.ts:26] MEDIUM — `fireWebhook` is fire-and-forget. If webhook URL is an attacker-controlled SSRF target, the server silently makes requests to arbitrary URLs with no URL validation.

### src/app/api/share/[token]/export/route.ts

BUG-A5-6-057: [src/app/api/share/[token]/export/route.ts:175] MEDIUM — No rate limiting on the shared export endpoint. An attacker with a token can repeatedly hit this to generate expensive Excel exports or large JSON downloads (CPU/memory pressure).

BUG-A5-6-058: [src/app/api/share/[token]/export/route.ts:203] LOW — Errors from data store silently caught and replaced with empty defaults. Export silently produces incomplete results with no indication to the user.

### src/app/api/projects/[id]/export/contractor/route.ts

BUG-A5-6-059: [src/app/api/projects/[id]/export/contractor/route.ts:145] LOW — SVG overlay interpolates `cls.color` directly into SVG markup without sanitization. If color contains `"` or `<`, could break SVG/HTML structure.

BUG-A5-6-060: [src/app/api/projects/[id]/export/contractor/route.ts:170] LOW — `thumbnail` injected as `src` attribute in `<img>` tag. If thumbnail is a data URI with malicious content or external URL, could enable content injection.

### src/app/api/docs/route.ts

BUG-A5-6-061: [src/app/api/docs/route.ts:69] MEDIUM — External JavaScript loaded from CDN (`cdn.jsdelivr.net`) without Subresource Integrity (SRI) hash. Compromised CDN could inject malicious JavaScript.

BUG-A5-6-062: [src/app/api/docs/route.ts:82] LOW — `tryItOutEnabled: true` on Swagger UI allows anyone to execute API requests directly from the docs page.

### src/app/api/projects/[id]/pdf/route.ts

BUG-A5-6-063: [src/app/api/projects/[id]/pdf/route.ts:10] HIGH — No authentication/authorization. Anyone with a valid project UUID can download the PDF binary.

BUG-A5-6-064: [src/app/api/projects/[id]/pdf/route.ts:21] MEDIUM — `buf.buffer as ArrayBuffer` on a Node.js Buffer returns the underlying ArrayBuffer which may be larger than the Buffer slice (pool allocation). The response could leak extra bytes from the buffer pool. Should use `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`.

### src/app/api/ws/route.ts

BUG-A5-6-065: [src/app/api/ws/route.ts:5] CRITICAL — No authentication on SSE endpoint. Any client can connect to any project's SSE stream by supplying a `projectId` query parameter, receiving real-time updates (polygon changes, assembly updates) and leaking sensitive project data.

BUG-A5-6-066: [src/app/api/ws/route.ts:5] MEDIUM — `projectId` query param checked for existence but never validated as UUID. Arbitrary strings pollute the `projectClients` and `projectViewers` maps in memory.

BUG-A5-6-067: [src/app/api/ws/route.ts:34] MEDIUM — Viewer count broadcast race condition. Between lines 33-34, `viewerCount` is captured, then another SSE connection could join concurrently, making the count stale.

### src/app/api/projects/[id]/assemblies/[aid]/route.ts

BUG-A5-6-068: [src/app/api/projects/[id]/assemblies/[aid]/route.ts:7] HIGH — No authentication on PATCH/PUT/DELETE. Any caller can modify or delete any assembly in any project.

BUG-A5-6-069: [src/app/api/projects/[id]/assemblies/[aid]/route.ts:23] MEDIUM — `err.message` returned directly to client in 500 response. Can leak internal implementation details (file paths, database errors).

### src/app/api/projects/[id]/export/excel/route.ts

BUG-A5-6-070: [src/app/api/projects/[id]/export/excel/route.ts:159] HIGH — No authentication on Excel export. Full project data (polygons, classifications, assemblies, costs) exported without auth.

BUG-A5-6-071: [src/app/api/projects/[id]/export/excel/route.ts:187] HIGH — `unitCosts` query parameter is base64-decoded and JSON.parsed without any Zod schema validation. Parsed object cast directly to `UnitCostMap` and used in `buildEstimatesSheet`. Unexpected structure could produce NaN/undefined behavior.

BUG-A5-6-072: [src/app/api/projects/[id]/export/excel/route.ts:178] MEDIUM — `pixelsPerUnit` set to `null` when scale is missing. `ScaleConfig` type expects a number for `pixelsPerFoot`. Downstream geometry calculations may produce NaN or throw when dividing by null.

### src/app/api/share/[token]/route.ts

BUG-A5-6-073: [src/app/api/share/[token]/route.ts:72] MEDIUM — `err.message` returned to client. Since this is a public-facing share endpoint, leaking internal error messages is higher risk.

### src/app/api/projects/route.ts

BUG-A5-6-074: [src/app/api/projects/route.ts:6] CRITICAL — No authentication on project listing. `GET /api/projects` returns all projects with thumbnails. Anyone can enumerate all projects in the system.

BUG-A5-6-075: [src/app/api/projects/route.ts:25] HIGH — No authentication on project creation. `POST /api/projects` allows any anonymous user to create projects, enabling resource exhaustion/abuse.

BUG-A5-6-076: [src/app/api/projects/route.ts:6] MEDIUM — Project list cached with `Cache-Control: public, max-age=10, s-maxage=10`. Project data (names, thumbnails) cacheable by CDNs and shared proxies.

### src/app/api/metrics/route.ts

BUG-A5-6-077: [src/app/api/metrics/route.ts:4] HIGH — No authentication on metrics endpoint. Performance metrics exposed to anyone — may leak server-side performance data, memory usage, request counts.

### src/app/api/feature-flags/route.ts

BUG-A5-6-078: [src/app/api/feature-flags/route.ts:4] MEDIUM — No authentication. Feature flags exposed including unreleased features, A/B test configurations, and internal toggles.

### src/app/api/plugins/route.ts

BUG-A5-6-079: [src/app/api/plugins/route.ts:17] LOW — POST returns 200 with informational message rather than 405 Method Not Allowed. Semantically incorrect.

### src/app/api/experiments/route.ts

BUG-A5-6-080: [src/app/api/experiments/route.ts:4] MEDIUM — No authentication. A/B test experiment assignments and configurations exposed to anyone.

### src/app/api/projects/[id]/chat/route.ts

BUG-A5-6-081: [src/app/api/projects/[id]/chat/route.ts:10] CRITICAL — No authentication on AI chat endpoint. Anyone can send chat messages on any project, consuming the project owner's OpenAI API credits.

BUG-A5-6-082: [src/app/api/projects/[id]/chat/route.ts:186] HIGH — Unsanitized user messages forwarded to OpenAI. `history` array from request body passed directly without sanitization. User-controlled `role` field could be set to `"system"` (no enum validation), enabling prompt injection to override the system prompt.

BUG-A5-6-083: [src/app/api/projects/[id]/chat/route.ts:22] HIGH — Route has a `ChatBodySchema` defined in `api-schemas.ts` but does NOT use it. Manually extracts body fields without schema validation.

BUG-A5-6-084: [src/app/api/projects/[id]/chat/route.ts:59] MEDIUM — `p.area` accessed without null check. If `area` is undefined (optional in `PolygonSchema`), produces `NaN` which propagates into total area and context sent to OpenAI.

### src/app/api/projects/[id]/route.ts

BUG-A5-6-085: [src/app/api/projects/[id]/route.ts:9] CRITICAL — No authentication on GET/PUT/PATCH/DELETE. All four handlers have no authentication. Anyone can read, modify, or delete any project.

BUG-A5-6-086: [src/app/api/projects/[id]/route.ts:112] MEDIUM — No maximum length check on thumbnail string in PATCH. A multi-gigabyte string could be sent and stored (DoS via memory/storage exhaustion).

BUG-A5-6-087: [src/app/api/projects/[id]/route.ts:58] MEDIUM — `err.message` returned in 500 response body. Leaks internal details.

BUG-A5-6-088: [src/app/api/projects/[id]/route.ts:81] LOW — `unit: s.unit as 'm' | 'ft' | 'in' | 'mm'` — Zod schema allows `'cm'` but the type cast narrows to only 4 values. 'cm' silently passes validation but may cause issues downstream.

### src/app/api/projects/[id]/pages/route.ts

BUG-A5-6-089: [src/app/api/projects/[id]/pages/route.ts:12] HIGH — No authentication on pages endpoint. Anyone can read or modify page data for any project.

BUG-A5-6-090: [src/app/api/projects/[id]/pages/route.ts:44] MEDIUM — Race condition in upsert logic. Code first tries `updatePage`, then falls back to `createPage`. Two concurrent requests for the same non-existent page could both create, producing duplicate page records.

### src/app/api/projects/[id]/upload/route.ts

BUG-A5-6-091: [src/app/api/projects/[id]/upload/route.ts:10] CRITICAL — No authentication on file upload. Anyone can upload a PDF to any project without authentication, potentially overwriting existing project data.

BUG-A5-6-092: [src/app/api/projects/[id]/upload/route.ts:26] MEDIUM — MIME type validation is bypassable. Both `file.type` and `file.name` are client-controlled values in FormData and can be trivially spoofed. Attacker could upload malicious non-PDF file with a `.pdf` extension.

BUG-A5-6-093: [src/app/api/projects/[id]/upload/route.ts:39] MEDIUM — Entire file loaded into memory as Buffer (up to 50MB). Under concurrent upload load, could exhaust server memory (50MB × N concurrent uploads).

### src/app/api/projects/[id]/ai-takeoff/route.ts

BUG-A5-6-094: [src/app/api/projects/[id]/ai-takeoff/route.ts:10] HIGH — No authentication or authorization. Any caller with a valid project UUID can trigger AI analysis, consuming expensive AI API credits. Rate limiting (10/min per IP) is insufficient since IPs can be spoofed via `x-forwarded-for`.

BUG-A5-6-095: [src/app/api/projects/[id]/ai-takeoff/route.ts:22] MEDIUM — `req.json()` called without `.catch()`. Invalid JSON body throws into catch block with misleading "AI takeoff failed" error instead of 400.

### src/app/api/projects/[id]/ai-takeoff/apply/route.ts

BUG-A5-6-096: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:118] HIGH — No authentication or authorization. Any caller can create classifications and polygons in any project.

BUG-A5-6-097: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:159] MEDIUM — Race condition: `deletePolygonsByPage` deletes ALL existing polygons for the page before iterating `validElements`. If request fails midway, previously existing polygons are destroyed with no rollback — partial data loss.

BUG-A5-6-098: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:139] LOW — Validated element cast as `AIDetectedElement` from original `el` instead of using `result.data` from Zod parsing. Extra/unvalidated properties from input leak through, bypassing schema stripping.

### src/app/api/projects/[id]/polygons/route.ts

BUG-A5-6-099: [src/app/api/projects/[id]/polygons/route.ts:23] HIGH — No authentication on DELETE endpoint. Any caller can delete all polygons for any page of any project.

BUG-A5-6-100: [src/app/api/projects/[id]/polygons/route.ts:41] HIGH — No authentication on POST. Any caller can create polygons in any project.

### src/app/api/projects/[id]/classifications/route.ts

BUG-A5-6-101: [src/app/api/projects/[id]/classifications/route.ts:22] HIGH — No authentication on POST. Any caller can create classifications in any project.

BUG-A5-6-102: [src/app/api/projects/[id]/classifications/route.ts:34] MEDIUM — `id` field read from raw `body` object (`body.id`) rather than validated `data`. `ClassificationCreateSchema` does not define an `id` field, so malicious client can inject any arbitrary string as the classification ID.

BUG-A5-6-103: [src/app/api/projects/[id]/classifications/route.ts:39] MEDIUM — `body.formula`, `body.formulaUnit`, `body.formulaSavedToLibrary` read from raw unvalidated body rather than Zod-validated data. These fields are not in `ClassificationCreateSchema`, bypassing all validation.

### src/app/api/projects/[id]/assemblies/route.ts

BUG-A5-6-104: [src/app/api/projects/[id]/assemblies/route.ts:28] HIGH — No authentication on POST. Any caller can create assemblies in any project.

BUG-A5-6-105: [src/app/api/projects/[id]/assemblies/route.ts:38] MEDIUM — Destructures from raw `body` instead of `bodyResult.data`. Validation performed but validated data never used. Combined with `.passthrough()`, unvalidated fields passed to `createAssembly`.

### src/app/api/projects/[id]/scale/route.ts

BUG-A5-6-106: [src/app/api/projects/[id]/scale/route.ts:25] HIGH — No authentication on POST. Any caller can set the scale for any project, which directly affects all measurement calculations.

BUG-A5-6-107: [src/app/api/projects/[id]/scale/route.ts:36] MEDIUM — Unsafe type assertion: cast narrows to 4 values ('ft'|'in'|'m'|'mm') but `ScaleSchema` actually allows 'cm'. Silently allows 'cm' through Zod but may cause issues downstream.

### src/app/api/projects/[id]/webhooks/route.ts

BUG-A5-6-108: [src/app/api/projects/[id]/webhooks/route.ts:27] CRITICAL — No authentication on POST. Any caller can register a webhook URL for any project. This is an SSRF vector: attacker registers webhook pointing to internal service (e.g., `http://169.254.169.254/latest/meta-data/`), and every subsequent project event triggers the server to make requests to that internal endpoint.

BUG-A5-6-109: [src/app/api/projects/[id]/webhooks/route.ts:12] HIGH — URL validation only checks `u.startsWith('http')` — allows `http://` (non-TLS), does not block internal/private network addresses. No SSRF protection.

BUG-A5-6-110: [src/app/api/projects/[id]/webhooks/route.ts:46] HIGH — No authentication on DELETE. Also, DELETE uses webhook's own `id` rather than scoping to the project from URL path. Attacker can delete any webhook from any project.

BUG-A5-6-111: [src/app/api/projects/[id]/webhooks/route.ts:59] MEDIUM — `unregisterWebhook(webhookId)` does not verify webhook belongs to the project in URL path. Attacker targeting project A can delete webhooks belonging to project B.

BUG-A5-6-112: [src/app/api/projects/[id]/webhooks/route.ts:13] LOW — No limit on number of webhooks per project. Attacker could register thousands, causing DoS when events fire (each event triggers N fetch calls).

### src/app/api/projects/[id]/scales/route.ts

BUG-A5-6-113: [src/app/api/projects/[id]/scales/route.ts:57] HIGH — No authentication on PUT. Any caller can bulk-set scales for any project.

### src/app/api/projects/[id]/batch/route.ts

BUG-A5-6-114: [src/app/api/projects/[id]/batch/route.ts:48] HIGH — No authentication on batch endpoint. Any caller can create/delete polygons and classifications in any project.

BUG-A5-6-115: [src/app/api/projects/[id]/batch/route.ts:60] MEDIUM — Partial failure without transaction semantics. If operation 250 out of 500 fails, operations 1-249 already committed with no rollback. Response returns 200 with mixed results.

BUG-A5-6-116: [src/app/api/projects/[id]/batch/route.ts:6] LOW — `PointSchema` does not use `.finite()` on `x` and `y`, allowing `NaN`, `Infinity`, `-Infinity` as valid coordinates.

BUG-A5-6-117: [src/app/api/projects/[id]/batch/route.ts:80] LOW — `deletePolygonStore(id, op.data.id)` — no authorization check that the polygon being deleted actually belongs to project `id`. Could delete polygons from other projects.

### src/app/api/projects/[id]/estimates/route.ts

BUG-A5-6-118: [src/app/api/projects/[id]/estimates/route.ts:20] MEDIUM — No authentication on GET. Exposes project cost estimate data to any caller.

BUG-A5-6-119: [src/app/api/projects/[id]/estimates/route.ts:72] MEDIUM — No authentication on POST.

### src/app/api/admin/errors/route.ts

BUG-A5-6-120: [src/app/api/admin/errors/route.ts:11] CRITICAL — Authentication is bypassed when `ADMIN_KEY` environment variable is not set. The condition `if (adminKey)` means if `ADMIN_KEY` is unset/empty, NO auth check is performed and the error log is publicly accessible. Should deny access by default.

BUG-A5-6-121: [src/app/api/admin/errors/route.ts:14] MEDIUM — Admin key comparison uses `===` (string equality) rather than constant-time comparison. Vulnerable to timing attacks.

BUG-A5-6-122: [src/app/api/admin/errors/route.ts:19] MEDIUM — Error log returned in full without pagination or size limits. Could return a massive JSON response causing memory issues.

### src/app/api/ai-takeoff/route.ts

BUG-A5-6-123: [src/app/api/ai-takeoff/route.ts:285] HIGH — No authentication. Any caller can trigger expensive OpenAI/OpenRouter API calls and persist data into any project.

BUG-A5-6-124: [src/app/api/ai-takeoff/route.ts:375] HIGH — User-supplied API key via `X-OpenAI-Api-Key` header accepted and used directly. Attacker could supply a stolen key and the server would make requests on their behalf with the server's IP.

BUG-A5-6-125: [src/app/api/ai-takeoff/route.ts:387] MEDIUM — Default model hardcoded as `"gpt-5.4"` which does not exist. If user doesn't specify a model, every request will fail with model-not-found error from OpenAI.

BUG-A5-6-126: [src/app/api/ai-takeoff/route.ts:386] MEDIUM — OpenRouter routing logic flawed: models starting with `"openai/"` (an OpenRouter convention) are routed to OpenAI, which doesn't understand the `"openai/"` prefix — requests would fail.

BUG-A5-6-127: [src/app/api/ai-takeoff/route.ts:485] MEDIUM — SSRF: endpoint constructs internal API URLs using `new URL(req.url).origin`. If the `Host` header is manipulated, the origin could point to an attacker-controlled server, redirecting classification and polygon creation calls.

BUG-A5-6-128: [src/app/api/ai-takeoff/route.ts:192] MEDIUM — `parseDetectedElements` uses naive `indexOf('[')` / `lastIndexOf(']')` extraction on AI response. A response like `"text [ ] more text [actual data]"` would extract garbage JSON.

BUG-A5-6-129: [src/app/api/ai-takeoff/route.ts:509] LOW — `deletePolygonsByPage` called before polygon creation; if creation fails partway through, existing polygons are already deleted with no rollback.

### src/app/api/openapi-spec.json

BUG-A5-6-130: [src/app/api/openapi-spec.json:139] LOW — Multiple response status code mismatches between spec and implementation (POST returns 200 in spec but 201 in code for projects, classifications, assemblies, polygons).

BUG-A5-6-131: [src/app/api/openapi-spec.json:2093] LOW — `ProjectId` parameter pattern uses `^[a-zA-Z0-9_-]+$` but actual code validates as `z.string().uuid()`. Pattern allows non-UUID strings the code would reject.

BUG-A5-6-132: [src/app/api/openapi-spec.json:2086] LOW — No security schemes defined in spec. Docs provide no guidance on authentication and don't reflect the `x-admin-key` header used by admin errors endpoint.

---

## Library Files — `src/lib/`

### src/lib/ai-results-loader.ts

BUG-A5-6-133: [src/lib/ai-results-loader.ts:61] MEDIUM — Division-by-zero risk: `ppu` (pixelsPerUnit) defaults to `1` via `?? 1`, but if `scale.pixelsPerUnit` is explicitly `0`, it flows through as `0` since `0 ?? 1` evaluates to `0`. Downstream `calculateLinearFeet` on line 80 could produce `Infinity` or `NaN`.

### src/lib/api-client.ts

BUG-A5-6-134: [src/lib/api-client.ts:65] HIGH — Path injection / IDOR: all functions interpolate user-supplied `projectId` and `id` directly into URL paths without any validation or encoding. Values containing `/`, `?`, `#`, or `../../` could manipulate the URL path.

BUG-A5-6-135: [src/lib/api-client.ts:30] MEDIUM — No authentication headers. The `request` function does not attach Authorization headers or CSRF tokens, making the application vulnerable to CSRF attacks.

BUG-A5-6-136: [src/lib/api-client.ts:30] MEDIUM — No request timeout. `fetch()` used without `AbortController` or timeout — requests can hang indefinitely.

### src/lib/supabase.ts

BUG-A5-6-137: [src/lib/supabase.ts:19] MEDIUM — Proxy only implements `get` trap. Operations like `has`, `set`, or `ownKeys` operate on the empty object `{}` rather than the Supabase client, producing incorrect behavior.

### src/lib/estimate-storage.ts

BUG-A5-6-138: [src/lib/estimate-storage.ts:16] MEDIUM — Unsafe `JSON.parse` without schema validation. localStorage data parsed and cast to `UnitCostMap` directly. Tampered data (e.g., via XSS) could have unexpected shape, causing runtime errors or injection of unexpected values.

### src/lib/webhooks.ts

BUG-A5-6-139: [src/lib/webhooks.ts:29] CRITICAL — No URL validation on webhook registration. Attacker could register internal/private network URLs (e.g., `http://169.254.169.254/`, `file:///etc/passwd`), causing SSRF when `fireWebhook` is called.

BUG-A5-6-140: [src/lib/webhooks.ts:68] MEDIUM — No timeout on outbound webhook fetch. A slow/hanging webhook target holds the connection open indefinitely, tying up server resources.

BUG-A5-6-141: [src/lib/webhooks.ts:61] MEDIUM — Sensitive data leakage: `payload` serialized and sent to arbitrary external URLs without filtering or redaction. May contain user PII, API keys, or internal state.

### src/lib/sanitize.ts

BUG-A5-6-142: [src/lib/sanitize.ts:7] MEDIUM — Incomplete HTML sanitization: regex `/<[^>]*>/g` strips tags but does not handle HTML entities (`&lt;script&gt;`). Insufficient to prevent XSS for output rendered as HTML.

BUG-A5-6-143: [src/lib/sanitize.ts:16] MEDIUM — `validatePoints` enforces minimum of 3 points, but linear measurements require only 2 and count markers only 1. Validation too restrictive for non-area types.

### src/lib/plugin-system.ts

BUG-A5-6-144: [src/lib/plugin-system.ts:30] HIGH — No plugin name collision handling. `register` uses `plugin.name` as Map key — a malicious plugin can overwrite a legitimate plugin via `this.plugins.set(plugin.name, plugin)`, hijacking all future event callbacks.

BUG-A5-6-145: [src/lib/plugin-system.ts:39] HIGH — Arbitrary code execution via plugin hooks. `emit` calls arbitrary functions supplied by plugins with application data. No sandboxing, no validation of plugin origin, no capability restriction.

### src/lib/plugins.ts

BUG-A5-6-146: [src/lib/plugins.ts:18] MEDIUM — Duplicate plugin names not prevented. `registerPlugin` uses `push()`, so multiple plugins with same name have all hooks triggered — potential double-processing.

BUG-A5-6-147: [src/lib/plugins.ts:28] LOW — Silent error swallowing. All plugin errors caught with no logging, making debugging impossible.

### src/lib/audit-log.ts

BUG-A5-6-148: [src/lib/audit-log.ts:44] HIGH — Unauthenticated audit log submission. `createAuditEntry` fires POST to `/api/audit-log` without any authentication token. Attacker can spoof audit entries, undermining audit trail integrity.

BUG-A5-6-149: [src/lib/audit-log.ts:32] MEDIUM — Unsafe `JSON.parse` of localStorage without schema validation. Tampered data could cause downstream failures.

BUG-A5-6-150: [src/lib/audit-log.ts:14] LOW — `createAuditEntry` does not accept or populate `userId` field. All audit entries created without user attribution — audit log useless for accountability.

### src/lib/ab-testing.ts

BUG-A5-6-151: [src/lib/ab-testing.ts:84] MEDIUM — Potential crash on empty variants. If `experiment.variants` is empty, accessing `experiment.variants[experiment.variants.length - 1].name` throws TypeError on `.name` of `undefined`.

### src/lib/custom-shortcuts.ts

BUG-A5-6-152: [src/lib/custom-shortcuts.ts:28] MEDIUM — Unsafe `JSON.parse` of localStorage without schema validation. Tampered value could contain prototype-pollution payloads (e.g., `{"__proto__": {"isAdmin": true}}`).

### src/lib/workspace.ts

BUG-A5-6-153: [src/lib/workspace.ts:20] MEDIUM — `JSON.parse(raw)` result trusted as `Workspace[]` without validation. Tampered localStorage data propagates throughout application.

BUG-A5-6-154: [src/lib/workspace.ts:28] MEDIUM — `saveWorkspaces` does not guard against server-side execution. Calling during SSR throws ReferenceError on `localStorage`.

### src/lib/feature-flags.ts

BUG-A5-6-155: [src/lib/feature-flags.ts:97] HIGH — `loadFlags()` references `process.env.FEATURE_FLAGS` unconditionally at module load time. On client side, `process` may not be defined, causing ReferenceError crash.

BUG-A5-6-156: [src/lib/feature-flags.ts:57] MEDIUM — Flag resolution logic only checks for `'false'` from env vars and localStorage, never for `'true'`. Env can only disable flags, never enable them — asymmetric behavior.

BUG-A5-6-157: [src/lib/feature-flags.ts:5] LOW — `DEFAULT_FLAGS` (legacy) and `flagDefaults` (wave 12) are two separate flag systems with no connection. Wrong function call for a given flag silently returns `false`.

### src/lib/measurex-api.ts

BUG-A5-6-158: [src/lib/measurex-api.ts:11] MEDIUM — Entire internal API (`selectPolygon`, `reclassify`, `getPolygons`, `getClassifications`) exposed on `window.measurex` with no access control. Any script (browser extensions, XSS, injected ads) can manipulate project data.

### src/lib/ai-sheet-namer.ts

BUG-A5-6-159: [src/lib/ai-sheet-namer.ts:15] MEDIUM — OpenAI API call has no request timeout. If API hangs, fetch hangs indefinitely, potentially blocking operations.

### src/lib/ai-settings.ts

BUG-A5-6-160: [src/lib/ai-settings.ts:30] HIGH — `saveAiSettings` stores `openaiApiKey` in plain text in localStorage. Accessible to any JavaScript on the same origin (XSS, browser extensions, shared computers). API keys should never be stored in localStorage.

BUG-A5-6-161: [src/lib/ai-settings.ts:22] MEDIUM — `JSON.parse(raw)` result spread into return object with no validation. Tampered localStorage value could inject unexpected property types.

### src/lib/with-cache.ts

BUG-A5-6-162: [src/lib/with-cache.ts:21] MEDIUM — If handler returns non-2xx status (e.g., 500 error), `Cache-Control: public` header is still applied, causing CDNs/browsers to cache error responses. Errors should use `no-store` or `private`.

### src/lib/measurement-settings.ts

BUG-A5-6-163: [src/lib/measurement-settings.ts:64] MEDIUM — `loadMeasurementSettings` parses JSON from localStorage with `??` fallbacks but does not validate types. `parsed.unit` could be `"foobar"` (neither 'imperial' nor 'metric') and would be accepted.

### src/lib/error-tracker.ts

BUG-A5-6-164: [src/lib/error-tracker.ts:52] MEDIUM — Global event listeners registered as module side-effect at import time. In Next.js with HMR, listeners may attach multiple times, leading to duplicate error captures.

BUG-A5-6-165: [src/lib/error-tracker.ts:15] LOW — `buffer` array is module-level singleton. In server-side contexts, one user's errors could be visible to another user's debug session via `getErrors()`.

### src/lib/openai-guard.ts

BUG-A5-6-166: [src/lib/openai-guard.ts:6] CRITICAL — `NEXT_PUBLIC_OPENAI_API_KEY` is a `NEXT_PUBLIC_` prefixed env var. Next.js inlines these into client-side bundles. Using this as fallback for the OpenAI API key means the secret API key is exposed to all users in the browser JavaScript bundle.

### src/lib/api-schemas.ts

BUG-A5-6-167: [src/lib/api-schemas.ts:68] MEDIUM — `PolygonUpdateSchema.points` uses `.min(1)` but create schema uses `.min(2)`. Update could set points to a single point, which is geometrically invalid.

BUG-A5-6-168: [src/lib/api-schemas.ts:59] MEDIUM — `AssemblyCreateSchema.items[].quantity` uses `z.number()` with no constraints — allows negative, zero, NaN, or Infinity quantities.

BUG-A5-6-169: [src/lib/api-schemas.ts:142] MEDIUM — `DrawingBodySchema` uses `.passthrough()`, disabling Zod's default stripping of unknown keys, allowing injection of unexpected fields.

BUG-A5-6-170: [src/lib/api-schemas.ts:147] LOW — `AiTakeoffBodySchema.imageBase64` has `.min(1)` but no max length constraint. Attacker can submit multi-gigabyte base64 string causing memory exhaustion.

### src/lib/ws-client.ts

BUG-A5-6-171: [src/lib/ws-client.ts:53] MEDIUM — SSE message parsed with `JSON.parse(raw.data) as SSEEvent` with no runtime validation. Malicious/buggy server could send any JSON shape, blindly cast and accessed.

BUG-A5-6-172: [src/lib/ws-client.ts:229] LOW — `lastEventId` is module-level, shared across project connections. When switching projects without reset, stale ID from previous project passed to new project's SSE URL.

### src/lib/ai-takeoff.ts

BUG-A5-6-173: [src/lib/ai-takeoff.ts:62] MEDIUM — Base64 image embedded in JSON body with no client-side size limit check. Large canvas capture could produce payload of tens of megabytes, exceeding server body limits or causing OOM.

BUG-A5-6-174: [src/lib/ai-takeoff.ts:110] LOW — Retry loop only retries once. 400 Bad Request (client error) retried unnecessarily; 429 rate-limit with Retry-After header not respected.

### src/lib/perf-monitor.ts

BUG-A5-6-175: [src/lib/perf-monitor.ts:107] MEDIUM — `navigator.sendBeacon` sends body as string without setting Content-Type. Receiving endpoint gets `text/plain` instead of `application/json`. Metrics may be rejected or misinterpreted.

### src/lib/export.ts

BUG-A5-6-176: [src/lib/export.ts:3] HIGH — xlsx@0.18.x has known CVEs (CVE-2023-30533 and related) allowing arbitrary code execution via crafted spreadsheet files. Vulnerable library imported and bundled.

BUG-A5-6-177: [src/lib/export.ts:151] LOW — Summary sheet uses `clsPolygons[0].pageNumber` to determine unit for entire classification. If polygons span multiple pages with different scales, displayed unit could be misleading.

### src/lib/safe-id.ts

BUG-A5-6-178: [src/lib/safe-id.ts:10] LOW — `SAFE_ID_RE` does not enforce maximum length. Very long valid IDs could hit filesystem path length limits.

### src/lib/keyboard-handler.ts

BUG-A5-6-179: [src/lib/keyboard-handler.ts:84] MEDIUM — Delete/Backspace calls `store.deleteSelected?.()` but `deleteSelected` is optional. If undefined, `?.()` silently does nothing, but `event.preventDefault()` still fires, swallowing keypress with no visible feedback.

BUG-A5-6-180: [src/lib/keyboard-handler.ts:59] LOW — `Cmd+X` triggers `mergeLines` without `event.preventDefault()`. Browser's default Cut action also fires, potentially cutting selected content alongside the merge operation.

### src/lib/store.ts

BUG-A5-6-181: [src/lib/store.ts:24] MEDIUM — `apiSync` is fire-and-forget with `.catch()` that only logs. If API call fails, local state is already updated optimistically but server state never corrected. No retry or conflict resolution — silent data divergence.

BUG-A5-6-182: [src/lib/store.ts:686] MEDIUM — When `cutPolygon` fails (Turf error), the polygon is silently deleted from state. User's polygon disappears with no error message. A geometry error should not delete user data.

BUG-A5-6-183: [src/lib/store.ts:756] LOW — `setCurrentPage` fires fetch for scale data without guarding against concurrent calls. Rapid page switching could cause out-of-order resolution, older page's scale overwriting current page's scale.

BUG-A5-6-184: [src/lib/store.ts:835] LOW — Redo stack grows without bound. Undo stack capped at `MAX_UNDO_STACK` (50) but redo stack has no similar cap.

### src/lib/polygon-utils.ts

BUG-A5-6-185: [src/lib/polygon-utils.ts:68] LOW — `mergePolygons` does not validate that inputs have at least 3 points. If fewer, `turf.polygon` throws, and catch fallback concatenates arrays, producing geometrically meaningless polygon.

### src/lib/snap-utils.ts

BUG-A5-6-186: [src/lib/snap-utils.ts:106] MEDIUM — `getGridSnapPoints` calls `Math.ceil(snapRadius / gridSize)`. When `gridSize` is zero or negative, produces `Infinity` or `-Infinity`, causing the nested loop to run indefinitely (infinite loop / hang).

### src/lib/auto-scale.ts

BUG-A5-6-187: [src/lib/auto-scale.ts:89] LOW — Regex character class `[ -]` matches space, hyphen, and all ASCII characters between 0x20 and 0x2D (including `!`, `"`, `#`, `$`, `%`, `&`, `'`, etc.). Hyphen should be escaped: `[ \\-]`.

### src/lib/rate-limit.ts

BUG-A5-6-188: [src/lib/rate-limit.ts:66] HIGH — IP address for rate limiting extracted from `x-forwarded-for` header, which is trivially spoofable by any client. Attacker can bypass rate limiter entirely by setting different `X-Forwarded-For` on every request.

BUG-A5-6-189: [src/lib/rate-limit.ts:10] MEDIUM — `hits` Map is module-scoped and in-memory. In serverless environment, each cold start creates a fresh Map, making rate limiter ineffective in production.

### src/lib/types.ts

BUG-A5-6-190: [src/lib/types.ts:44] LOW — `ScaleCalibration.unit` type is `'ft' | 'in' | 'm' | 'mm'` but does not include `'cm'` which is present in Zod schema `ScaleSchema.unit`. API validation accepts 'cm' but TypeScript type rejects it.

### src/lib/sse-broadcast.ts

BUG-A5-6-191: [src/lib/sse-broadcast.ts:30] MEDIUM — Event buffer capped at 50 entries per project but no cap on number of projects. Many unique `projectId` values cause unbounded `projectEventBuffer` Map growth — memory leak.

### src/lib/demo-data.ts

BUG-A5-6-192: [src/lib/demo-data.ts:191] LOW — `loadDemoProject` parses arbitrary JSON from localStorage with no schema validation. Malicious/corrupt value produces object with unexpected shape.

### src/lib/validation.ts

BUG-A5-6-193: [src/lib/validation.ts:40] LOW — `createPolygonSchema` requires `min(2)` points but a geometric polygon requires at least 3 points for a closed shape. Allows degenerate polygon (line segment).

### src/lib/with-perf.ts

BUG-A5-6-194: [src/lib/with-perf.ts:13] MEDIUM — If handler throws an error (not a Response), `status` remains 500 and `recordApiCall` is called, but the raw error is re-thrown. Caller receives raw error, not a Response, which could crash the Next.js route handler.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 10 |
| HIGH     | 36 |
| MEDIUM   | 76 |
| LOW      | 72 |
| **Total** | **194** |

### CRITICAL (10)
- BUG-A5-6-004: perf/summary uses service-role key with no auth (RLS bypass)
- BUG-A5-6-008: perf/route silent data loss on missing env vars
- BUG-A5-6-022: flags POST unauthenticated — anyone can toggle feature flags
- BUG-A5-6-065: ws/route unauthenticated SSE — real-time project data leak
- BUG-A5-6-074: projects listing unauthenticated — full project enumeration
- BUG-A5-6-081: project chat unauthenticated — OpenAI credit exhaustion
- BUG-A5-6-085: project CRUD unauthenticated — read/modify/delete any project
- BUG-A5-6-091: upload unauthenticated — anyone can upload PDFs to any project
- BUG-A5-6-108: webhooks POST unauthenticated — SSRF via webhook registration
- BUG-A5-6-120: admin/errors auth bypass when ADMIN_KEY env var unset
- BUG-A5-6-139: webhooks.ts no URL validation — SSRF to internal networks
- BUG-A5-6-166: openai-guard.ts NEXT_PUBLIC_ prefix leaks API key to browser

### Systemic Issues

1. **No authentication anywhere**: Zero API routes implement authentication. Every endpoint that reads or mutates project data is fully accessible to unauthenticated users. This is the single most critical systemic issue.

2. **Service role key usage without auth**: The perf endpoints use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) in unauthenticated endpoints.

3. **Raw body used instead of validated data**: Multiple routes (classifications, assemblies, scale, ai-takeoff/apply) validate with Zod but then use the raw `body` object instead of `bodyResult.data`, bypassing all schema transformations and stripping.

4. **SSRF via webhooks**: No URL validation on webhook registration combined with no auth allows any anonymous user to register internal network URLs as webhook targets.

5. **API key exposure**: `NEXT_PUBLIC_OPENAI_API_KEY` fallback in `openai-guard.ts` and plain-text storage in `ai-settings.ts` localStorage leak the OpenAI API key.

6. **Rate limiter ineffective**: IP-based rate limiting uses spoofable `x-forwarded-for` header and in-memory storage that resets on serverless cold starts.

7. **In-memory state in serverless context**: Audit log, error log, webhooks, rate limiter, and SSE client maps all use module-level storage that is ephemeral in serverless deployments.

8. **Unsafe localStorage parsing**: Multiple lib files parse localStorage with `JSON.parse` and cast without schema validation, enabling data injection via XSS or shared machines.
