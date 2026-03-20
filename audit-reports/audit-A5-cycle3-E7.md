# Audit A5 — Cycle 3 — Engineer E7

**Scope:** API route security & quality audit
**Date:** 2026-03-20
**Engineer:** E7
**Bug ID range:** BUG-A5-3-051 → BUG-A5-3-099

---

## File-by-file findings

### 1. `src/app/api/image-search/route.ts`

BUG-A5-3-051: src/app/api/image-search/route.ts:197 [MEDIUM] No auth check on POST handler. Any anonymous client can trigger Bing/Google/Unsplash API calls, burning third-party API quota. Rate limiting (10/min per IP) is present but IP-based limits are trivially bypassed via `X-Forwarded-For` spoofing (see BUG-A5-3-068).

BUG-A5-3-052: src/app/api/image-search/route.ts:214-224 [LOW] External image search providers are queried sequentially (Bing → Google → Unsplash → Project Sheets). If Bing times out (no timeout configured on fetch), the handler blocks indefinitely. No `AbortSignal` or timeout on any of the three external fetch calls.

BUG-A5-3-053: src/app/api/image-search/route.ts:8 [LOW] `projectId` is validated as optional string by Zod but is not validated as a UUID. A non-UUID projectId is passed directly to `getPages(projectId)` which calls `assertSafeId` in the store layer — so it won't cause path traversal, but will produce a 500 error with an internal error message ("Invalid projectId: contains disallowed characters") rather than a clean 400.

BUG-A5-3-054: src/app/api/image-search/route.ts:230 [LOW] Error response leaks `err.message` to the client. If an internal error occurs (e.g., file system error), the raw error message is sent in the JSON response body.

### 2. `src/app/api/metrics/route.ts`

BUG-A5-3-055: src/app/api/metrics/route.ts:4 [HIGH] No auth check. The GET endpoint exposes internal performance metrics (route names, durations, status codes, timestamps) to any anonymous caller. This is an information disclosure risk — attackers can enumerate API routes and identify slow endpoints.

BUG-A5-3-056: src/app/api/metrics/route.ts:4 [MEDIUM] No rate limiting. The endpoint can be hammered freely.

### 3. `src/app/api/openapi.json/route.ts`

BUG-A5-3-057: src/app/api/openapi.json/route.ts:5-7 [MEDIUM] `Access-Control-Allow-Origin: *` with no other CORS headers. While the spec itself is public, the wildcard CORS header sets a precedent that could be copy-pasted to sensitive routes. Not a vulnerability here, but a hygiene concern.

BUG-A5-3-058: src/app/api/openapi.json/route.ts:4 [LOW] No try/catch. If the JSON import fails or `spec` is undefined, the handler will throw an unhandled exception resulting in a generic 500 with no structured error body.

### 4. `src/app/api/perf/route.ts`

BUG-A5-3-059: src/app/api/perf/route.ts:31-34 [CRITICAL] Non-null assertion on `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.SUPABASE_SERVICE_ROLE_KEY!`. If either env var is undefined, `createClient` receives `undefined` and will either throw or silently create a broken client. The `catch` block swallows this, so the insert silently fails — but the crash risk is real if supabase-js changes its behavior on undefined inputs.

BUG-A5-3-060: src/app/api/perf/route.ts:11 [MEDIUM] `MetricSchema` uses `.passthrough()`, which allows any additional fields from the client to be passed directly into the Supabase `insert()` call at line 35. An attacker can inject arbitrary columns into `mx_perf_events` (e.g., `project_id`, `user_id`, or any column that exists on the table) by adding extra fields to the POST body.

BUG-A5-3-061: src/app/api/perf/route.ts:13 [MEDIUM] No auth check and no rate limiting. Any anonymous client can POST arbitrary perf metrics to Supabase, filling up the `mx_perf_events` table. This is a data pollution and potential storage DoS vector.

BUG-A5-3-062: src/app/api/perf/route.ts:35 [LOW] The `parsed.data` object (which includes passthrough fields) is inserted directly. Column names in the Zod schema use camelCase (`timestamp`) but Supabase tables typically use snake_case. The insert may silently drop fields or fail depending on table schema.

### 5. `src/app/api/perf/summary/route.ts`

BUG-A5-3-063: src/app/api/perf/summary/route.ts:3 [HIGH] No auth check. Exposes the last 100 perf events (including timestamps and any passthrough fields stored by BUG-A5-3-060) to any anonymous caller. Combined with BUG-A5-3-055, gives attackers full visibility into API usage patterns.

BUG-A5-3-064: src/app/api/perf/summary/route.ts:3 [MEDIUM] No rate limiting on GET endpoint.

BUG-A5-3-065: src/app/api/perf/summary/route.ts:5-11 [LOW] Uses service role key to query Supabase, bypassing all RLS policies. This is intentional for server-side queries, but means the endpoint returns all rows regardless of any user-scoping RLS rules on `mx_perf_events`.

### 6. `src/app/api/plugins/route.ts`

BUG-A5-3-066: src/app/api/plugins/route.ts:4 [LOW] No rate limiting on GET. Minor concern since the data is small and from an in-memory registry.

BUG-A5-3-067: src/app/api/plugins/route.ts:17 [LOW] POST handler returns 200 with a help message instead of 405 Method Not Allowed. Misleading status code — client code checking for 2xx will think the operation succeeded.

### 7. `src/app/api/projects/route.ts`

BUG-A5-3-068: src/app/api/projects/route.ts:6 [MEDIUM] No auth check on GET or POST. Any anonymous client can list all projects (including names and thumbnails) or create new projects. For a multi-tenant app, this is a data exposure and abuse vector.

BUG-A5-3-069: src/app/api/projects/route.ts:21 [LOW] Error response leaks `err.message` or `String(err)` to the client in the GET handler's catch block. Could expose internal file paths or Supabase error details.

BUG-A5-3-070: src/app/api/projects/route.ts:6 [LOW] No rate limiting on either GET or POST. An attacker can rapidly create projects to fill disk space (file mode) or Supabase storage.

### 8. `src/app/api/projects/[id]/route.ts`

BUG-A5-3-071: src/app/api/projects/[id]/route.ts:9 [MEDIUM] No auth check on GET, PUT, PATCH, or DELETE. Any anonymous client who knows (or guesses) a project UUID can read, modify, or delete any project. Project IDs are UUIDs so not trivially guessable, but once leaked (e.g., via shared link or logs) there is zero access control.

BUG-A5-3-072: src/app/api/projects/[id]/route.ts:58 [LOW] Multiple error catch blocks (lines 58, 100, 133) leak `err.message` or `String(err)` to the client. Could expose internal paths, Supabase errors, or stack details.

BUG-A5-3-073: src/app/api/projects/[id]/route.ts:110 [MEDIUM] PATCH handler at line 104 does not validate the body with a Zod schema. It does manual `typeof` checks for `thumbnail` and `name`, but `body.thumbnail` could be an arbitrarily large string (a multi-MB data URL). There is no size limit on the thumbnail field, enabling storage abuse.

BUG-A5-3-074: src/app/api/projects/[id]/route.ts:80 [LOW] In the PUT handler, `s.unit` is cast with `as 'm' | 'ft' | 'in' | 'mm'` at line 81 after Zod validates it as `z.string()` (not an enum). The Zod schema `ProjectPutSchema` allows any string for `state.scale.unit`, but the cast silently narrows the type. If an invalid unit like `"bananas"` is passed, it will be stored without error and cause downstream calculation bugs.

BUG-A5-3-075: src/app/api/projects/[id]/route.ts:83 [LOW] Similarly, `s.source` is cast as `'auto' | 'manual' | 'ai'` but the Zod schema allows any string. Invalid source values are persisted silently.

### 9. `src/app/api/projects/recent/route.ts`

BUG-A5-3-076: src/app/api/projects/recent/route.ts:4 [MEDIUM] No auth check. Exposes the 5 most recently updated project names/metadata to any anonymous caller.

BUG-A5-3-077: src/app/api/projects/recent/route.ts:4 [LOW] No rate limiting.

BUG-A5-3-078: src/app/api/projects/recent/route.ts:14 [LOW] Error response leaks `err.message` or `String(err)`.

### 10. `src/app/api/projects/restore/route.ts`

BUG-A5-3-079: src/app/api/projects/restore/route.ts:15 [HIGH] No auth check. Any anonymous client can restore a project from a snapshot or create a new project from a full export object. This endpoint accepts a complete project payload and writes it to storage, making it a powerful abuse vector.

BUG-A5-3-080: src/app/api/projects/restore/route.ts:22-23 [HIGH] No input validation on `body.projectId` and `body.snapshotId` in the snapshot restore path. These values are cast with `as string` and passed directly to `restoreSnapshot()`. If either is not a string (e.g., a number or object), the `assertSafeId` call inside `projectDir` will throw a 500 error, but malformed string values that pass `assertSafeId` could reference other projects' snapshot files.

BUG-A5-3-081: src/app/api/projects/restore/route.ts:27-86 [MEDIUM] The full-export restore path has no Zod validation. The `project` object is destructured with `as` casts throughout (lines 32-86). If any field is the wrong type (e.g., `classifications` is a string instead of an array), the `for...of` loop will throw a confusing runtime error. A malicious payload can also contain extremely large arrays, causing memory exhaustion.

BUG-A5-3-082: src/app/api/projects/restore/route.ts:15 [MEDIUM] No rate limiting. An attacker can repeatedly call this endpoint to create thousands of projects, exhausting disk space or Supabase storage.

BUG-A5-3-083: src/app/api/projects/restore/route.ts:97 [LOW] Error message leaks `err.message` or `String(err)`.

### 11. `src/app/api/projects/compare/route.ts`

BUG-A5-3-084: src/app/api/projects/compare/route.ts:12 [MEDIUM] `projectIdA` and `projectIdB` are destructured from `req.json()` with no type or format validation. They are only checked for truthiness (`!projectIdA || !projectIdB`), so any truthy non-string value (number, object, array) will be passed to `getPolygons()` and `getClassifications()`, which call `assertSafeId` and will throw a 500 with an internal error message.

BUG-A5-3-085: src/app/api/projects/compare/route.ts:6 [MEDIUM] No auth check. Any anonymous client can compare any two projects by UUID, revealing polygon counts, areas, classification names, and full polygon coordinate data in the response.

BUG-A5-3-086: src/app/api/projects/compare/route.ts:71-81 [MEDIUM] The response includes full `added`, `removed`, and `unchanged` polygon arrays with all fields (coordinates, areas, labels). This is a large data leak for what should be a summary endpoint. The `summary` object is redundant with the array lengths.

BUG-A5-3-087: src/app/api/projects/compare/route.ts:84 [LOW] Error message leaks `err.message`.

---

## Cross-cutting issues

BUG-A5-3-088: ALL ROUTES [HIGH] No authentication on any route. None of the 11 audited API routes verify user identity. There is no middleware, session check, or token validation anywhere in the API layer. This means all project data (create, read, update, delete, restore, compare) is accessible to any unauthenticated caller. This is the single most critical systemic issue.

BUG-A5-3-089: ALL ROUTES [MEDIUM] IP-based rate limiting is trivially spoofable. The `rateLimitResponse` function (used by only 2 of 11 routes) reads `X-Forwarded-For` header, which any client can set to an arbitrary value. Without a trusted proxy configuration that strips/rewrites this header, the rate limiter is effectively useless.

BUG-A5-3-090: ALL ROUTES [MEDIUM] In-memory rate limiter resets on serverless cold start. Since Next.js API routes in serverless environments (Vercel, etc.) can be served by different instances, the in-memory `Map` in `rate-limit.ts` is not shared across instances. Rate limiting is unreliable in production.

BUG-A5-3-091: ALL ROUTES [MEDIUM] Inconsistent rate limiting coverage. Only `image-search` and `compare` have rate limiting. Mutation endpoints (`projects POST`, `projects/[id] PUT/PATCH/DELETE`, `projects/restore POST`, `perf POST`) have no rate limiting despite being higher-risk.

BUG-A5-3-092: ALL ROUTES [LOW] Inconsistent error response shape. Some routes return `{ error: string }`, others return `{ error: string, details: object }`, and the rate limiter returns `{ error: string }` with different casing patterns. No standard error envelope.

BUG-A5-3-093: SUPABASE ROUTES [MEDIUM] Service role key bypasses RLS. `perf/route.ts`, `perf/summary/route.ts`, and the project-store all use `SUPABASE_SERVICE_ROLE_KEY` which bypasses Row Level Security. This is common for server-side operations, but means there is zero row-level access control — any authenticated request can affect any row. If auth is added later, RLS must also be configured per-user.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 4     |
| MEDIUM   | 15    |
| LOW      | 13    |
| **Total** | **33** |

### Top 5 priorities

1. **BUG-A5-3-088** — Add authentication middleware to all API routes
2. **BUG-A5-3-059** — Guard env var access in perf route to prevent crash on undefined
3. **BUG-A5-3-080** — Validate projectId/snapshotId as UUIDs in restore endpoint
4. **BUG-A5-3-060** — Remove `.passthrough()` from MetricSchema to prevent column injection
5. **BUG-A5-3-089/090/091** — Replace in-memory IP-based rate limiter with a production-grade solution (Redis, Upstash, etc.) and apply to all routes

### Clean files

None — every audited file has at least one finding.
