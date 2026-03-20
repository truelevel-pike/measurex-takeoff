# Audit A5 — Cycle 3 (E10)

**Engineer:** E10
**Date:** 2026-03-20
**Scope:** `src/lib/*.ts` — all 40 files
**Audit checklist:** try/catch, auth, input validation, env vars, SQL/Supabase, return consistency, rate limiting, path traversal, type safety, dead code, error leaking, streaming cleanup, race conditions, hardcoded secrets

---

## CRITICAL

**BUG-A5-3-201:** `src/lib/openai-guard.ts:23` **CRITICAL** — `getOpenAIKey()` falls back to `process.env.NEXT_PUBLIC_OPENAI_API_KEY`. Any env var prefixed `NEXT_PUBLIC_` is bundled into client-side JavaScript by Next.js. This means the OpenAI API key is embedded in the browser bundle and visible to anyone inspecting page source or network requests. The key should only be used server-side; client code should call a backend proxy route instead.

**BUG-A5-3-202:** `src/lib/ai-settings.ts:5-6` **CRITICAL** — The `AiSettings` interface includes `openaiApiKey: string` and `saveAiSettings` persists it to localStorage as plaintext JSON (line 30). Any XSS vulnerability or malicious browser extension can read `localStorage.getItem('mx-ai-settings')` and exfiltrate the API key. API keys must never be stored in localStorage; they should live server-side only.

---

## HIGH

**BUG-A5-3-203:** `src/lib/rate-limit.ts:10` **HIGH** — The `hits` Map accumulates IP entries indefinitely. Entries are only pruned when the same IP is checked again (line 31). IPs that make a single request and never return are never cleaned up. Under sustained traffic from diverse IPs (e.g., a botnet or CDN edge), this causes unbounded memory growth leading to OOM. Add a periodic sweep (e.g., `setInterval`) or use an LRU cache with a max-size eviction policy.

**BUG-A5-3-204:** `src/lib/api-client.ts:64-65` **HIGH** — Functions like `getProject(id)`, `deleteClassification(projectId, id)`, `deletePolygon(projectId, id)` interpolate caller-supplied strings directly into URL paths (e.g., `` `/api/projects/${id}` ``). No validation is applied to ensure `id` is a UUID or safe string. A malicious or buggy caller passing `../../admin` could construct unintended URLs. All IDs should be validated as UUIDs before URL interpolation on the client side as defense-in-depth.

**BUG-A5-3-205:** `src/lib/sse-broadcast.ts:26` **HIGH** — `broadcastToProject` sends events to all controllers in `projectClients.get(projectId)` with no authorization check. If the SSE subscription endpoint does not verify the user has access to the project, any authenticated (or unauthenticated) user could subscribe and receive real-time updates for any project, leaking data. The broadcast function itself should not be the auth layer, but this must be documented and enforced at the subscription endpoint.

**BUG-A5-3-206:** `src/lib/api-schemas.ts:143` **HIGH** — `DrawingBodySchema` uses `.passthrough()`, meaning any arbitrary fields in the request body are silently accepted and forwarded downstream. This enables mass-assignment attacks if the parsed body is spread into a database insert/update. Use `.strict()` or `.strip()` instead.

**BUG-A5-3-207:** `src/lib/ai-sheet-namer.ts:15-18` **HIGH** — The function makes a direct `fetch` call to `https://api.openai.com/v1/chat/completions` from client-side code, sending the API key as a Bearer token in the `Authorization` header. This exposes the key in browser network logs, devtools, and any man-in-the-middle proxy. All AI API calls should be proxied through the app's own backend routes (like `/api/ai-takeoff` already does).

**BUG-A5-3-208:** `src/lib/feature-flags.ts:97,114` **HIGH** — `loadFlags()` is called at module initialization time (line 114: `const legacyFlags = loadFlags()`). It parses `process.env.FEATURE_FLAGS` via `JSON.parse` and caches the result in a module-level const. In a long-running server, flag changes require a full process restart. More critically, if `FEATURE_FLAGS` env var contains untrusted or malformed JSON (e.g., injected via a compromised CI env), arbitrary flag keys/values are accepted without schema validation — the only check is `typeof value === "boolean"` (line 102), but the keys are not constrained to known flags.

---

## MEDIUM

**BUG-A5-3-209:** `src/lib/plugin-system.ts:39-45` **MEDIUM** — `PluginRegistry.emit()` calls `handler.apply(plugin, args)` where `handler` is an arbitrary function provided by a registered plugin and `args` is `unknown[]`. There is no sandboxing, timeout, or capability restriction. A malicious or buggy plugin can block the event loop, throw to break the emit chain (mitigated by try/catch on line 49, but only for sync errors — the `Promise.allSettled` on line 55 handles async), or access global state. Document the trust boundary and consider a timeout wrapper.

**BUG-A5-3-210:** `src/lib/export.ts:3` **MEDIUM** — `import * as XLSX from 'xlsx'` — the file's own comment (line 1-2) documents that xlsx@0.18.x has known CVEs (CVE-2023-30533 and related) with a TODO to migrate to exceljs. This remains unfixed. If an attacker can influence the data flowing into `exportToExcel` (e.g., classification names containing crafted strings), the vulnerable library could be exploited. Prioritize the migration.

**BUG-A5-3-211:** `src/lib/audit-log.ts:44-50` **MEDIUM** — `createAuditEntry` fires a `POST /api/audit-log` with no authentication headers and no CSRF token. The `metadata` parameter (`Record<string, unknown>`) is serialized and sent as-is. If the audit-log API endpoint does not independently authenticate requests, this allows unauthenticated log injection. Additionally, the fire-and-forget pattern means audit log failures are completely silent — security-critical audit events could be silently dropped.

**BUG-A5-3-212:** `src/lib/error-tracker.ts:27,56-58` **MEDIUM** — Captured errors include `stack` traces (line 27) and source file metadata (`filename`, `lineno`, `colno` from ErrorEvent, lines 56-58). The `getErrors()` function returns the full buffer. If this buffer is ever exposed via an API endpoint, debug panel, or error reporting, it leaks internal file paths, line numbers, and stack traces to the client — aiding attackers in mapping the application's internal structure.

**BUG-A5-3-213:** `src/lib/measurex-api.ts:11` **MEDIUM** — `installMeasurexAPI()` attaches `window.measurex` with methods like `reclassify(id, name)` and `selectPolygon(id)`. These are callable from the browser console or via XSS. The `reclassify` method creates new classifications with arbitrary names (line 26-31) without sanitization beyond what the store provides. This expands the attack surface for stored XSS if classification names are rendered unsafely elsewhere.

**BUG-A5-3-214:** `src/lib/store.ts:291,318,351,414,433,454` **MEDIUM** — `apiSync` constructs URLs like `` `/api/projects/${pid}/classifications` `` using `pid` from `s.projectId`. While `projectId` is typically a UUID from URL routing, there is no validation in `setProjectId` (line 761: `set({ projectId: id })`). A compromised or buggy caller setting `projectId` to a string containing path-traversal characters (e.g., `../admin`) would cause API requests to unintended endpoints.

**BUG-A5-3-215:** `src/lib/ab-testing.ts:43,57` **MEDIUM** — `JSON.parse(raw) as Record<string, string>` casts parsed localStorage/cookie JSON without schema validation. If the stored data has been tampered with (e.g., via devtools or a cookie-injection attack), non-string values could propagate through the A/B testing system, causing type confusion bugs in downstream code that assumes string values.

**BUG-A5-3-216:** `src/lib/estimate-storage.ts:37` **MEDIUM** — `{ ...costs[classificationId], ...update } as UnitCost` — the `as UnitCost` assertion bypasses type checking on data deserialized from localStorage. If `costs[classificationId]` contains unexpected fields or wrong types (from manual localStorage tampering or data migration), the assertion silently trusts the data. Use a Zod schema or runtime check.

**BUG-A5-3-217:** `src/lib/sanitize.ts:7` **MEDIUM** — `input.trim().replace(/<[^>]*>/g, '')` attempts to strip HTML tags but the regex fails on edge cases: unclosed tags like `<script`, attributes containing `>` like `<img src="x" onerror="alert(1)" >`, and HTML entities. While this is defense-in-depth (output encoding should be the primary defense), a more robust solution like DOMPurify or a proper HTML parser would close these gaps.

**BUG-A5-3-218:** `src/lib/perf-monitor.ts:18-21` **MEDIUM** — `(globalThis as Record<string, unknown>).__perfMetrics = []` — casting `globalThis` to `Record<string, unknown>` and writing arbitrary properties risks colliding with other libraries or polyfills that use the same global key. If a third-party script sets `__perfMetrics` to a non-array value, `getBuffer()` casts it with `as PerfRecord[]` (line 21), leading to runtime crashes or data corruption.

---

## LOW

**BUG-A5-3-219:** `src/lib/rate-limit.ts:51` **LOW** — IP address is extracted from `x-forwarded-for` header's first value. Behind a misconfigured proxy or when no proxy is present, clients can spoof this header to bypass rate limiting entirely. Document the deployment requirement for a trusted reverse proxy that sets/overwrites `x-forwarded-for`.

**BUG-A5-3-220:** `src/lib/plugins.ts` + `src/lib/plugin-system.ts` **LOW** — Two separate plugin registries coexist: `plugins.ts` exports `registerPlugin(name, hooks)` and `plugin-system.ts` exports `registerPlugin(plugin)`. Both are exported, creating confusion about which to use. One is likely dead code. Consolidate into a single plugin system to avoid split-brain plugin registration.

**BUG-A5-3-221:** `src/lib/supabase.ts:19-22` **LOW** — The `supabase` Proxy uses `(getSupabase() as unknown as Record<string | symbol, unknown>)[prop]`, a double type assertion that completely bypasses TypeScript's type system. Any property access on the proxy is unchecked at compile time. If `getSupabase()` throws (Supabase not configured), the Proxy getter propagates the error on first property access with no helpful context.

**BUG-A5-3-222:** `src/lib/ai-takeoff.ts:88` **LOW** — `window.__perfMarks` is assigned at runtime without a corresponding TypeScript `declare global` augmentation. This causes TypeScript errors in strict mode and makes the property invisible to other modules that want to read it type-safely. Add a proper global type declaration.

**BUG-A5-3-223:** `src/lib/custom-shortcuts.ts:28` **LOW** — `JSON.parse(raw) as Record<string, string>` — same pattern as BUG-A5-3-215. Parsed localStorage JSON is trusted without schema validation. Tampered shortcut bindings could contain non-string values causing downstream issues in keyboard handling.

**BUG-A5-3-224:** `src/lib/feature-flags.ts:57` **LOW** — `getFlag()` only checks `if (envVal === 'false') return false` and `if (stored === 'false') return false`. There is no corresponding check for `'true'` to enable a flag that is disabled by default. This means env vars and localStorage can only disable flags, never enable them — a likely unintended asymmetry.

**BUG-A5-3-225:** `src/lib/store.ts:507-511` **LOW** — `deleteSelectedPolygons` issues per-polygon DELETE requests via raw `fetch()` instead of the `apiSync` helper used everywhere else. While functionally equivalent, this inconsistency means any future changes to `apiSync` (e.g., adding auth headers, retry logic) will not apply to bulk-delete operations.

---

## CLEAN FILES

The following files were audited and no issues were found:

- CLEAN: `src/lib/auto-scale.ts` — no issues found. Pure text-parsing functions with proper null guards and finite-number checks.
- CLEAN: `src/lib/classification-library.ts` — no issues found. Static data-only module.
- CLEAN: `src/lib/classification-presets.ts` — no issues found. Static data-only module.
- CLEAN: `src/lib/demo-data.ts` — no issues found. Static demo data with deterministic geometry helpers.
- CLEAN: `src/lib/keyboard-handler.ts` — no issues found. React hook with proper cleanup, editable-element guard, and documented stable-callback requirement.
- CLEAN: `src/lib/logger.ts` — no issues found. Minimal logger with dev/prod gating.
- CLEAN: `src/lib/measurement-settings.ts` — no issues found. Clean localStorage persistence with defaults fallback and unit conversion math.
- CLEAN: `src/lib/polygon-groups.ts` — no issues found. Pure utility functions with immutable return patterns.
- CLEAN: `src/lib/polygon-utils.ts` — no issues found. Geometry calculations with proper null/length guards, division-by-zero protection, and well-documented Turf coordinate normalization.
- CLEAN: `src/lib/quick-takeoff.ts` — no issues found. React hook with proper event cleanup and editable-element guard.
- CLEAN: `src/lib/safe-id.ts` — no issues found. Defense-in-depth ID validation, correctly rejects path traversal and null bytes.
- CLEAN: `src/lib/sheet-namer.ts` — no issues found. Pure regex-based text extraction with null guards.
- CLEAN: `src/lib/snap-utils.ts` — no issues found. Geometry utility functions.
- CLEAN: `src/lib/sw-register.ts` — no issues found. Service worker registration with proper guards.
- CLEAN: `src/lib/takeoff-to-3d.ts` — no issues found. Geometry conversion with degenerate-input guards.
- CLEAN: `src/lib/trade-groups.ts` — no issues found. Keyword-based classification with static data.
- CLEAN: `src/lib/api/validate.ts` — no issues found. Clean Zod validation wrapper.
- CLEAN: `src/lib/api-schemas.ts` — (one issue noted in BUG-A5-3-206 for DrawingBodySchema; all other schemas are well-constructed with proper constraints).

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 6     |
| MEDIUM   | 10    |
| LOW      | 7     |
| **Total**| **25**|
| Clean    | 17    |

### Top priorities:
1. **BUG-A5-3-201 + BUG-A5-3-207**: Eliminate client-side OpenAI API key exposure. Route all AI calls through backend proxy.
2. **BUG-A5-3-202**: Remove API key from localStorage/AiSettings. Store server-side only.
3. **BUG-A5-3-203**: Add periodic purge or LRU eviction to rate-limit Map.
4. **BUG-A5-3-206**: Replace `.passthrough()` with `.strict()` on DrawingBodySchema.
5. **BUG-A5-3-210**: Migrate from xlsx to exceljs to resolve CVE-2023-30533.
