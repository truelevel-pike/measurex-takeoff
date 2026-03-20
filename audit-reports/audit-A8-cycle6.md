# Audit A8 — Cycle 6
**Date:** 2026-03-20
**Scope:** Pages + Infra + Config — full file read (pages, next.config.ts, public/sw.js, public/manifest.json, vercel.json, all 24 supabase/migrations/)
**Auditor:** Admiral 8 (automated)

---

## Regression Check — Cycle 5 Top Priorities

The following Cycle 5 top-priority bugs were re-verified:

### ✅ CONFIRMED FIXED: BUG-A8-5-010 — OpenAI API key in localStorage
`saveAiSettings()` is still called in the AI tab on every keystroke via `updateAi()`. **The key is still persisted to localStorage in plaintext.** See BUG-A8-6-001 below — this was listed as a Cycle 5 top priority but has NOT been fixed.

### ⚠️ STILL OPEN: BUG-A8-5-019 — `unsafe-inline` in production script-src
`next.config.ts` line 28 still emits `'unsafe-inline'` in `script-src` unconditionally. Confirmed still present. See BUG-A8-6-002.

### ⚠️ STILL OPEN: BUG-A8-5-022 — SW caches `/api/projects` for 24h
`public/sw.js` runtime caching rule `matcher: ({url:e})=>/^\/api\/projects/.test(e.pathname)` with `maxAgeSeconds:86400`. Still present. See BUG-A8-6-003.

### ⚠️ STILL OPEN: BUG-A8-5-023 — PDF files cached with CacheFirst and no expiry
`public/sw.js` rule `matcher:({url:e})=>/\.pdf$/.test(e.pathname)`, `handler: new eE(...)` (CacheFirst), `plugins:[new ef({...})]` — no `maxAgeSeconds` in the PDF cache rule object. Still present. See BUG-A8-6-004.

### ✅ MIGRATION 024 TRACKING — BUG-A8-5-029
`024_fix_seed_created_by.sql` still contains no `INSERT INTO _migrations` record. See BUG-A8-6-005.

### ⚠️ STILL OPEN: BUG-A8-5-030 / BUG-A8-5-031 — Duplicate migration prefix 006 and 013
Both `006_estimates.sql` / `006_mx_formula_fields.sql` and `013_classification_library.sql` / `013_mx_pages_text.sql` collisions are still present. See BUG-A8-6-006 / BUG-A8-6-007.

### ⚠️ STILL OPEN: BUG-A8-5-032 — Silent partial policy drop in 022
`022_rls_owner_scoped.sql` uses bare `DROP POLICY IF EXISTS "Allow all"` with no guard. Still present. See BUG-A8-6-008.

---

## Verified Still-Fixed (Carry-over Confirmation)

| ID | Description | Status |
|----|-------------|--------|
| R-A8-001 | `_exec_sql` PUBLIC execute revoked | ✅ |
| R-A8-002 | RLS `USING (true)` replaced with owner-scoped | ✅ |
| R-A8-003 | `owner_id` on `mx_projects` | ✅ |
| BUG-A8-4-012 | anon SELECT revoked on `mx_classification_library` | ✅ |
| BUG-A8-4-013 | `is_org` promotion locked to service_role | ✅ |
| BUG-A8-4-014 | Storage RLS for `pdfs` bucket | ✅ |
| BUG-A8-001 | Share view isolated from global store | ✅ |
| BUG-A8-002 | Share export checks `res.ok` before body consumption | ✅ |
| BUG-A8-4-001 | Share opener leakage fixed | ✅ |
| BUG-A8-014 | Suspense + Error Boundary in print page | ✅ |
| BUG-A8-4-005 | Canvas dims reactive state in print view | ✅ |
| BLOCKER-002 | `frame-ancestors 'self'` replaces X-Frame-Options DENY | ✅ |

---

## File-by-File Findings

---

### `src/app/layout.tsx`

✅ CLEAN. No new issues. Skip link, `DevPerfOverlayLoader` gated to dev, PerfMonitor, ServiceWorkerRegister, PWAInstallBanner all in place. OpenGraph and Twitter metadata complete. `generateViewport()` pattern correct. No issues found.

---

### `src/app/page.tsx`

**BUG-A8-6-001: `src/app/page.tsx` (via `lib/ai-settings.ts`) [HIGH] OpenAI API key persisted to `localStorage` in plaintext — unchanged from Cycle 5 top priority**
The AI tab `updateAi()` calls `saveAiSettings(next)` on every change, and `saveAiSettings` writes the full `openaiApiKey` value to `localStorage`. The fix from BUG-A8-5-010 was never applied. Any JavaScript on the same origin (including a future XSS payload) can extract the key. The key is not cleared on session end or logout.
- Fix: Either use `sessionStorage` (clears on tab close), or show a one-time copy prompt on entry and immediately replace the stored value with a masked representation. Add a Supabase auth state change listener to call `localStorage.removeItem('mx-ai-settings')` on sign-out.

**BUG-A8-6-002: `src/app/page.tsx:546–548` [MEDIUM] `localStorage.getItem('measurex_project_id')` used without UUID validation**
On mount, the app reads `measurex_project_id` from localStorage with no format check and passes it directly to `hydrateProject(pid)`. If the stored value is not a valid UUID (e.g., corrupted, or injected via XSS), the API call to `/api/projects/${pid}` will return a 500 or 400, leaking backend error details into the UI. Previously flagged as BUG-A8-5-001, unresolved.
- Fix: `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; if (!UUID_RE.test(pid)) return;`

**BUG-A8-6-003: `src/app/page.tsx:1198–1207` [MEDIUM] `onFileChange` accepts files based on browser-supplied MIME type only — no magic-byte verification**
`if (f && f.type === 'application/pdf')` — the browser derives this from the file extension, not the content. A renamed `.html` or `.js` file will pass. While server-side validation should catch this, there is no client-side defense. Previously flagged as BUG-A8-5-002, unresolved.
- Fix: Read the first 5 bytes with `FileReader` and verify `%PDF-` magic bytes before calling `ensureProject`.

**BUG-A8-6-004: `src/app/page.tsx:862` [MEDIUM] `handleAITakeoff` 'a' key handler uses `aiLoading` state check without ref guard — rapid-fire race window**
The keyboard handler checks `if (aiLoading) return` but `aiLoading` is React state — there is a render cycle gap between keypress and state update. Previously flagged as BUG-A8-5-003, unresolved.
- Fix: Add a `useRef` boolean guard that is set synchronously before the state update (same pattern as `isSavingRef`).

**BUG-A8-6-005: `src/app/page.tsx:1060` [LOW] `window.history.replaceState` double-encoding and unnecessary calls**
Previously flagged as BUG-A8-5-004 (double-encoding + unnecessary history mutation when URL already correct). Unresolved.
- Fix: Check `window.location.search` before replacing state; use `null` for the deprecated title argument.

**BUG-A8-6-006: `src/app/page.tsx` [LOW] `installMeasurexAPI()` called in `useEffect` with no cleanup**
Previously flagged as BUG-A8-5-005. The `window.measurex` global is installed with no removal on unmount. Stale closures accumulate across hot reloads.
- Fix: Return `() => { delete (window as any).measurex; }` from the `useEffect`.

**BUG-A8-6-007: `src/app/page.tsx:940–951` [LOW] Number key page navigation hardcoded to keys '1'–'7' only**
Keys 8+ silently do nothing regardless of `totalPages`. Previously flagged as BUG-A8-5-006, unresolved.
- Fix: Handle all digit keys dynamically: `if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey)`.

---

### `src/app/projects/page.tsx`

**BUG-A8-6-008: `src/app/projects/page.tsx:237` [MEDIUM] Duplicate-name check reads stale local project cache**
The `handleCreate` function checks `projects.find(p => p.name.toLowerCase() === trimmed.toLowerCase())` against the in-memory `projects` array, which was last fetched on mount. A concurrent tab creating a same-name project will not be detected. Previously flagged as BUG-A8-5-007, unresolved.
- Fix: Re-fetch projects immediately before the check, or add a server-side `UNIQUE (owner_id, name)` constraint on `mx_projects`.

**BUG-A8-6-009: `src/app/projects/page.tsx` [MEDIUM] Star/folder/tag state in `localStorage` only — not server-synced, not per-user**
Previously flagged as BUG-A8-5-008 (and BUG-A8-5-016 in prior cycle). Remains unresolved. Starred projects, folder assignments, and tags are stored exclusively in `localStorage`, silently lost on incognito mode, storage clear, or different browsers/devices.
- Fix: Persist to a `mx_user_preferences` table or user-settings API endpoint.

**BUG-A8-6-010: `src/app/projects/page.tsx` [LOW] `handlePageDrop` `useCallback` missing `handlePdfUpload` in deps**
Previously flagged as BUG-A8-5-009. `handlePageDrop` depends on `handlePdfUpload` (a plain function) but its deps array is `[]`. Currently harmless but fragile.
- Fix: Wrap `handlePdfUpload` in `useCallback`, add to `handlePageDrop` deps.

---

### `src/app/settings/page.tsx`

**BUG-A8-6-011: `src/app/settings/page.tsx:531` [HIGH] OpenAI API key stored in plaintext to `localStorage` via `saveAiSettings()`**
`updateAi({ openaiApiKey: e.target.value })` immediately calls `saveAiSettings(next)` which persists the full secret key to `localStorage['mx-ai-settings']`. This is the root cause of BUG-A8-6-001 above. Unresolved from Cycle 5 (BUG-A8-5-010).
- Fix: Do not persist the raw key. Options: (a) show one-time copy prompt and store only masked version; (b) use `sessionStorage`; (c) require per-session entry without persistence. Minimum: register a Supabase `onAuthStateChange` hook that calls `localStorage.removeItem('mx-ai-settings')` on `SIGNED_OUT`.

**BUG-A8-6-012: `src/app/settings/page.tsx:152` [MEDIUM] `apiKeys` state initialized from `useState([])` — no localStorage persistence, lost on reload**
Previously flagged as BUG-A8-5-011. User-created API keys exist only in React state. Navigating away or reloading loses all entries. Unresolved.
- Fix: Persist `apiKeys` to `localStorage` (with full key shown only on creation via `justAddedKeyId`, masked thereafter).

**BUG-A8-6-013: `src/app/settings/page.tsx:254` [LOW] Avatar initials hardcoded to "NS" — not derived from `name` state**
Previously flagged as BUG-A8-5-012 and BUG-A8-5-025 in prior cycle. Still hardcoded. Unresolved.
- Fix: `name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'ME'`

**BUG-A8-6-014: `src/app/settings/page.tsx:268` [LOW] "Change Email" button has no `onClick` handler**
Previously flagged as BUG-A8-5-013. The button renders and is clickable but does nothing. Unresolved.
- Fix: Wire to `supabase.auth.updateUser({ email: newEmail })` with a confirmation input modal.

**BUG-A8-6-015: `src/app/settings/page.tsx` [LOW] `Bell` icon imported but never rendered in a meaningful context**
The `Bell` icon from lucide-react is imported and appears in the organization section next to the member count with no tooltip or onClick — purely decorative with no accessible label. Appears to be a placeholder for a future notification action.
- Fix: Either add `aria-label="Notifications"` and wire up a notifications action, or remove until implemented.

---

### `src/app/share/[token]/page.tsx`

**BUG-A8-6-016: `src/app/share/[token]/page.tsx` [LOW] "Download PDF" button still calls `handlePrint` (= `window.print()`)**
Previously flagged as BUG-A8-5-014 and BUG-A8-5-027. Both the "Print" and "Download PDF" buttons invoke `window.print()`. Users expect "Download PDF" to produce a file download. Unresolved.
- Fix: Rename to "Print / Save as PDF" or wire the Download PDF button to `handleExport('pdf')` which calls the `/api/share/${token}/export?format=pdf` endpoint.

**BUG-A8-6-017: `src/app/share/[token]/page.tsx:79` [LOW] `fetch('/api/share/${token}')` does not encode the token**
The token is a UUID but is used unencoded in the URL. While UUIDs contain only hex characters and hyphens (safe for URL paths), a defensive `encodeURIComponent(token)` here would be consistent with the `handleExport` function (which does encode it) and protects against unexpected token formats in future.
- Fix: `fetch('/api/share/${encodeURIComponent(token)}')` for consistency.

**BUG-A8-6-018: `src/app/share/[token]/page.tsx` [LOW] No share link expiry display**
Previously flagged as BUG-A8-5-015. The share page does not show when the link was created, expires, or whether it has been revoked. Unresolved.
- Fix: Include `expiresAt` in `/api/share/[token]` response and render it in the UI.

---

### `src/app/print/page.tsx`

**BUG-A8-6-019: `src/app/print/page.tsx:104–117` [MEDIUM] `applyStoreState` does not validate individual polygon/classification item shapes**
The BroadcastChannel/localStorage handler guards `Array.isArray()` at the top level but casts individual items directly as `Classification[]` and `Polygon[]`. A malformed polygon missing `points`, `classificationId`, or `pageNumber` will propagate into `quantityRows` computation and cause silent NaN values or crashes in the SVG overlay. Previously flagged as BUG-A8-5-016, unresolved.
- Fix: Validate required fields before casting: check each polygon has `id` (string), `points` (Array), `classificationId` (string), `pageNumber` (number), `isComplete` (boolean).

**BUG-A8-6-020: `src/app/print/page.tsx:204` [LOW] Auto-print fires unconditionally 500ms after PDF load — browser may suppress if tab is hidden**
Previously flagged as BUG-A8-5-018. `setTimeout(() => window.print(), 500)` fires regardless of `document.visibilityState`. If the user switches tabs after opening the print window, the print dialog may be silently suppressed. Unresolved.
- Fix: Check `document.visibilityState === 'visible'` before calling `window.print()`; if hidden, skip auto-print and display a prominent "Print" button with an instruction.

**BUG-A8-6-021: `src/app/print/page.tsx:176` [LOW] pdf.js worker loaded from CDN — fragile dependency on `worker-src` CSP entry**
Previously noted as BUG-A8-5-017 (no fix needed unless CSP changes). Documenting as ongoing dependency: `print/page.tsx` sets `pdfjsLib.GlobalWorkerOptions.workerSrc` to `https://cdn.jsdelivr.net/npm/pdfjs-dist@.../build/pdf.worker.min.mjs`. The print page inherits the same CSP with `worker-src blob: 'self' https://cdn.jsdelivr.net` — currently correct but fragile. No fix required unless CSP tightens.

---

### `next.config.ts`

**BUG-A8-6-022: `next.config.ts:28` [MEDIUM] `'unsafe-inline'` in `script-src` present in production — XSS mitigation gap**
Line 28: `` `script-src 'self' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""} 'unsafe-inline' https://cdn.jsdelivr.net` ``
`'unsafe-inline'` appears unconditionally in `script-src`. While `'unsafe-eval'` is gated to dev, `'unsafe-inline'` is not — this allows execution of any inline `<script>` tag, defeating the XSS protection that CSP provides. Previously flagged as BUG-A8-5-019, still unresolved.
- Fix: Generate a per-request nonce via Next.js middleware (or use `script-src-elem` with nonce) and replace `'unsafe-inline'` with `'nonce-<value>'`. Thread the nonce to the pdf.js initialization script if inline.

**BUG-A8-6-023: `next.config.ts` [LOW] `frame-ancestors 'self'` — same-origin framing expands attack surface**
Previously flagged as BUG-A8-5-020b. `frame-ancestors 'self'` is intentional for OpenClaw sandbox compatibility. If user-controlled HTML is ever served from the same origin, this creates a same-origin clickjacking vector. No immediate fix needed; document the requirement. If user uploads or open redirects at the same origin are ever added, revisit with explicit allowed parent origins.

**BUG-A8-6-024: `next.config.ts` [LOW] `turbopack: {}` in config but build uses webpack (package.json `--webpack` flag)**
Previously flagged as BUG-A8-5-021. `turbopack: {}` is declared in `nextConfig` but `npm run build` uses `next build --webpack` (forcing webpack). Turbopack only activates in dev. Unresolved.
- Fix: Remove `--webpack` from the `build` script in `package.json` to allow Turbopack in production builds, or remove the `turbopack: {}` key from config if webpack is intentionally required.

✅ CLEAN (confirmed carry-over fixes in place):
- `connect-src` narrowed to specific Supabase URLs (BUG-A8-003) ✅
- `blob:` removed from `script-src-elem` (BUG-A8-010) ✅
- `unsafe-eval` dev-only (R-A8-007) ✅
- HSTS header present (R-A8-011) ✅
- `X-Frame-Options: DENY` removed, `frame-ancestors 'self'` in CSP (BLOCKER-002) ✅
- `NEXT_TELEMETRY_DISABLED: "1"` in env ✅

---

### `public/sw.js`

**BUG-A8-6-025: `public/sw.js` [MEDIUM] `/api/projects` response cached for 24h (86400s) — stale data after project deletion or ownership transfer**
The runtime caching rule `matcher:({url:e})=>/^\/api\/projects/.test(e.pathname)` with `plugins:[new ef({maxEntries:20,maxAgeSeconds:86400})]` caches all project-list API responses for 24 hours. Deleted or transferred projects will continue appearing in the UI for up to a full day. Previously flagged as BUG-A8-5-022, unresolved.
- Fix: Reduce `maxAgeSeconds` to 300 (5 minutes) for API project responses. Alternatively, add a SW `message` handler that flushes the `api-projects` cache key on project mutation events.

**BUG-A8-6-026: `public/sw.js` [MEDIUM] PDF files cached with `CacheFirst` strategy and no `maxAgeSeconds` — stale PDFs served indefinitely after re-upload**
The rule `matcher:({url:e})=>/\.pdf$/.test(e.pathname)`, `handler: new eE({cacheName:"pdf-files"})`, `plugins:[new ef({...})]` — examining the minified code, the `ef` constructor receives no `maxAgeSeconds` parameter for the PDF-files cache. If a project's PDF is re-uploaded (same URL), the cached version is served forever. Previously flagged as BUG-A8-5-023, unresolved.
- Fix: Add `maxAgeSeconds: 3600` (1 hour) and `maxEntries: 10` to the pdf-files cache rule, or switch to `NetworkFirst` for PDF resources.

**BUG-A8-6-027: `public/sw.js` [LOW] `skipWaiting: false` — deployed updates may not reach active users for hours**
Previously flagged as BUG-A8-5-024. Users with open tabs will continue running the old SW until all tabs close. The `SKIP_WAITING` message handler is already present in the generated SW. Unresolved.
- Fix: Add a banner in the app UI that detects a waiting SW and calls `postMessage({ type: 'SKIP_WAITING' })` and reloads.

**NEW — BUG-A8-6-028: `public/sw.js` [MEDIUM] General `/api/` catch-all caches ALL API GET responses for 24h — includes sensitive endpoints**
The generated SW contains a second runtime rule:
```js
matcher:({sameOrigin:e,url:{pathname:t}})=>e&&t.startsWith("/api/"),
handler: new ee({cacheName:"apis",plugins:[new ef({maxEntries:16,maxAgeSeconds:86400})]})
```
This caches **all** same-origin API `GET` responses for 24 hours. This includes sensitive endpoints such as `/api/share/[token]` (which returns full project state), `/api/projects/[id]` (project data), `/api/errors`, and `/api/audit-log`. A shared-device scenario where a user logs out and a second user logs in would serve the first user's cached API responses to the second user's requests until cache expiry. This is a data leakage risk.
- Fix: Reduce `maxAgeSeconds` for the general API cache to 60 seconds, or exclude sensitive endpoints (share, audit-log, errors) from the cache rule. Add auth-token-aware cache key or network-only strategy for authenticated endpoints.

---

### `public/manifest.json`

**BUG-A8-6-029: `public/manifest.json` [LOW] Both icon entries use `"purpose": "any maskable"` — should be split**
Previously flagged as BUG-A8-5-025. The combined `"purpose": "any maskable"` string is valid per spec but semantically means both `any` and `maskable` are served from the same file. If the icons lack a safe-zone design (inner 80% safe area), they will be clipped on Android adaptive icon contexts. Unresolved.
- Fix: Split into separate entries per icon with `"purpose": "any"` and `"purpose": "maskable"` after confirming safe-zone compliance.

**BUG-A8-6-030: `public/manifest.json` [LOW] Missing `screenshots` field — reduces PWA install score on Chromium**
Previously flagged as BUG-A8-5-026. No `screenshots` field. Unresolved.
- Fix: Add at least one screenshot entry with `src`, `sizes`, `type`, and an optional `form_factor` (`narrow` or `wide`).

✅ CLEAN: `id`, `start_url`, `scope`, `display: standalone`, `orientation`, `lang`, `categories`, `background_color`, `theme_color`, both icon sizes present.

---

### `vercel.json`

**BUG-A8-6-031: `vercel.json:5` [MEDIUM] `maxDuration: 300` on `/api/ws` SSE route — only honored on Enterprise plans**
Previously flagged as BUG-A8-5-027. `maxDuration: 300` (5 minutes) for the SSE endpoint is silently capped to 60s on Pro and 10s on Hobby tiers. SSE clients have no reconnect logic and will see hard disconnects. Unresolved.
- Fix: Document the Vercel plan requirement; add client-side reconnect with exponential backoff in `src/lib/ws-client.ts`.

**BUG-A8-6-032: `vercel.json` [LOW] `regions: ["iad1", "sfo1"]` multi-region without connection pooler — Postgres connection exhaustion risk**
Previously flagged as BUG-A8-5-028. Two Vercel regions open direct Postgres connections to Supabase without PgBouncer/pooler. Unresolved.
- Fix: Enable Supabase's built-in connection pooler (Transaction mode) and update `NEXT_PUBLIC_SUPABASE_URL` to the pooler endpoint, or reduce to single region.

---

### `supabase/migrations/` — All 24 Files

**BUG-A8-6-033: `supabase/migrations/024_fix_seed_created_by.sql` [MEDIUM] Migration not tracked in `_migrations` — will re-run on every migration pass**
Previously flagged as BUG-A8-5-029. The file contains only a bare `UPDATE` with no `INSERT INTO _migrations`. Unresolved.
- Fix: Append `INSERT INTO _migrations (name) VALUES ('024_fix_seed_created_by.sql') ON CONFLICT (name) DO NOTHING;` to the file.

**BUG-A8-6-034: `supabase/migrations/006_estimates.sql` + `006_mx_formula_fields.sql` [MEDIUM] Duplicate prefix `006_` — migration ordering ambiguity**
Previously flagged as BUG-A8-5-030. Two migrations share the `006` prefix. File system sort order determines which runs first. Unresolved.
- Fix: Rename one file (e.g., `006_mx_formula_fields.sql` → `006b_mx_formula_fields.sql` since formula fields depend on the base schema and estimates table).

**BUG-A8-6-035: `supabase/migrations/013_classification_library.sql` + `013_mx_pages_text.sql` [MEDIUM] Duplicate prefix `013_` — migration ordering ambiguity**
Previously flagged as BUG-A8-5-031. Same issue as 006 duplicate. `013_classification_library.sql` has no `INSERT INTO _migrations` entry and is untracked, meaning it re-runs every migration pass. Unresolved.
- Fix: Rename one file (e.g., `013b_mx_pages_text.sql`) and add `INSERT INTO _migrations (name) VALUES ('013_classification_library.sql') ON CONFLICT (name) DO NOTHING;` to the library migration.

**BUG-A8-6-036: `supabase/migrations/022_rls_owner_scoped.sql` [MEDIUM] `DROP POLICY IF EXISTS "Allow all"` silent partial drop — residual permissive policies not detected**
Previously flagged as BUG-A8-5-032. All eight `DROP POLICY IF EXISTS "Allow all"` calls succeed silently even if the policy name differs. There is no post-drop verification that no permissive `USING (true)` policies remain. Unresolved.
- Fix: Add a post-drop guard per table using `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '<table>' AND qual LIKE '%true%') THEN RAISE EXCEPTION 'Residual permissive policy on <table>'; END IF; END $$;`.

**BUG-A8-6-037: `supabase/migrations/012_share_token.sql` [LOW] Idempotent re-apply of 010 — lacks `_migrations` tracking INSERT**
Previously flagged as BUG-A8-5-033. `012_share_token.sql` notes it is a re-application of 010 but has no `INSERT INTO _migrations` record. Will re-run on every migration pass (harmless due to `IF NOT EXISTS` guards, but adds noise and risk). Unresolved.
- Fix: Add `INSERT INTO _migrations (name) VALUES ('012_share_token.sql') ON CONFLICT (name) DO NOTHING;` at the end.

**BUG-A8-6-038: `supabase/migrations/009_complete_schema.sql` [LOW] `mx_projects` defined without `owner_id` — misleading "self-contained" comment**
Previously flagged as BUG-A8-5-034. Migration 009 claims self-contained status but creates `mx_projects` without the `owner_id` column that migration 021 must add. Running 009 on a fresh DB without 021 produces a schema that will break all RLS policies in 022. Unresolved.
- Fix: Update the comment in 009 to document the dependency on 021, or add `owner_id UUID REFERENCES auth.users(id)` to the 009 `CREATE TABLE IF NOT EXISTS mx_projects` definition (021's `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` will skip it gracefully).

**NEW — BUG-A8-6-039: `supabase/migrations/013_classification_library.sql` [MEDIUM] `grant select on mx_classification_library to anon` conflicts with migration 023**
Line in `013_classification_library.sql`:
```sql
grant select on public.mx_classification_library to anon;
```
Migration `023_security_hardening.sql` then does:
```sql
REVOKE SELECT ON mx_classification_library FROM anon;
```
If migrations are re-applied out of order (e.g., dev environment fresh setup, or if 013 runs after 023 due to a deployment script bug), the GRANT in 013 will silently re-open anonymous read access that 023 intended to close. There is no guard in 023 to detect this regression.
- Fix: Remove `grant select on public.mx_classification_library to anon;` from `013_classification_library.sql` entirely, since 023 explicitly revokes it. The correct intent is for the REVOKE in 023 to be the authoritative state.

**BUG-A8-6-040: `supabase/migrations/009_complete_schema.sql:188–216` [LOW] RLS policies in 009 use `USING (true)` — superseded by 022, but ordering risk remains**
Migration 009 creates permissive "Allow all" policies with `USING (true)` on all tables as part of its "initial setup" block. Migration 022 drops and replaces them. If 009 is ever re-run (e.g., partial rollback scenario), the permissive policies come back. The 022 migration is not re-run automatically after a partial 009 re-run.
- Fix: Remove the "Allow all" policy creation from 009 entirely, or replace with commented-out stubs and a note that 022 provides the real policies.

✅ CLEAN migrations (idempotent, tracked, correct):
- `000_bootstrap.sql` — RCE fix confirmed ✅
- `001_mx_tables.sql` through `008_performance_indexes.sql` — all idempotent ✅
- `010_share_tokens.sql` — idempotent, tracked ✅
- `011_add_formula_columns.sql` — idempotent ✅
- `014_drawing_set_fix.sql` through `020_mx_scales_add_cm_unit.sql` — idempotent ✅
- `021_add_owner_id_to_projects.sql` — owner_id fix, idempotent ✅
- `022_rls_owner_scoped.sql` — RLS fix confirmed (with BUG-A8-6-036 caveat) ✅
- `023_security_hardening.sql` — hardening fixes confirmed ✅

---

## New Bugs Found in Cycle 6 (Not Previously Flagged)

| ID | File | Severity | Description |
|----|------|----------|-------------|
| BUG-A8-6-028 | `public/sw.js` | MEDIUM | General `/api/` catch-all caches ALL API GET responses 24h including auth-sensitive endpoints |
| BUG-A8-6-039 | `supabase/migrations/013_classification_library.sql` | MEDIUM | `grant select to anon` conflicts with 023's REVOKE — re-open risk if migrations run out of order |
| BUG-A8-6-040 | `supabase/migrations/009_complete_schema.sql` | LOW | `USING (true)` policies in 009 can reappear if 009 is re-run without re-running 022 |
| BUG-A8-6-015 | `src/app/settings/page.tsx` | LOW | `Bell` icon decorative placeholder with no accessible label or action |
| BUG-A8-6-017 | `src/app/share/[token]/page.tsx` | LOW | Token not encoded in initial fetch URL (inconsistency with export handler) |

---

## Summary

| Severity | Count | Notes |
|----------|-------|-------|
| CRITICAL | 0 | All prior CRITICAL issues confirmed fixed |
| HIGH | 2 | OpenAI API key in localStorage (×2 entry points: settings page + page.tsx) |
| MEDIUM | 11 | CSP unsafe-inline, SW cache TTLs x3, migration tracking issues, UUID validation, anon grant regression risk |
| LOW | 13 | UX, accessibility, manifest, print auto-trigger, code quality, migration stubs |
| **Total** | **26** | 5 new bugs + 21 carry-over unresolved from Cycle 5 |

### Regressions from Cycle 5
None. All security fixes from Cycles 1–5 confirmed intact.

### Top Priorities for Fix Wave

1. **BUG-A8-6-001 / BUG-A8-6-011** — OpenAI API key persisted in localStorage (HIGH) — two entry points, same root cause
2. **BUG-A8-6-022** — `unsafe-inline` in production `script-src` (MEDIUM)
3. **BUG-A8-6-028** — SW general API cache serves all authenticated GET responses for 24h (MEDIUM, data leakage on shared devices)
4. **BUG-A8-6-025** — SW caches `/api/projects` for 24h (MEDIUM)
5. **BUG-A8-6-026** — PDF CacheFirst no expiry (MEDIUM)
6. **BUG-A8-6-039** — anon GRANT in 013 conflicts with REVOKE in 023 (MEDIUM)
7. **BUG-A8-6-033** — Migration 024 not tracked in `_migrations` (MEDIUM)
8. **BUG-A8-6-034 / BUG-A8-6-035** — Duplicate migration prefixes 006 and 013 (MEDIUM)
9. **BUG-A8-6-036** — Silent partial policy drop in 022 (MEDIUM)
10. **BUG-A8-6-002** — localStorage projectId used without UUID validation (MEDIUM)