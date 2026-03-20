# Audit Report — Cycle 3, Sector A5, Engineer E6
# Routes: admin/errors, ai-takeoff, audit-log, chat, docs, errors, experiments, feature-flags, flags, health
# Date: 2026-03-20

## E6 FINDINGS — Routes: admin, ai-takeoff, audit-log, chat, docs, errors, experiments, feature-flags, flags, health

---

### src/app/api/admin/errors/route.ts

**BUG-A5-3-001**: [src/app/api/admin/errors/route.ts:7] **CRITICAL** — Auth is completely bypassed when `ADMIN_KEY` env var is not set. The `if (adminKey)` guard means if the env var is undefined, the entire auth check is skipped and anyone can access admin error data. Should fail-closed (deny access when key is unconfigured).

**BUG-A5-3-002**: [src/app/api/admin/errors/route.ts:14] **LOW** — No try/catch around `getErrors()`. If the imported function throws, the request gets an unhandled 500 with no controlled error response.

**BUG-A5-3-003**: [src/app/api/admin/errors/route.ts:4] **MEDIUM** — No rate limiting on this admin endpoint. Can be polled aggressively for reconnaissance.

---

### src/app/api/ai-takeoff/route.ts

**BUG-A5-3-004**: [src/app/api/ai-takeoff/route.ts:285] **CRITICAL** — No authentication check. Unauthenticated users can trigger expensive OpenAI/OpenRouter API calls and create/delete classifications and polygons in any project by guessing a valid UUID.

**BUG-A5-3-005**: [src/app/api/ai-takeoff/route.ts:461] **MEDIUM** — Upstream OpenAI/OpenRouter error body is passed verbatim to the client: `` `OpenAI/OpenRouter error ${resp.status}: ${text}` ``. This can leak internal API error details, rate-limit headers, or partial key info from the upstream provider.

**BUG-A5-3-006**: [src/app/api/ai-takeoff/route.ts:388] **MEDIUM** — When `useOpenRouter` is true but `OPENROUTER_API_KEY` is not set, it silently defaults to an empty string (`?? ""`). The request is sent with `Authorization: Bearer ` (empty token) and fails opaquely at the provider. Should return a clear 500 error like the OpenAI key guard does.

**BUG-A5-3-007**: [src/app/api/ai-takeoff/route.ts:480] **HIGH** — SSRF risk: `new URL(req.url).origin` derives the internal API base URL from the incoming request. In self-hosted deployments where the `Host` header is not validated by a reverse proxy, an attacker can set `Host: evil.com` and redirect all subsequent internal fetch calls (classifications, polygons) to an attacker-controlled server, which can return malicious payloads the server will trust.

**BUG-A5-3-008**: [src/app/api/ai-takeoff/route.ts:504] **MEDIUM** — Race condition: two concurrent AI takeoff requests for the same project+page will both call `deletePolygonsByPage` then both insert, resulting in duplicate polygon sets. No mutex or transaction boundary exists.

**BUG-A5-3-009**: [src/app/api/ai-takeoff/route.ts:589] **LOW** — Catch block wraps `err.message` into the response. Depending on the error source, this can leak internal file paths or stack details to the client.

---

### src/app/api/audit-log/route.ts

**BUG-A5-3-010**: [src/app/api/audit-log/route.ts:16] **HIGH** — No auth on GET. Anyone can read the full audit log, which may contain user IDs, resource IDs, and action metadata.

**BUG-A5-3-011**: [src/app/api/audit-log/route.ts:20] **HIGH** — No auth on POST. Anyone can write arbitrary entries into the audit log, polluting it and undermining its integrity as a trust-worthy record.

**BUG-A5-3-012**: [src/app/api/audit-log/route.ts:20] **MEDIUM** — No rate limiting on POST. Attacker can spam entries to fill the in-memory array (up to MAX_ENTRIES, but each entry can have an arbitrarily large `metadata` object or long string fields).

**BUG-A5-3-013**: [src/app/api/audit-log/route.ts:35] **LOW** — No length limits on `action`, `resource`, or `resourceId` strings. A single POST can store megabytes of data in the `String()` coerced fields, consuming server memory.

---

### src/app/api/chat/route.ts

**BUG-A5-3-014**: [src/app/api/chat/route.ts:12] **CRITICAL** — No authentication check. Unauthenticated users can call this endpoint to consume OpenAI API credits at will. Combined with no rate limiting, this is a direct cost-drain vector.

**BUG-A5-3-015**: [src/app/api/chat/route.ts:12] **HIGH** — No rate limiting. The endpoint streams from OpenAI with `model: 'gpt-4o'`. An attacker can make unlimited parallel requests, rapidly draining the API budget.

**BUG-A5-3-016**: [src/app/api/chat/route.ts:131] **MEDIUM** — Streaming ReadableStream has no `cancel()` handler. If the client disconnects mid-stream, the `start()` function continues reading from the OpenAI response body and calling `controller.enqueue()` until the upstream response is fully consumed. The upstream `reader` is never cancelled via `reader.cancel()`, leaking the connection and wasting bandwidth/tokens.

---

### src/app/api/docs/route.ts

**CLEAN**: [src/app/api/docs/route.ts] — Static HTML response with no user input, no async operations, correct Content-Type header. External CDN scripts (swagger-ui-dist) are a standard pattern. No issues found.

---

### src/app/api/errors/route.ts

**BUG-A5-3-017**: [src/app/api/errors/route.ts:50] **HIGH** — GET `/api/errors` returns all logged error reports — including stack traces, file paths, context objects, and internal URLs — to any unauthenticated caller. This is a significant information disclosure vulnerability enabling reconnaissance.

**BUG-A5-3-018**: [src/app/api/errors/route.ts:23] **MEDIUM** — No rate limiting on POST. Can be spammed to fill the in-memory `loggedErrors` array with attacker-controlled content, and each entry is logged to console.error.

**BUG-A5-3-019**: [src/app/api/errors/route.ts:46] **LOW** — `console.error` logs the full error report JSON (including user-submitted `context`, `url`, `userAgent`) to stdout. In environments where logs are aggregated/searched, attacker-controlled content could pollute log pipelines or trigger log-injection attacks.

---

### src/app/api/experiments/route.ts

**CLEAN**: [src/app/api/experiments/route.ts] — Has try/catch, returns consistent `{ experiments }` shape, no sensitive data exposed (A/B flag assignments are per-cookie). Cookie header is passed read-only to `getAllExperiments()`. No issues found.

---

### src/app/api/feature-flags/route.ts

**CLEAN**: [src/app/api/feature-flags/route.ts] — Has try/catch, read-only GET, returns consistent `{ flags }` shape. `getFlags()` is a simple in-memory read. No issues found.

---

### src/app/api/flags/route.ts

**BUG-A5-3-020**: [src/app/api/flags/route.ts:8] **CRITICAL** — No auth on POST. Any unauthenticated user can toggle any feature flag by sending `{ flag, value }`. This allows an attacker to enable/disable features across the entire application (e.g., disabling safety checks, enabling debug modes).

**BUG-A5-3-021**: [src/app/api/flags/route.ts:4] **MEDIUM** — No auth on GET. Exposes the full internal feature-flag configuration (names and values) to unauthenticated users, aiding reconnaissance.

**BUG-A5-3-022**: [src/app/api/flags/route.ts:26] **LOW** — Catch block returns `err.message` or `String(err)` directly to the client. Internal error details (module paths, assertion messages) may be leaked.

**BUG-A5-3-023**: [src/app/api/flags/route.ts:4] **LOW** — GET handler has no try/catch. If `getAllFlags()` throws, the request gets an unhandled 500 with framework-default error body.

---

### src/app/api/health/route.ts

**BUG-A5-3-024**: [src/app/api/health/route.ts:6] **LOW** — Uses `require('../../../../package.json')` with a fragile relative path. If the build output restructures directories, the server crashes at module load time with an unrecoverable error. Also, `version` is exposed in the response, which aids version fingerprinting by attackers.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 4     |
| HIGH     | 5     |
| MEDIUM   | 8     |
| LOW      | 7     |
| **Total bugs** | **24** |
| CLEAN files | 3 (docs, experiments, feature-flags) |

### Top Priorities

1. **Auth gap across all mutable endpoints** (BUG-001, 004, 010, 011, 014, 020): Admin, ai-takeoff, audit-log, chat, and flags routes have zero authentication. The ai-takeoff and chat routes additionally incur real dollar costs per request via OpenAI/OpenRouter.

2. **SSRF in ai-takeoff** (BUG-007): Internal API calls use origin derived from the incoming request's Host header. Must use a hardcoded or env-configured internal base URL.

3. **Rate limiting gaps** (BUG-003, 012, 015, 018): Only ai-takeoff has rate limiting. All other mutable or expensive endpoints are unprotected.

4. **Streaming cleanup in chat** (BUG-016): Client disconnect does not cancel the upstream OpenAI reader, wasting tokens and connections.

---

*Engineer: E6-SPARK | Sector: A5 | Cycle: 3 | Date: 2026-03-20*
