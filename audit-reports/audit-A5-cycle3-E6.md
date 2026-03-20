# Audit A5 — Cycle 3 — Engineer E6

**Scope:** API route security and quality audit
**Date:** 2026-03-20
**Engineer:** E6-SPARK
**Files audited:** 10 API route files

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 4     |
| MEDIUM   | 8     |
| LOW      | 11    |
| **Total** | **25** |

---

## Findings

### src/app/api/admin/errors/route.ts

BUG-A5-3-001: src/app/api/admin/errors/route.ts:7 CRITICAL — Auth bypass when ADMIN_KEY env var is not set. The guard `if (adminKey)` skips the entire auth check when the environment variable is undefined. In development or any deployment where ADMIN_KEY is not explicitly configured, the admin error endpoint is completely public — exposing stack traces, file paths, and internal error context to any unauthenticated caller.

BUG-A5-3-002: src/app/api/admin/errors/route.ts:4 LOW — No try/catch around async handler. If `getErrors()` were to throw (e.g. a future refactor introduces async I/O), the unhandled rejection would surface a default 500 with potentially leaky stack trace. Current risk is minimal since `getErrors()` is a synchronous array copy.

BUG-A5-3-003: src/app/api/admin/errors/route.ts:4 LOW — No rate limiting on admin endpoint. The admin errors endpoint has no rate limiting, allowing unlimited polling.

---

### src/app/api/ai-takeoff/route.ts

BUG-A5-3-004: src/app/api/ai-takeoff/route.ts:285 HIGH — No authentication on expensive AI endpoint. The POST handler has rate limiting (10 req/min per IP) but zero user authentication. Any anonymous user can trigger OpenAI/OpenRouter vision API calls, directly consuming API credits. Rate limiting alone is insufficient — IP-based limits are trivially bypassed with rotating proxies.

BUG-A5-3-005: src/app/api/ai-takeoff/route.ts:460-463 MEDIUM — Upstream error body leaked to client. The full text of the OpenAI/OpenRouter error response is forwarded verbatim: `OpenAI/OpenRouter error ${resp.status}: ${text}`. This can expose rate-limit headers, internal API error details, account identifiers, or key fragments in error messages from the upstream provider.

BUG-A5-3-006: src/app/api/ai-takeoff/route.ts:388 MEDIUM — Silent empty-string fallback for OPENROUTER_API_KEY. `process.env.OPENROUTER_API_KEY ?? ""` falls back to an empty string when the env var is not set. This sends an `Authorization: Bearer ` header to OpenRouter, which returns a confusing 401 error instead of a clear "API key not configured" message. Should mirror the `checkOpenAIKey()` guard pattern.

BUG-A5-3-007: src/app/api/ai-takeoff/route.ts:480 MEDIUM — Potential SSRF via Host header in internal API calls. `new URL(req.url).origin` is used to construct internal fetch URLs (lines 483, 521, 550). In environments where the Host header is not validated by a reverse proxy, an attacker can set `Host: evil.com` and redirect these internal classification/polygon API calls to an attacker-controlled server, leaking project data.

BUG-A5-3-008: src/app/api/ai-takeoff/route.ts:504-568 MEDIUM — Race condition on concurrent takeoff requests for same page. Two concurrent POST requests for the same `projectId + pageNumber` can interleave: Request A deletes polygons → Request B deletes polygons → Request A inserts → Request B inserts, resulting in duplicate polygons. Or worse: Request A inserts → Request B deletes (wiping A's results) → Request B inserts, causing data loss.

BUG-A5-3-009: src/app/api/ai-takeoff/route.ts:381 LOW — Non-null assertion hides type narrowing gap. `effectiveOpenAIKey!` uses a non-null assertion. The guard logic above is functionally correct, but the assertion suppresses TypeScript's type safety rather than properly narrowing the type. A refactor that changes the guard flow could silently introduce a null dereference.

---

### src/app/api/audit-log/route.ts

BUG-A5-3-010: src/app/api/audit-log/route.ts:16 HIGH — No authentication on audit log read/write. Both GET and POST are completely unauthenticated. Anyone can: (a) read all audit entries, which may contain resource IDs, action details, and user activity patterns; (b) flood the audit log with fake entries, destroying its integrity and evicting real entries from the 200-entry cap.

BUG-A5-3-011: src/app/api/audit-log/route.ts:20 MEDIUM — No rate limiting on audit log endpoints. Both GET and POST can be called without any rate limit. Combined with the lack of auth, an attacker can rapidly fill the 200-entry buffer with garbage, evicting all legitimate audit entries.

BUG-A5-3-012: src/app/api/audit-log/route.ts:32-39 LOW — userId field never populated in audit entries. The `AuditEntry` interface defines `userId?: string` but the POST handler never reads `body.userId` or sets it on the constructed entry. All audit entries lack attribution, defeating a core purpose of audit logging.

BUG-A5-3-013: src/app/api/audit-log/route.ts:38 LOW — metadata validation accepts arrays. The check `metadata && typeof metadata === 'object'` accepts arrays since `typeof [] === 'object'`. Should add `!Array.isArray(metadata)` to enforce the `Record<string, unknown>` type declared in the interface.

---

### src/app/api/chat/route.ts

BUG-A5-3-014: src/app/api/chat/route.ts:12 HIGH — No authentication on chat endpoint. No auth check of any kind. Any anonymous user can send chat requests that consume OpenAI API credits (GPT-4o, up to 600 tokens per request).

BUG-A5-3-015: src/app/api/chat/route.ts:12 HIGH — No rate limiting on chat endpoint. The chat endpoint has zero rate limiting. An attacker can send thousands of requests in rapid succession, running up significant OpenAI API costs. This is especially dangerous combined with the lack of auth (BUG-A5-3-014).

BUG-A5-3-016: src/app/api/chat/route.ts:133-171 MEDIUM — OpenAI response reader not cancelled on client disconnect. When the client disconnects mid-stream, `controller.enqueue()` will throw, exiting the while loop. The `finally` block closes the controller but never calls `reader.cancel()`. The upstream OpenAI response body continues to be consumed and discarded, holding the HTTP connection open and wasting bandwidth until the OpenAI stream naturally ends.

BUG-A5-3-017: src/app/api/chat/route.ts:125 LOW — Full upstream error text logged to server console. `console.error('OpenAI error:', resp.status, errText)` logs the complete error response from OpenAI. While this doesn't reach the client (the client gets a generic "OpenAI API error"), server logs could capture sensitive API account details.

---

### src/app/api/docs/route.ts

BUG-A5-3-018: src/app/api/docs/route.ts:10,69 LOW — External CDN scripts loaded without subresource integrity. `swagger-ui-dist` CSS and JS are loaded from `cdn.jsdelivr.net` without `integrity` attributes. If the CDN is compromised or serves a tampered version, the docs page would execute arbitrary JavaScript in the user's browser. Add SRI hashes to the `<link>` and `<script>` tags.

CLEAN: src/app/api/docs/route.ts — no other issues found. The endpoint is a static HTML page with no auth needed (public docs), no user input processed, and proper Content-Type header.

---

### src/app/api/errors/route.ts

BUG-A5-3-019: src/app/api/errors/route.ts:50 MEDIUM — Unauthenticated access to error logs with stack traces. GET /api/errors returns all logged client errors including stack traces, source file paths, line/column numbers, and URLs. No authentication required. This gives attackers a map of the application's internal code structure and current error states.

BUG-A5-3-020: src/app/api/errors/route.ts:23 MEDIUM — No rate limiting on error reporting endpoints. Both POST (error submission) and GET (error retrieval) have no rate limiting. An attacker can flood the 100-entry error buffer via POST, evicting real error reports, or poll GET at high frequency.

BUG-A5-3-021: src/app/api/errors/route.ts:27 LOW — No input size limits on error report fields. POST accepts arbitrarily large `message`, `stack`, and `context` values. While the in-memory buffer caps at 100 entries, each entry can contain megabytes of string data, potentially causing memory pressure. Should enforce maximum field lengths.

---

### src/app/api/experiments/route.ts

BUG-A5-3-022: src/app/api/experiments/route.ts:4 LOW — No rate limiting on experiments endpoint. Can be polled at unlimited rate.

CLEAN: src/app/api/experiments/route.ts — otherwise no issues. Has try/catch, proper error response, and the data exposed (experiment names and variants) is non-sensitive configuration.

---

### src/app/api/feature-flags/route.ts

BUG-A5-3-023: src/app/api/feature-flags/route.ts:4 LOW — No rate limiting on feature-flags endpoint. Can be polled at unlimited rate.

CLEAN: src/app/api/feature-flags/route.ts — otherwise no issues. Has try/catch, returns non-sensitive configuration data, read-only endpoint.

---

### src/app/api/flags/route.ts

BUG-A5-3-024: src/app/api/flags/route.ts:8 CRITICAL — Unauthenticated feature flag mutation. POST /api/flags allows any anonymous caller to toggle any known feature flag. An attacker can disable core features (`ENABLE_3D_VIEW`, `ENABLE_COLLABORATION`, `ENABLE_WEBHOOKS`) or enable experimental ones (`ENABLE_AI_IMAGE_SEARCH`) without any authentication. This directly impacts application functionality for all users on the same server instance.

BUG-A5-3-025: src/app/api/flags/route.ts:26 LOW — Error message leaks internal details. The catch block returns `err.message` directly in the 500 response body. Depending on the error, this could expose internal module paths, database connection strings, or other sensitive context.

---

### src/app/api/health/route.ts

BUG-A5-3-026: src/app/api/health/route.ts:6 LOW — require() for package.json in module context. `require('../../../../package.json')` works in Next.js's webpack/turbopack compilation but is fragile across bundler changes. A dynamic import or build-time constant would be more robust.

CLEAN: src/app/api/health/route.ts — otherwise no issues. Health endpoints are expected to expose status/version info. The Supabase connectivity check is properly wrapped in try/catch. No user input is processed.

---

## Top Recommendations (Priority Order)

1. **Add authentication middleware** to all non-public routes. At minimum: `/api/admin/*`, `/api/flags` (POST), `/api/audit-log`, `/api/chat`, `/api/ai-takeoff`. Consider a shared `requireAuth()` guard.

2. **Fix ADMIN_KEY bypass** (BUG-A5-3-001): When `ADMIN_KEY` is not set, the admin endpoint should return 503 ("Admin key not configured"), not silently allow all requests.

3. **Add rate limiting to `/api/chat`** (BUG-A5-3-015): This is the most cost-dangerous endpoint — GPT-4o calls with no rate limit or auth.

4. **Stop leaking upstream error bodies** (BUG-A5-3-005): Replace with a generic "AI provider error" message; log the full error server-side only.

5. **Guard OpenRouter API key** (BUG-A5-3-006): Add an explicit check mirroring `checkOpenAIKey()` for the OpenRouter path.

6. **Cancel upstream reader on client disconnect** (BUG-A5-3-016): Add `reader.cancel()` in the finally block of the streaming handler.

7. **Add per-project mutex for AI takeoff** (BUG-A5-3-008): Prevent concurrent takeoff runs on the same page from corrupting polygon data.

---

*Audit complete. 25 findings across 10 files. 2 CRITICAL, 4 HIGH, 8 MEDIUM, 11 LOW.*
