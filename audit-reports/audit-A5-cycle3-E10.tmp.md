# Audit Report — Cycle 3, Sector A5: src/lib/ (all files)
## Engineer: E10
## Date: 2026-03-20

---

## E10 FINDINGS — src/lib/ (all files)

### BUGS

BUG-A5-3-401: [src/lib/webhooks.ts:70] CRITICAL — SSRF vulnerability: `fireWebhook` calls `fetch(w.url, ...)` where `w.url` is user-supplied via `registerWebhook` with zero URL validation. An attacker can register webhooks pointing to internal services (e.g. `http://169.254.169.254/latest/meta-data/`, `http://localhost:5432/`, internal microservices) and exfiltrate data via the POST body or probe internal network topology. No allowlist, no schema check, no private-IP blocklist.

BUG-A5-3-402: [src/lib/webhooks.ts:26-40] HIGH — No limit on webhook registrations per project. `registerWebhook` inserts into an in-memory Map without any per-project cap. An attacker can register thousands of webhooks for a single project, causing memory exhaustion on the server and O(n) iteration in `fireWebhook` for every event fired.

BUG-A5-3-403: [src/lib/webhooks.ts:68-78] HIGH — No timeout on webhook delivery fetch. `fireWebhook` calls `fetch(w.url, ...)` with no `AbortController`/timeout. A malicious or slow webhook target can hold server connections open indefinitely, exhausting the Node.js connection pool and causing denial-of-service for all other outbound requests.

BUG-A5-3-404: [src/lib/openai-guard.ts:6,23] HIGH — `getOpenAIKey()` falls back to `process.env.NEXT_PUBLIC_OPENAI_API_KEY`. The `NEXT_PUBLIC_` prefix causes Next.js to bundle this value into client-side JavaScript, exposing the OpenAI API key to any user who inspects page source or network traffic. `ai-sheet-namer.ts` calls `getOpenAIKey()` client-side and sends the key directly to OpenAI. If this key has billing or admin permissions, it can be abused for unauthorized API usage.

BUG-A5-3-405: [src/lib/ai-settings.ts:14,30] HIGH — `saveAiSettings` persists `openaiApiKey` as plaintext in localStorage under key `mx-ai-settings`. Any XSS vulnerability, browser extension, or shared-device scenario leaks the API key. The key should never be stored client-side; it should be proxied through the server.

BUG-A5-3-406: [src/lib/rate-limit.ts:10] MEDIUM — The `hits` Map stores timestamps per IP but never evicts entries for IPs that stop making requests. Over the lifetime of the process, every unique IP that ever made a request remains in the Map. Under sustained traffic with diverse IPs (CDN, proxies, bots), this is an unbounded memory leak that grows linearly with unique client count.

BUG-A5-3-407: [src/lib/rate-limit.ts:32-33] MEDIUM — `checkRateLimit` pushes the current request's timestamp into the `valid` array *before* checking whether the limit is exceeded. This means every rate-limited request still extends its own rate-limit window. An attacker making constant requests will never see their window expire because each rejected request resets the clock. The push should be conditional on `allowed`.

BUG-A5-3-408: [src/lib/audit-log.ts:31] MEDIUM — `createAuditEntry` accesses `localStorage.getItem(STORAGE_KEY)` without a `typeof window !== 'undefined'` guard. If this function is ever called from a server-side context (SSR, API route, middleware), it throws `ReferenceError: localStorage is not defined`. Other localStorage-accessing functions in the codebase (e.g. `loadAiSettings`, `loadUserPrefs`) all have this guard; `createAuditEntry` is the only one missing it.

BUG-A5-3-409: [src/lib/sse-broadcast.ts:8-19] MEDIUM — Four `globalThis` Maps (`__sseClients`, `__projectEventCounters`, `__projectEventBuffer`, `__projectViewers`) accumulate entries per project ID but never prune entries for deleted or inactive projects. Over the process lifetime, this grows unbounded proportional to total projects ever opened, even if those projects have zero active clients.

BUG-A5-3-410: [src/lib/supabase.ts:19-23] MEDIUM — The `supabase` Proxy export calls `getSupabase()` on every property access. `getSupabase()` throws `Error('Supabase not configured')` if env vars are missing. This means any code that imports `supabase` and accesses *any* property — even for feature-detection like `if (supabase)` — will crash with an unhandled exception instead of gracefully degrading. Should return null or check `isConfigured()` first.

BUG-A5-3-411: [src/lib/ws-client.ts:59] MEDIUM — Inside `handleSSEMessage`, the variable `parsed` is re-declared as `const parsed = Number(raw.lastEventId)` at line 59, shadowing the outer `let parsed: SSEEvent` declared at line 51. While JavaScript block scoping prevents a runtime error, this shadow makes the code fragile: a future refactor that moves code between the inner and outer scope will silently reference the wrong `parsed`. The inner variable should be renamed (e.g. `parsedId`).

BUG-A5-3-412: [src/lib/perf-monitor.ts:107] MEDIUM — `navigator.sendBeacon(reportUrl, body)` sends the JSON string body with `Content-Type: text/plain;charset=UTF-8` (the default for string payloads). The receiving endpoint likely expects `application/json`. Many servers reject or misroute requests with unexpected Content-Type. Should use a `Blob` with explicit type: `new Blob([body], { type: 'application/json' })`.

BUG-A5-3-413: [src/lib/feature-flags.ts:57] MEDIUM — `getFlag` only checks `if (envVal === 'false') return false` for the env var override. It does not check for `'true'`. If the env var is set to any other value (e.g. `'1'`, `'yes'`, `'TRUE'`), it is silently ignored and the flag falls through to defaults. The function should normalize the env value to handle common truthy/falsy patterns, or at minimum also handle `'true'` → `return true`.

BUG-A5-3-414: [src/lib/workspace.ts:28] LOW — `saveWorkspaces` calls `localStorage.setItem(...)` without a `typeof window !== 'undefined'` guard. If imported and called server-side, it throws. Sibling function `getWorkspaces` (line 17) has the guard; `saveWorkspaces` and `setActiveWorkspace` (line 38) do not.

BUG-A5-3-415: [src/lib/workspace.ts:38] LOW — `setActiveWorkspace` calls `localStorage.setItem(ACTIVE_KEY, id)` without an SSR guard. Same issue as BUG-A5-3-414.

BUG-A5-3-416: [src/lib/demo-data.ts:180] LOW — `saveDemoProject` calls `localStorage.setItem(...)` without checking `typeof window !== 'undefined'`. Unlike `loadDemoProject` (which has try/catch around localStorage), `saveDemoProject` will throw if called during SSR.

BUG-A5-3-417: [src/lib/api-client.ts:65] LOW — Project/classification/polygon IDs are interpolated directly into URL paths (e.g. `` `/api/projects/${id}` ``) without `encodeURIComponent`. While IDs are typically UUIDs (safe characters), the function signature accepts `string`, so a malformed ID with `/`, `?`, or `#` could alter the request path. Defense-in-depth: encode all dynamic URL segments.

BUG-A5-3-418: [src/lib/store.ts:508] LOW — `deleteSelectedPolygons` uses string interpolation `` `${s.projectId}` `` and `` `${polygonId}` `` in fetch URLs without `encodeURIComponent`. Also inconsistent with the rest of the store which uses `apiSync()` for API calls — this one uses raw `fetch`.

BUG-A5-3-419: [src/lib/measurex-api.ts:19,35] LOW — Error messages expose internal identifiers: `Polygon not found: ${id}` and `Unable to resolve classification: ${name}`. While this is a client-side API (window.measurex), these messages could appear in console logs or error tracking systems visible to end users, leaking internal IDs.

BUG-A5-3-420: [src/lib/perf-monitor.ts:18-21] LOW — `getBuffer()` casts `globalThis` to `Record<string, unknown>` twice to read/write `__perfMetrics`. This bypasses TypeScript's type safety and would silently corrupt data if another module writes a non-array to the same global key. Should use a typed global declaration (as done in `sse-broadcast.ts` and `plugin-system.ts`).

---

### CLEAN VERDICTS

CLEAN: [src/lib/ab-testing.ts] — Proper try/catch on JSON.parse, SSR-safe localStorage access, cookie parsing handles edge cases (= in values). No auth needed for client-side A/B framework. Weights sum correctly.

CLEAN: [src/lib/ai-results-loader.ts] — Pure synchronous function that loads AI results into zustand store. Input validation delegated to caller and store.addClassification. No async operations, no auth needed.

CLEAN: [src/lib/ai-sheet-namer.ts] — try/catch around fetch, checks for API key before calling, graceful null returns on all error paths. Response validated with optional chaining.

CLEAN: [src/lib/ai-takeoff.ts] — Zod validation of API response, retry with backoff, try/catch on JSON parse, canvas memory cleanup (BUG-A7-015 fix). Solid.

CLEAN: [src/lib/api-schemas.ts] — Pure Zod schema definitions with proper constraints (uuid, min/max lengths, regex for colors, enum types). `parseParams` and `validationError` helpers are correct.

CLEAN: [src/lib/auto-scale.ts] — Pure computation with no I/O. Division-by-zero guarded (`den === 0` checks). NaN/Infinity guarded (`Number.isFinite`). No security surface.

CLEAN: [src/lib/classification-library.ts] — Static readonly data. No logic, no I/O.

CLEAN: [src/lib/classification-presets.ts] — Static readonly data. No logic, no I/O.

CLEAN: [src/lib/custom-shortcuts.ts] — SSR-safe, localStorage wrapped in try/catch, JSON.parse wrapped in try/catch. Clean CRUD for shortcut overrides.

CLEAN: [src/lib/error-tracker.ts] — Circular buffer with cap, SSR-safe global handler registration via addEventListener (doesn't overwrite window.onerror), console.debug to avoid Next.js overlay.

CLEAN: [src/lib/estimate-storage.ts] — SSR-safe, try/catch on all localStorage ops, proper isBrowser guard. Clean CRUD for unit costs.

CLEAN: [src/lib/export.ts] — Handles edge cases (empty polygons, zero scale, iOS Safari fallback). URL.createObjectURL properly revoked with timeout. Division-by-zero guarded (`ppu > 0`). xlsx CVE noted inline (BUG-A8-011).

CLEAN: [src/lib/keyboard-handler.ts] — Proper useEffect cleanup, guards against editable elements, uses zustand getState() in event handler (correct pattern). Stable callback documented (BUG-A7-2-016 note).

CLEAN: [src/lib/logger.ts] — Simple dev/prod logger. `process.env.NODE_ENV` always available in Next.js. No security surface.

CLEAN: [src/lib/measurement-settings.ts] — SSR-safe, try/catch on parse, defaults for every field, pure conversion functions with no division-by-zero risk.

CLEAN: [src/lib/plugin-system.ts] — Promise.allSettled for plugin error isolation, HMR-safe singleton via globalThis. Errors caught per-plugin so one can't break others.

CLEAN: [src/lib/plugins.ts] — Simple plugin registry with try/catch on hook invocation. No security surface.

CLEAN: [src/lib/polygon-groups.ts] — Pure data transformations, immutable updates, deduplication via Set. No I/O.

CLEAN: [src/lib/polygon-utils.ts] — Shoelace formula correct, division-by-zero guarded (`pixelsPerUnit || 1`), ray casting correct with `|| 1e-10` guard. Turf operations wrapped in try/catch with sane fallbacks. Coordinate normalization fix (BUG-A7-010) is solid.

CLEAN: [src/lib/quick-takeoff.ts] — React hook with proper useEffect cleanup, guards against editable elements, useMemo/useCallback for stable references.

CLEAN: [src/lib/safe-id.ts] — Defense-in-depth path traversal guard. Checks for `/`, `\`, `..`, `\0`, and non-alphanumeric chars. Correct and thorough.

CLEAN: [src/lib/sanitize.ts] — HTML tag stripping, length limits, hex color validation with fallback. Adequate for the app's needs.

CLEAN: [src/lib/sheet-namer.ts] — Pure text parsing with regex. No security surface. Graceful null returns on all failure paths.

CLEAN: [src/lib/snap-utils.ts] — Pure geometry calculations. Division-by-zero guarded in `projectPointOnSegment` (`lenSq === 0`). Grid size guarded (`> 0`).

CLEAN: [src/lib/sw-register.ts] — SSR-safe, feature-detected (`'serviceWorker' in navigator`), errors caught. Only logs warnings in production.

CLEAN: [src/lib/takeoff-to-3d.ts] — Pure transformation. Handles edge cases (empty points, missing classification, degenerate segments). Falls back to sample geometry.

CLEAN: [src/lib/trade-groups.ts] — Pure keyword matching. Deterministic, no I/O. Correct fallback to 'OTHER'.

CLEAN: [src/lib/types.ts] — Pure TypeScript interfaces and types. No runtime code.

CLEAN: [src/lib/use-focus-trap.ts] — Proper useEffect cleanup, correct Tab/Shift+Tab wrapping logic, handles empty focusable sets.

CLEAN: [src/lib/use-measurement-settings.ts] — React hook with StorageEvent listener for cross-tab sync. Proper cleanup. Delegates validation to `loadMeasurementSettings`.

CLEAN: [src/lib/user-prefs.ts] — Thorough field-by-field sanitization with type guards for every preference. SSR-safe. try/catch on all localStorage ops. One of the best-written files in the codebase.

CLEAN: [src/lib/utils.ts] — Simple utility functions. SSR-safe via typeof window checks. Number.isFinite guard on formatArea/formatLength.

CLEAN: [src/lib/validation.ts] — Zod schemas with proper constraints. `parseBody` helper returns typed errors. Clean.

CLEAN: [src/lib/with-cache.ts] — Thin wrapper, correct Cache-Control header construction. Handles edge case where only 'public' is set (adds 'no-cache'). The `any` generic default is standard for route handler wrappers.

CLEAN: [src/lib/with-perf.ts] — Thin wrapper, correct timing via try/finally. Status defaults to 500 if handler throws (correct pessimistic default).

CLEAN: [src/lib/api/validate.ts] — Simple Zod validation wrapper returning NextResponse on failure. Clean.

---

### SUMMARY

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 4     |
| MEDIUM   | 8     |
| LOW      | 7     |
| **Total bugs** | **20** |
| Clean files | **31** |
| **Total files audited** | **51** |

### TOP PRIORITIES

1. **BUG-A5-3-401 (CRITICAL)**: webhooks.ts SSRF — must validate webhook URLs against an allowlist or at minimum block private/internal IP ranges and non-HTTP(S) schemes.
2. **BUG-A5-3-404 (HIGH)**: OpenAI API key exposed in client bundle via NEXT_PUBLIC_ prefix — route all OpenAI calls through server-side API routes; never expose the key client-side.
3. **BUG-A5-3-405 (HIGH)**: OpenAI API key stored plaintext in localStorage — remove client-side key storage entirely.
4. **BUG-A5-3-402/403 (HIGH)**: Webhook registration has no per-project limit and delivery has no timeout — add both to prevent resource exhaustion.
5. **BUG-A5-3-406/407 (MEDIUM)**: Rate limiter leaks memory and lets blocked clients extend their own window — fix the data structure and conditional push.
