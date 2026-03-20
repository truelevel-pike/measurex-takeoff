# Audit Report — Cycle 3, Sector A5, Engineer E7

**Date:** 2026-03-20
**Scope:** API routes — image-search, metrics, openapi.json, perf, perf/summary, plugins, projects root, projects/[id], projects/[id]/ai-takeoff, projects/[id]/ai-takeoff/apply
**Criteria:** 14-point checklist (try/catch, auth, input validation, env vars, SQL/Supabase, response format, rate limiting, file paths, type safety, dead code, error leaks, Content-Type, streaming, race conditions)

---

## E7 FINDINGS — Routes: image-search, metrics, openapi, perf, plugins, projects root, projects/[id] main + ai-takeoff

---

### src/app/api/image-search/route.ts

BUG-A5-3-101: [src/app/api/image-search/route.ts:197] HIGH — No authentication on POST handler. Unauthenticated users can consume the server's Bing, Google CSE, and Unsplash API keys/quotas. An attacker can proxy unlimited image searches through the server's paid API credentials (rate limit only slows them to 10 req/min per IP, trivially bypassed with multiple IPs).

BUG-A5-3-102: [src/app/api/image-search/route.ts:8] MEDIUM — `projectId` validated only as `z.string().optional()`, not as UUID. While `project-store.getPages()` calls `assertSafeId()` which blocks path traversal, a non-UUID string like `"test"` bypasses the UUID format check that all other project routes enforce via `ProjectIdSchema`. This inconsistency means the image-search route can probe for non-UUID project directories that other routes would reject.

BUG-A5-3-103: [src/app/api/image-search/route.ts:230] LOW — Error catch block leaks `err.message` to the client: `(err instanceof Error ? err.message : 'Image search failed.')`. If an external API call fails with a detailed error (e.g., containing internal URLs, API key hints, or stack info), that detail is returned verbatim to the caller.

BUG-A5-3-104: [src/app/api/image-search/route.ts:214-221] LOW — External API calls (Bing → Google → Unsplash) are made sequentially. If Bing times out (no timeout configured on fetch), the entire request blocks. No `AbortController` or timeout is set on any of the three external fetches, so a slow upstream can hold the connection open indefinitely.

---

### src/app/api/metrics/route.ts

BUG-A5-3-105: [src/app/api/metrics/route.ts:4] MEDIUM — No authentication. Internal application performance metrics (from `getMetrics()`) are exposed to any unauthenticated caller. This can reveal server-side timing data, request counts, and internal component names — useful reconnaissance for attackers.

BUG-A5-3-106: [src/app/api/metrics/route.ts:4] LOW — No rate limiting. Endpoint can be polled at high frequency. Low severity because the response is computed in-memory and doesn't hit external services or databases.

---

### src/app/api/openapi.json/route.ts

BUG-A5-3-107: [src/app/api/openapi.json/route.ts:4-8] LOW — No try/catch around the handler. If `NextResponse.json(spec)` throws for any reason (e.g., circular reference in spec, though unlikely for a static import), the caller gets a raw Next.js 500 error page that may leak framework internals. Trivial to wrap.

BUG-A5-3-108: [src/app/api/openapi.json/route.ts:6] LOW — `Access-Control-Allow-Origin: *` is set without `Access-Control-Allow-Methods` or `Access-Control-Allow-Headers`. While wildcard CORS is standard for public API specs, the incomplete CORS headers mean preflight OPTIONS requests will fail. If this spec is consumed by browser-based tools (e.g., Swagger UI on a different origin), they may not be able to fetch it in all browsers.

---

### src/app/api/perf/route.ts

BUG-A5-3-109: [src/app/api/perf/route.ts:13] HIGH — No authentication and no rate limiting on POST. Anyone can insert arbitrary performance events into the `mx_perf_events` Supabase table. An attacker can flood the table with fake data, corrupting real metrics and potentially incurring Supabase storage/row costs.

BUG-A5-3-110: [src/app/api/perf/route.ts:11] MEDIUM — `MetricSchema` uses `.passthrough()`, which preserves any extra fields beyond the declared schema. These extra fields are passed directly to `supabase.from('mx_perf_events').insert(parsed.data)`. If the table has JSONB columns or loose column policies, an attacker can inject arbitrary key-value pairs into stored rows. At minimum this pollutes the data; at worst it could exploit downstream consumers that trust the table's contents.

BUG-A5-3-111: [src/app/api/perf/route.ts:32-33] MEDIUM — `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.SUPABASE_SERVICE_ROLE_KEY!` use non-null assertions. If either env var is undefined (common in dev/CI), `createClient(undefined, undefined)` is called. The Supabase client may throw a confusing error or silently malfunction. The `perf/summary` route correctly guards against this with an `if (!url || !key)` check, but this route does not.

---

### src/app/api/perf/summary/route.ts

BUG-A5-3-112: [src/app/api/perf/summary/route.ts:3] MEDIUM — No authentication. Returns the last 100 performance events (including any attacker-injected data from BUG-A5-3-109) to any unauthenticated caller. Combined with `.passthrough()` on the ingest side, this exposes whatever arbitrary fields were injected.

BUG-A5-3-113: [src/app/api/perf/summary/route.ts:14] LOW — `select('*')` returns all columns from `mx_perf_events`. If the table schema evolves to include internal fields (or if passthrough-injected fields are stored as columns), they are exposed to any caller. Should explicitly enumerate the columns to return.

BUG-A5-3-114: [src/app/api/perf/summary/route.ts:3] LOW — No rate limiting. Can be polled at high frequency. Moderate risk since each call hits Supabase with a query.

---

### src/app/api/plugins/route.ts

CLEAN: [src/app/api/plugins/route.ts] — Minimal surface area. GET returns an in-memory plugin list with try/catch. POST is a static informational message. No mutations, no database, no file I/O. Two minor notes below:

BUG-A5-3-115: [src/app/api/plugins/route.ts:4] LOW — No rate limiting on GET. Low impact since it reads from an in-memory registry with no external calls.

BUG-A5-3-116: [src/app/api/plugins/route.ts:17-26] LOW — POST handler always returns 200 with a static instructional message regardless of request body. This is effectively dead code as a POST endpoint — it performs no action and accepts no input. Should either be removed or changed to return 405 Method Not Allowed.

---

### src/app/api/projects/route.ts

BUG-A5-3-117: [src/app/api/projects/route.ts:6] HIGH — No authentication on GET (list all projects). Any unauthenticated user can enumerate every project in the system, including names, IDs, thumbnails, and summary counts. This is a full data enumeration vector.

BUG-A5-3-118: [src/app/api/projects/route.ts:25] HIGH — No authentication on POST (create project). Combined with no rate limiting, an attacker can create unlimited projects, filling disk/database storage. In file mode, each project creates a directory under `data/projects/`.

BUG-A5-3-119: [src/app/api/projects/route.ts:21] LOW — GET error handler leaks raw error details: `(err instanceof Error ? err.message : String(err))`. Could expose internal file paths or database connection errors.

---

### src/app/api/projects/[id]/route.ts

BUG-A5-3-120: [src/app/api/projects/[id]/route.ts:122] CRITICAL — No authentication on DELETE. Any user who knows (or guesses) a project UUID can permanently delete that project and all its data. Combined with BUG-A5-3-117 (unauthenticated project listing), an attacker can enumerate all project IDs then delete them all.

BUG-A5-3-121: [src/app/api/projects/[id]/route.ts:9] HIGH — No authentication on GET, PUT, or PATCH. Any user can read full project state (classifications, polygons, scale data, page info) or modify any project's data without authorization.

BUG-A5-3-122: [src/app/api/projects/[id]/route.ts:110] MEDIUM — PATCH handler does not validate body with a zod schema. Body is parsed with `req.json()` and fields are checked only via `typeof` (lines 112-113). This means `body.thumbnail` can be an arbitrarily long string (megabytes of base64 data) with no length limit, potentially exhausting storage. `body.name` has no length constraint either. Compare to PUT which uses `ProjectPutSchema` with proper validation.

BUG-A5-3-123: [src/app/api/projects/[id]/route.ts:80-83] MEDIUM — Type assertions `as 'm' | 'ft' | 'in' | 'mm'` on `s.unit` and `as 'auto' | 'manual' | 'ai'` on `s.source` bypass runtime validation. The `ProjectPutSchema` validates `unit` as `z.string()` (any string), not an enum. So a value like `unit: "lightyears"` passes zod validation, then the `as` cast silently narrows the TypeScript type without runtime enforcement. Downstream code expecting only the union values may behave unexpectedly.

BUG-A5-3-124: [src/app/api/projects/[id]/route.ts:58,100,133] LOW — Error handlers in GET (line 58), PUT (line 100), and DELETE (line 133) leak `err.message` or `String(err)` to the client. These may contain internal file system paths, database error details, or stack fragments.

BUG-A5-3-125: [src/app/api/projects/[id]/route.ts:9] LOW — No rate limiting on any method (GET, PUT, PATCH, DELETE). The DELETE method is especially concerning — no rate limit plus no auth means bulk deletion is trivial.

---

### src/app/api/projects/[id]/ai-takeoff/route.ts

BUG-A5-3-126: [src/app/api/projects/[id]/ai-takeoff/route.ts:10] HIGH — No authentication on POST. AI takeoff calls external AI APIs (likely OpenAI/Anthropic) which cost real money per invocation. Any unauthenticated user can trigger expensive AI analysis repeatedly. Rate limit (10 req/min) only slows the attack, and is trivially bypassed with multiple IPs.

BUG-A5-3-127: [src/app/api/projects/[id]/ai-takeoff/route.ts:70-71] MEDIUM — Error message includes the raw exception message: `Takeoff failed — try a different model or check your internet connection (${raw})`. The `raw` variable is `err.message` which could contain AI API error details (rate limit info, auth errors with partial key data, internal URLs, model names, or cost information).

BUG-A5-3-128: [src/app/api/projects/[id]/ai-takeoff/route.ts:22] LOW — `req.json()` called without `.catch()`. If the request body is not valid JSON, `req.json()` throws. Caught by the outer try/catch, but the thrown error's message (e.g., `"Unexpected token < in JSON at position 0"`) is passed through to the client via BUG-A5-3-127.

BUG-A5-3-129: [src/app/api/projects/[id]/ai-takeoff/route.ts:38-41] LOW — Error response distinguishes between "Project not found" (404 at line 32) and "PDF not found for project {id}" (404 at line 38). This allows an attacker to enumerate which project UUIDs exist (even if they lack PDFs) by observing the different error messages on 404 responses.

---

### src/app/api/projects/[id]/ai-takeoff/apply/route.ts

BUG-A5-3-130: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:118] HIGH — No authentication on POST. Anyone can inject arbitrary polygons and classifications into any project. This is a data integrity risk — an attacker can corrupt takeoff results for any project.

BUG-A5-3-131: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:118] HIGH — No rate limiting on this mutation endpoint. Unlike the parent `ai-takeoff/route.ts` which has rate limiting, the apply endpoint has none. An attacker can flood a project with thousands of polygons/classifications, corrupting data and degrading performance.

BUG-A5-3-132: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:156-161] MEDIUM — Race condition on concurrent apply requests for the same project/page. The sequence is: (1) `deletePolygonsByPage(id, page)` at line 159, (2) `getPolygons(id)` at line 161, (3) create new polygons in loop. If two apply requests arrive simultaneously, both execute `deletePolygonsByPage` and then both create their own polygons, resulting in duplicate data from both batches persisted.

BUG-A5-3-133: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:128] MEDIUM — `page` field extracted as `body?.page ?? 1` with no type or range validation. If `body.page` is `0`, `-5`, `3.7`, or `"abc"`, it is used directly in `deletePolygonsByPage(id, page)` and `createPolygon(id, { pageNumber: page })`. The `ElementSchema` validates elements but `page` itself is never validated. This could cause data integrity issues (e.g., polygons with negative page numbers).

BUG-A5-3-134: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:126] LOW — `req.json()` called without `.catch()`. If the body is invalid JSON, it throws and is caught by the outer try/catch, but the error message is leaked via BUG-A5-3-135.

BUG-A5-3-135: [src/app/api/projects/[id]/ai-takeoff/apply/route.ts:240] LOW — Error message leaks `err.message` to client: `const message = err instanceof Error ? err.message : 'Apply failed'`. Could expose internal database errors, file system paths, or other implementation details.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 7     |
| MEDIUM   | 8     |
| LOW      | 19    |
| **Total**| **35** |

### Critical findings
- **BUG-A5-3-120**: Unauthenticated DELETE on projects — full data destruction possible

### Systemic patterns
1. **No authentication anywhere**: Zero of the 10 audited routes check user identity. This is the single biggest risk — every mutation (create, update, delete project; inject polygons; trigger AI analysis) is open to the public internet.
2. **Inconsistent rate limiting**: Only 2 of 10 routes have rate limiting (image-search, ai-takeoff). Critical mutation endpoints (projects POST, projects DELETE, ai-takeoff/apply POST) have none.
3. **Error message leakage**: 7 routes pass raw `err.message` to the client, potentially exposing internal paths, database errors, and API details.
4. **Inconsistent input validation**: Some routes use proper zod schemas (image-search, perf, projects PUT), while others use ad-hoc `typeof` checks (projects PATCH) or no validation at all (ai-takeoff/apply `page` field).

---

*Engineer E7 — Cycle 3, Sector A5 — 2026-03-20*
