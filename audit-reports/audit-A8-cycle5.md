# Audit Report: A8 Cycle 5 — Pages + Config + Infra
**Auditor:** Admiral 8 (A8)
**Date:** 2026-03-20
**Scope:** All pages (`src/app/**/*.tsx`), config files (`next.config.ts`, `tsconfig.json`, `vercel.json`, `package.json`), and infra/API routes (`src/app/api/**/*.ts`), plus key library files (`src/lib/`, `src/server/`).

---

## Bug Registry

### CRITICAL

**BUG-A8-5-001: `src/app/api/audit-log/route.ts:1` [CRITICAL] Audit log endpoint fully unauthenticated and writable by anyone**
Both GET and POST on `/api/audit-log` require no authentication. Any unauthenticated caller can (a) read the full audit log including resourceIds and actions, and (b) inject arbitrary audit entries to pollute the log. There is no auth check, no rate limiting, and no admin key guard on either method. The GET endpoint on `/api/admin/errors` has an `ADMIN_KEY` guard and rate limiting as a reference model; `/api/audit-log` should do the same.
- Fix: add rate limiting via `rateLimitResponse()` on GET and POST; require `ADMIN_KEY` on GET; add Zod validation on POST body fields (`action`, `resource`, `resourceId`).

**BUG-A8-5-002: `src/app/api/metrics/route.ts:1` [CRITICAL] Metrics endpoint unauthenticated — exposes internal performance data**
GET `/api/metrics` returns full internal server metrics with no authentication or rate limiting. This endpoint can be used for reconnaissance (timing, throughput, error patterns) without any credentials.
- Fix: add `rateLimitResponse()` and optionally an `ADMIN_KEY` guard, or gate it to same-origin requests only.

**BUG-A8-5-003: `src/app/api/feature-flags/route.ts:1` [CRITICAL] Feature flags endpoint fully public — exposes unreleased feature state**
GET `/api/feature-flags` returns the full flag registry with no auth or rate limiting. Unauthenticated clients can enumerate all flags (including unreleased features, kill switches, experiments), giving away product roadmap and attack surface.
- Fix: apply rate limiting; either require auth or strip the flag names to boolean values only (no descriptions).

**BUG-A8-5-004: `src/app/api/experiments/route.ts:1` [CRITICAL] A/B experiment config fully public — exposes experiment names, variants, and allocation**
GET `/api/experiments` returns the full experiment registry from cookies, no auth required. This reveals experiment topology to any unauthenticated caller.
- Fix: apply rate limiting; restrict to authenticated sessions or move experiment resolution server-side.

**BUG-A8-5-005: `src/app/api/plugins/route.ts:1` [CRITICAL] Plugin registry enumerable by anyone**
GET `/api/plugins` lists all registered plugins (name + version) with no authentication. Attacker can discover installed plugins to find exploitable surface area.
- Fix: require `ADMIN_KEY` or restrict to same-origin; apply rate limiting.

---

### HIGH

**BUG-A8-5-006: `src/app/api/ws/route.ts:1` [HIGH] SSE endpoint has no authentication or project ownership check**
GET `/api/ws?projectId=<any-uuid>` allows any unauthenticated client to subscribe to real-time SSE events for any project by guessing or enumerating UUIDs. An attacker can observe `ai-takeoff:started`, `polygon:created`, `viewer:joined`, etc. for projects they don't own.
- Fix: validate that the caller owns the project (session token or Supabase auth check) before adding them to the `projectClients` map.

**BUG-A8-5-007: `src/app/api/ai-takeoff/route.ts` [HIGH] User-supplied `X-OpenAI-Api-Key` header is trusted without validation and used directly in bearer auth**
The AI takeoff endpoint reads `x-openai-api-key` from request headers and uses it verbatim as the API key for OpenAI calls. Any client can pass an arbitrary key — including one belonging to another user stored server-side. The key is not validated for format, length, or ownership before use. Combined with the lack of project auth, an attacker could use the server as a free OpenAI proxy.
- Fix: validate format (`/^sk-[A-Za-z0-9-_]{20,}/`); log key prefix only (never full key); consider requiring a valid authenticated session before accepting a user-supplied key.

**BUG-A8-5-008: `src/app/api/ai-takeoff/route.ts` [HIGH] Rate limiting uses only IP, which is trivially bypassable via `x-forwarded-for` spoofing**
`rateLimitResponse()` reads the client IP from `x-forwarded-for` (first entry). On Vercel / behind a reverse proxy, this header can be injected by the client to spoof a different IP and bypass the 10 req/min limit entirely.
- Fix: on Vercel, trust only the *last* entry of `x-forwarded-for` (added by the Vercel edge), or use a Vercel-injected `x-vercel-forwarded-for` header which is not user-controllable.

**BUG-A8-5-009: `src/app/api/perf/route.ts:32` [HIGH] SUPABASE_SERVICE_ROLE_KEY used in a client-callable API route**
The `/api/perf` POST endpoint dynamically imports `@supabase/supabase-js` and calls `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`. Using the service-role key (which bypasses RLS) from a route that any browser can POST to means any unauthenticated client can trigger a server-side Supabase call with full admin privileges — even if only to `mx_perf_events`, the pattern is dangerous and the key is exposed in the Next.js runtime.
- Fix: use the anon key for this route, or disable the Supabase insert and log to a monitoring service instead. Never use the service-role key from a publicly-callable route.

**BUG-A8-5-010: `src/app/api/projects/[id]/polygons/route.ts` [HIGH] `DELETE` on polygons has no authentication and no ownership check**
`DELETE /api/projects/:id/polygons?page=N` requires no session or API key, only a project UUID. Any unauthenticated caller who can guess or enumerate a project ID can wipe all polygons for any page of that project. The rate limiter is not applied to this endpoint.
- Fix: add auth check + rate limiting; verify that the caller owns the project before deleting.

**BUG-A8-5-011: `src/app/api/projects/[id]/upload/route.ts:47` [HIGH] MIME type validation relies solely on `file.type` and file extension — no magic-byte check**
`file.type` is provided by the client in the `Content-Type` of the multipart part and can be set to `application/pdf` for any file. The extension check `file.name.endsWith('.pdf')` is equally client-controlled. A malicious file (e.g., an SVG with script tags, or a ZIP bomb) can be uploaded disguised as a PDF. The actual file bytes are never inspected for the `%PDF-` magic header.
- Fix: after reading the buffer, check `buffer.slice(0,5).toString('ascii') === '%PDF-'` before processing.

**BUG-A8-5-012: `src/app/api/projects/[id]/share/route.ts` [HIGH] Share token generation/revocation has no authentication — any caller can generate or revoke a share link**
`POST /api/projects/:id/share` creates a share token and `DELETE` revokes it without any auth check. An attacker who knows a project UUID can generate a public share link or revoke a legitimate one.
- Fix: add session-based auth verification; check that the requesting user owns the project.

**BUG-A8-5-013: `src/app/api/share/[token]/export/route.ts:113` [HIGH] "PDF" export returns raw HTML, not a PDF — `Content-Type: text/html` with no sanitization**
The `pdf` export format returns a `buildPdfHtml()` HTML string with `Content-Type: text/html`. This HTML is served from the same origin as the app. Any `<script>` content in project names or classification names not fully escaped could execute in this context. While `escapeHtml()` is used for user data, it is only applied in `tableRows` — `projectName` is escaped in the `<title>` but the `<h2>` uses `escapeHtml()` which is correct. However, serving arbitrary HTML as a "PDF download" at the same origin creates a stored-XSS risk if any code path ever bypasses `escapeHtml`.
- Additionally: the Content-Disposition header is not set for the HTML response, so it opens inline rather than downloading.
- Fix: add `Content-Disposition: attachment; filename="report.html"` to the HTML response; consider using a proper PDF generation library.

**BUG-A8-5-014: `src/app/settings/page.tsx:305` [HIGH] OpenAI API key stored in plaintext in localStorage via `saveAiSettings()`**
The settings page calls `updateAi({ openaiApiKey: e.target.value })` which persists through `saveAiSettings()` to localStorage. API keys in localStorage are readable by any JavaScript running on the page (including third-party scripts and XSS payloads) and are never cleared on logout.
- Fix: store the API key in `sessionStorage` (cleared on tab close) rather than `localStorage`; or encrypt with a derived key; or only send the key to the server per-request without storing it.

---

### MEDIUM

**BUG-A8-5-015: `src/app/projects/page.tsx:211` [MEDIUM] Duplicate project name check is client-only and case-insensitive only — race condition possible**
`handleCreate()` checks for duplicate names by filtering the local `projects` array. This check runs on a potentially stale snapshot of projects (no re-fetch before creation), so two concurrent tabs or requests can create duplicate-named projects. The server-side `createProject` has no uniqueness constraint.
- Fix: add a server-side uniqueness check in `POST /api/projects`, or accept duplicates but add a visual disambiguator.

**BUG-A8-5-016: `src/app/projects/page.tsx` [MEDIUM] Starred, folders, and tags are stored in localStorage only — data loss on browser clear, not portable**
User-facing organizational state (stars, folders, per-project tags) is stored exclusively in `localStorage`. Clearing storage, switching browsers, or using a private window loses all this data silently. There is no server sync.
- Fix: persist these to the server via a lightweight user-settings API, at minimum as a JSON blob per user.

**BUG-A8-5-017: `src/app/print/page.tsx:91` [MEDIUM] `BroadcastChannel` message handler does not validate message origin or structure before calling `applyStoreState`**
The print page listens on `measurex-print-state` BroadcastChannel. Any tab on the same origin can post a `{ type: 'print-state', state: {...} }` message and have it applied. While same-origin is required for BroadcastChannel (so cross-site injection is not possible), any MeasureX tab — including a compromised one — could inject malicious state. The `state` fields are not validated with a schema before use.
- Fix: validate the `state` payload structure (at minimum check that `classifications` and `polygons` are arrays) before calling `applyStoreState`.

**BUG-A8-5-018: `src/app/share/[token]/page.tsx:116` [MEDIUM] `handleExport` for JSON/PDF formats opens a `window.open` with the share token in the URL without validating token format first**
`window.open(\`/api/share/${encodeURIComponent(token)}/export?format=${format}\`, ...)` will open with whatever `token` is in the URL params, including a non-UUID token that slips past the server's `TokenSchema.safeParse()` and gets logged. While the server will reject invalid tokens, the client should validate the token is UUID-shaped before constructing the URL.
- Fix: validate `token` against a UUID pattern client-side before constructing external URLs.

**BUG-A8-5-019: `src/app/api/ai-takeoff/route.ts` [MEDIUM] `deletePolygonsByPage` is called before the AI response is received — page is wiped even if AI call fails**
In the persist path, `await deletePolygonsByPage(projectId, page)` is called before iterating over `results`. If the AI call returns an error, an empty `results` array, or parsing fails, all existing polygons for that page are already deleted. This causes data loss on AI failure.
- Fix: only delete existing polygons after successfully parsing a non-empty `results` array from the AI response, or use a transactional replace (insert new, then delete old).

**BUG-A8-5-020: `src/app/api/ai-takeoff/route.ts` [MEDIUM] Model selection from client is untrusted and unconstrained — arbitrary model strings accepted**
The `model` field from the client body is passed to OpenAI/OpenRouter without validation against an allowlist. A client can pass any model name, including expensive or unavailable models, causing 400/500 errors or unexpected billing.
- Fix: validate `model` against an allowlist (e.g., `['gpt-5.4', 'gemini-3.1', 'claude-opus-4-6', 'claude-sonnet-4-6']`) in `AiTakeoffBodySchema`.

**BUG-A8-5-021: `src/app/api/projects/[id]/webhooks/route.ts:10` [MEDIUM] Webhook URL only validates HTTP scheme — SSRF via internal IP/localhost URLs**
`WebhookCreateSchema` validates `z.string().url()` and `.startsWith('http')` but allows URLs like `http://localhost:3000/internal`, `http://169.254.169.254/latest/meta-data` (AWS metadata), or `http://10.0.0.1/`. When `fireWebhook()` fires, it will make a server-side request to these addresses, enabling SSRF.
- Fix: add a blocklist for private IP ranges and `localhost` in the webhook URL validator; use `URL` parsing to check the hostname against private ranges before registering.

**BUG-A8-5-022: `src/app/settings/page.tsx:239` [MEDIUM] API keys stored in `apiKeys` state are never persisted to `localStorage` or server — lost on page reload**
The `apiKeys` state is initialized from `useState<ApiKey[]>([])` with no persistence. Any API keys added in the UI are lost when the user navigates away or refreshes the page.
- Fix: persist `apiKeys` to `localStorage` (with masking) or to the server, similar to how `ai.openaiApiKey` is handled.

**BUG-A8-5-023: `next.config.ts:22` [MEDIUM] `unsafe-inline` remains in `script-src` in production — weakens XSS protection**
The CSP includes `'unsafe-inline'` in `script-src` unconditionally in both dev and production. This permits execution of inline `<script>` blocks, significantly weakening XSS defenses. The comment says it's kept for "pdf.js inline worker init" but this should instead use a nonce or hash.
- Fix: generate a per-request nonce in a middleware and pass it to the CSP header; replace `'unsafe-inline'` in `script-src` with `'nonce-<value>'` for scripts that need it.

**BUG-A8-5-024: `vercel.json:15` [MEDIUM] `maxDuration: 300` on `/api/ws` SSE route is ineffective on Vercel Serverless (max 60s on hobby plan) and misleading**
The SSE route at `/api/ws` is a streaming response, not a WebSocket. On Vercel's serverless platform, a 5-minute timeout is only honored on Pro/Enterprise plans. The `Connection: keep-alive` header has no effect in serverless deployments. This causes silent disconnects for clients on lower-tier deployments, and the 15-second keepalive comment in `ws/route.ts` is the only mitigation.
- Fix: document the Vercel plan requirement; add a reconnect mechanism on the client; or migrate the SSE endpoint to a separate long-running service.

---

### LOW

**BUG-A8-5-025: `src/app/settings/page.tsx:77` [LOW] Avatar hardcoded to "NS" initials — not derived from actual `name` state**
The avatar in the Profile tab always shows `NS` regardless of what name the user sets. This is a UX bug but could also mislead users into thinking their initials updated when they haven't.
- Fix: derive initials from `name` state: `name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'ME'`.

**BUG-A8-5-026: `src/app/projects/page.tsx:464` [LOW] `handlePdfUpload` is called inside `handlePageDrop` which is declared as `useCallback` but references `handlePdfUpload` — not listed in deps**
`handlePageDrop` calls `handlePdfUpload(file)` but the outer `useCallback` has an empty deps array `[]`. If `handlePdfUpload` changes reference (which it doesn't because it's defined as a plain function, not a `useCallback`), this would silently use a stale closure. Not currently broken but fragile.
- Fix: wrap `handlePdfUpload` in `useCallback` with its own deps array, then include it in `handlePageDrop`'s deps.

**BUG-A8-5-027: `src/app/share/[token]/page.tsx:104` [LOW] "Download PDF" button calls `window.print()` — this is a print dialog, not a PDF download**
The "Download PDF" button in the shared view header calls `handlePrint` which is `window.print()`. Users expect a PDF file download, not a browser print dialog. This is a UX inconsistency that will confuse users.
- Fix: rename the button to "Print / Save as PDF" or implement a true PDF generation endpoint.

**BUG-A8-5-028: `src/app/learn/page.tsx` [LOW] Tutorials and Video Guides are entirely static/placeholder — no links or actual content**
Tutorial cards and video guide cards are fully hardcoded with no links, no actual video embeds, and "Coming soon" badges. A user who navigates to /learn expecting documentation finds non-functional content.
- Fix: either add real links/content or hide the sections until content is available.

**BUG-A8-5-029: `src/app/settings/page.tsx:191` [LOW] `Change Email` button is non-functional — clicking does nothing**
The "Change Email" button in the Profile tab has no `onClick` handler and no routing. Pressing it silently does nothing.
- Fix: wire to `supabase.auth.updateUser({ email: newEmail })` flow with confirmation prompt.

**BUG-A8-5-030: `src/app/api/projects/route.ts:8` [LOW] `GET /api/projects` thumbnail fetch uses `Promise.all` across all projects — N thumbnail reads on every list request**
Each call to `GET /api/projects` triggers a `getThumbnail()` and `getProjectSummary()` read for every project in parallel. With many projects, this creates an N-read fan-out per page load. The `withCache` wrapper only caches for 10 seconds.
- Fix: cache project summaries more aggressively; or batch the reads; or lazy-load thumbnails on the client side.

**BUG-A8-5-031: `tsconfig.json` [LOW] `target: "ES2017"` is conservative for Next.js 16 + Node 25 — `await` in loops and older syntax may prevent optimizations**
The TypeScript target is `ES2017`, which causes the TypeScript compiler to down-emit async/await to generator-based polyfills for that target. Since Next.js 16 runs on Node 25 (per runtime metadata), targeting `ES2022` or `ESNext` would allow native async/await and top-level await without transformation overhead.
- Fix: change `"target": "ES2022"` in `tsconfig.json` to match the actual runtime environment.

**BUG-A8-5-032: `package.json:7` [LOW] `build` script uses `--webpack` flag but `next.config.ts` enables Turbopack via `turbopack: {}`**
`"build": "next build --webpack"` forces webpack for the production build, while `next.config.ts` declares `turbopack: {}` suggesting intent to use Turbopack. The `--webpack` flag overrides the config, meaning Turbopack is only active in `dev` mode. This inconsistency means slower production builds and any Turbopack-specific optimizations are silently skipped.
- Fix: remove `--webpack` from the build script, or explicitly document that Turbopack is dev-only and remove `turbopack: {}` from the config.

---

## Summary

| Severity  | Count |
|-----------|-------|
| CRITICAL  | 5     |
| HIGH      | 9     |
| MEDIUM    | 10    |
| LOW       | 8     |
| **Total** | **32** |

### Top Priorities for Cycle 6

1. **BUG-A8-5-001** — Authenticate or remove `/api/audit-log` (CRITICAL, trivially exploitable)
2. **BUG-A8-5-002–005** — Lock down metrics, feature-flags, experiments, plugins endpoints (CRITICAL)
3. **BUG-A8-5-009** — Remove service-role key from `/api/perf` (HIGH, admin key exposure)
4. **BUG-A8-5-019** — Fix polygon wipe-before-AI-response data loss (HIGH, data integrity)
5. **BUG-A8-5-021** — Add SSRF blocklist to webhook URL validator (MEDIUM, server-side request forgery)
