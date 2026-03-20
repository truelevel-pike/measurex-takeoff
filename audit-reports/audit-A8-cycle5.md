# Audit A8 — Cycle 5
**Date:** 2026-03-20
**Scope:** Pages + Infra + Config (E36–E40 dispatch)
**Auditor:** Admiral (automated)
**Files audited:**
- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/projects/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/share/[token]/page.tsx`
- `src/app/print/page.tsx`
- `next.config.ts`
- `public/sw.js`
- `public/manifest.json` + icons
- `vercel.json`
- `supabase/migrations/` (all 24 files, 000–024)

---

## Regression Check — Cycle 4 RLS/RCE Fixes

The following critical fixes from prior cycles were verified against the current codebase:

### ✅ VERIFIED FIXED: R-A8-001 — `_exec_sql` PUBLIC EXECUTE revoked
`supabase/migrations/000_bootstrap.sql` now includes:
```sql
REVOKE EXECUTE ON FUNCTION _exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _exec_sql(text) TO service_role;
ALTER FUNCTION _exec_sql(text) SET search_path = public, pg_temp;
```
The RCE vector is closed. **CONFIRMED FIXED.**

### ✅ VERIFIED FIXED: R-A8-002 — RLS policies `USING (true)` replaced
`supabase/migrations/022_rls_owner_scoped.sql` drops all "Allow all" policies and replaces them with `owner_id = auth.uid()` on `mx_projects` and `project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid())` on all child tables. All eight tables covered. **CONFIRMED FIXED.**

### ✅ VERIFIED FIXED: R-A8-003 — `owner_id` column added to `mx_projects`
`supabase/migrations/021_add_owner_id_to_projects.sql` adds `owner_id UUID REFERENCES auth.users(id)` with index. Groups RLS policies in 018 will now resolve correctly. **CONFIRMED FIXED.**

### ✅ VERIFIED FIXED: BUG-A8-4-012 — anon SELECT on `mx_classification_library` revoked
`supabase/migrations/023_security_hardening.sql` includes `REVOKE SELECT ON mx_classification_library FROM anon;`. **CONFIRMED FIXED.**

### ✅ VERIFIED FIXED: BUG-A8-4-013 — `is_org` promotion locked to service_role
Policy now enforces `is_org = false OR auth.role() = 'service_role'` on UPDATE. **CONFIRMED FIXED.**

### ✅ VERIFIED FIXED: BUG-A8-4-014 — Storage RLS for `pdfs` bucket
Three policies (INSERT/SELECT/DELETE) added in 023, scoped by `owner_id`. **CONFIRMED FIXED.**

---

## File-by-File Findings

---

### `src/app/layout.tsx`

✅ CLEAN: No security issues, no CSP gaps, no TODO/FIXME. Layout correctly renders `ServiceWorkerRegister`, `PWAInstallBanner`, `OfflineBanner`, keyboard portal, and perf monitor. `DevPerfOverlayLoader` is correctly gated to `process.env.NODE_ENV === 'development'`. Skip link for accessibility is present. OpenGraph metadata is complete.

---

### `src/app/page.tsx`

**BUG-A8-5-001: `src/app/page.tsx:548` [HIGH] Project hydration reads `projectId` from `localStorage` without validation — open redirect / project confusion**
`localStorage.getItem('measurex_project_id')` is trusted as a valid project UUID without format validation. If an attacker can inject into localStorage (via XSS from a future vulnerability), they can force the app to hydrate an arbitrary project ID. More practically: if the stored value is not a UUID, the API returns a 500 rather than a 404, leaking error details to the UI.
- Fix: validate `pid` against a UUID regex before calling `hydrateProject(pid)`.

**BUG-A8-5-002: `src/app/page.tsx:1191–1208` [MEDIUM] `onFileChange` silently accepts any file with `type === 'application/pdf'` — MIME type is client-controlled**
The file input only checks `f.type === 'application/pdf'`. This is the browser-supplied MIME type from the file extension; it is not verified against actual file bytes. A renamed `.html` file with `application/pdf` extension will pass this check and be sent to the server.
- Fix: Read the first 5 bytes of the file as ArrayBuffer and verify `%PDF-` magic bytes before calling `ensureProject`.

**BUG-A8-5-003: `src/app/page.tsx:820` [MEDIUM] `handleAITakeoff` keyboard shortcut (`a` key) fires without debounce — rapid keypress sends concurrent AI requests**
The `a` key handler calls `handleAITakeoff()` directly. While `aiLoading` is checked (`if (aiLoading) return`), there is a brief window between the key press and the state update where rapid repeated presses can queue multiple concurrent AI requests to `/api/ai-takeoff`.
- Fix: Use a `useRef` flag (similar to `isSavingRef`) to prevent re-entry, or disable the keyboard handler while `aiLoading` is true with a ref guard.

**BUG-A8-5-004: `src/app/page.tsx:1060` [MEDIUM] `window.history.replaceState` called with `encodeURIComponent(project.id)` — double-encoding risk if ID already contains URL-safe chars**
Project IDs are UUIDs (only hex + hyphens) so this is safe in practice. However, `window.history.replaceState({}, '', ...)` with an empty state object and empty title is deprecated in some browsers and will trigger a warning. Additionally, this is called from `handleSave` (manual save) and `ensureProject` (auto-create) without checking if the URL already has the correct `?project=` param, causing unnecessary history mutations.
- Fix: Check `window.location.search` before replacing state; use `null` for the deprecated title argument.

**BUG-A8-5-005: `src/app/page.tsx` [LOW] `installMeasurexAPI()` is called on every mount with no cleanup — exposed globals persist after project navigation**
`useEffect(() => { installMeasurexAPI(); }, [])` installs automation API methods on `window.measurex` with no cleanup function. If the page component unmounts and remounts (e.g., during hot reload), APIs may be re-registered with stale closures.
- Fix: Return a cleanup function from `useEffect` that removes the `window.measurex` property.

**BUG-A8-5-006: `src/app/page.tsx:855` [LOW] Number keys 1–7 navigate pages but key '8' and above silently do nothing — no feedback for out-of-range navigation**
The keyboard shortcut handler allows number keys `'1'` through `'7'` to navigate pages, but only if `targetPage <= totalPages`. If a user has >7 pages, keys for pages 8+ are not handled at all (no UI feedback). The check also hardcodes `'7'` as the max digit rather than computing dynamically.
- Fix: Either handle all digit keys dynamically up to `totalPages`, or remove the keyboard page-jump shortcut entirely in favor of the Top Nav input.

---

### `src/app/projects/page.tsx`

**BUG-A8-5-007: `src/app/projects/page.tsx:237` [MEDIUM] Duplicate project name check (BUG-R5-005 fix) only runs against locally cached project list — stale data race**
The fix for BUG-R5-005 checks for duplicates by filtering the local `projects` array. This list is fetched once on mount. If another tab creates a project with the same name between page load and the user clicking Create, the duplicate check passes and two identically-named projects are created.
- Fix: Re-fetch the project list immediately before the duplicate check, or add a server-side uniqueness constraint on `(owner_id, name)`.

**BUG-A8-5-008: `src/app/projects/page.tsx` [MEDIUM] Star/folder/tag state stored in `localStorage` with no server sync — silently lost on browser data clear**
This was previously flagged (BUG-A8-5-016 in the prior A8 cycle 5 report). Remains unresolved. Starred projects and folder assignments are persisted exclusively to `localStorage`. This data is not per-user, not synced, and lost on incognito/storage clear.
- Fix: Persist organizational state to a user-settings API endpoint or a `mx_user_preferences` table.

**BUG-A8-5-009: `src/app/projects/page.tsx:464` [LOW] `handlePageDrop` `useCallback` missing `handlePdfUpload` in deps array**
`handlePageDrop` (defined with `useCallback` and empty deps `[]`) calls `handlePdfUpload` which is a plain function — not memoized. Currently harmless because plain functions don't change reference, but fragile.
- Fix: Wrap `handlePdfUpload` in `useCallback`, then add it to `handlePageDrop`'s deps.

---

### `src/app/settings/page.tsx`

**BUG-A8-5-010: `src/app/settings/page.tsx:305` [HIGH] OpenAI API key persisted in plaintext to `localStorage` via `saveAiSettings()`**
`updateAi({ openaiApiKey: e.target.value })` → `saveAiSettings()` stores the full API key in `localStorage`. Any JavaScript running on the same origin (including future XSS payloads) can read it. The key is never cleared on logout.
- Fix: Store only to `sessionStorage` (clears on tab close), or show a one-time copy prompt and never persist the full key. Minimum: add a sign-out hook that clears `localStorage.removeItem('mx-ai-settings')`.

**BUG-A8-5-011: `src/app/settings/page.tsx:239` [MEDIUM] `apiKeys` state initialized from `useState([])` with no localStorage persistence — keys lost on reload**
User-generated API keys are stored only in React state. Navigating away or refreshing the settings page loses all added keys. This was previously flagged (BUG-A8-5-022).
- Fix: Persist `apiKeys` to `localStorage` with the full key shown only once on creation, thereafter storing only a masked version.

**BUG-A8-5-012: `src/app/settings/page.tsx:77` [LOW] Avatar initials hardcoded to "NS" — not derived from `name` state**
The avatar always shows "NS" regardless of what name the user sets. Previously flagged (BUG-A8-5-025), still unresolved.
- Fix: Derive initials dynamically: `name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'ME'`.

**BUG-A8-5-013: `src/app/settings/page.tsx:191` [LOW] "Change Email" button has no `onClick` handler — clicking does nothing**
Previously flagged (BUG-A8-5-029), still unresolved.
- Fix: Wire to `supabase.auth.updateUser({ email: newEmail })` flow.

---

### `src/app/share/[token]/page.tsx`

✅ CLEAN (security): BUG-A8-001 (global store contamination), BUG-A8-002 (unchecked response body), and BUG-A8-4-001 (opener leakage) are all confirmed fixed. Share view correctly uses isolated local state. Export uses `encodeURIComponent(token)` and `noopener,noreferrer`. Date hydration mismatch fix (BUG-A8-030) is in place.

**BUG-A8-5-014: `src/app/share/[token]/page.tsx:127` [LOW] "Download PDF" button is a duplicate of the "Print" button — both call `window.print()`**
Two separate buttons labeled "Print" and "Download PDF" both call `handlePrint` which is `window.print()`. A user clicking "Download PDF" expects a file download, not a browser print dialog. Previously flagged (BUG-A8-5-027), still unresolved.
- Fix: Rename one button to "Print / Save as PDF" or wire the "Download PDF" button to the `/api/share/${token}/export?format=pdf` endpoint.

**BUG-A8-5-015: `src/app/share/[token]/page.tsx` [LOW] Share page has no token expiry display or warning**
The share page fetches the project and renders data, but never displays when the share link was created, when it expires, or whether the link has been revoked. Users sharing a link have no way to know from the recipient side whether the link is time-limited.
- Fix: Include `expiresAt` in the `/api/share/[token]` response and display it in the UI if present.

---

### `src/app/print/page.tsx`

✅ CLEAN (security): BUG-A8-005 (BroadcastChannel + localStorage fallback), BUG-A8-014 (Suspense error boundary), and BUG-A8-4-005 (canvas dims reactive state) are all confirmed fixed.

**BUG-A8-5-016: `src/app/print/page.tsx:104` [MEDIUM] BroadcastChannel `print-state` message handler validates `ev.data.type` and `ev.data.state` but does not validate the shape of `state` before calling `applyStoreState`**
`applyStoreState` receives `ev.data.state` and wraps `classifications` / `polygons` in `Array.isArray()` guards, which is good. However, individual items within those arrays are cast directly (`as Classification[]`, `as Polygon[]`) with no field validation. A malformed polygon with missing `points` or `classificationId` fields will cause downstream errors in `quantityRows` computation without a useful error message.
- Fix: Add minimum field validation (e.g., check that each polygon has `id`, `points`, `classificationId`, and `pageNumber`) before calling `setState`.

**BUG-A8-5-017: `src/app/print/page.tsx:176` [LOW] `pdfjsLib.GlobalWorkerOptions.workerSrc` set to CDN URL at render time — CSP `worker-src` must include `cdn.jsdelivr.net`**
The print page sets the pdf.js worker to `https://cdn.jsdelivr.net/npm/pdfjs-dist@.../build/pdf.worker.min.mjs`. The app-level CSP in `next.config.ts` has `worker-src blob: 'self' https://cdn.jsdelivr.net` which covers this. However, the print page is a separate `window.open` context and inherits the same CSP — this is currently correct but is fragile if the CSP is ever tightened. Worth noting as a dependency.
- Note: No fix needed unless CSP changes; document the dependency.

**BUG-A8-5-018: `src/app/print/page.tsx` [LOW] Auto-print fires 500ms after PDF render with `hasPrinted` ref guard, but if the window is hidden (e.g., user switched tabs), the print dialog may not appear**
`setTimeout(() => window.print(), 500)` fires unconditionally. If the user opened the print window but switched to another tab, some browsers suppress the print dialog silently.
- Fix: Check `document.visibilityState` before calling `window.print()`; if hidden, add a visible "Print" button and skip the auto-print.

---

### `next.config.ts`

**BUG-A8-5-019: `next.config.ts:35` [MEDIUM] `unsafe-inline` in `script-src` is present in production — weakens XSS protection**
The CSP includes `'unsafe-inline'` in `script-src` unconditionally (not gated to dev-only like `unsafe-eval`). Comment says it's for "pdf.js inline worker init". This permits execution of any inline `<script>` block, defeating CSP's primary XSS mitigation.
- Fix: Generate a per-request nonce in Next.js middleware and use `'nonce-<value>'` instead of `'unsafe-inline'` in `script-src`. The nonce must be threaded through to the pdf.js initialization script.

~~**BUG-A8-5-020: `next.config.ts` [LOW] No `frame-ancestors` directive in CSP**~~ — **UPDATED (commit 8fe227a, 2026-03-20 14:23)**

`X-Frame-Options: DENY` was removed and `frame-ancestors 'self'` was added to CSP to allow the OpenClaw sandbox iframe to load the app. This resolves the original clickjacking concern by using the more precise CSP directive. **New concern introduced:**

**BUG-A8-5-020b: `next.config.ts` [LOW] `frame-ancestors 'self'` allows same-origin framing — expands attack surface vs prior `DENY`**
`frame-ancestors 'self'` permits any page served from the same origin (e.g., `https://app.measurex.io/some-path`) to embed the app in an iframe. If the app ever hosts user-controlled HTML content at the same origin (e.g., a static file upload endpoint or an open redirect), a same-origin clickjacking attack becomes possible. The prior `X-Frame-Options: DENY` was stricter.
- Status: Intentional trade-off for OpenClaw sandbox compatibility. Document the requirement.
- Mitigation: If user-controlled HTML is ever served from the same origin, revisit and tighten to specific allowed origins via `frame-ancestors https://sandbox.openclaw.ai`.

**BUG-A8-5-021: `next.config.ts` [LOW] `turbopack: {}` in config but `package.json` build script uses `--webpack`**
`next build --webpack` forces webpack, overriding the `turbopack: {}` config. Turbopack is only active in dev. Previously flagged (BUG-A8-5-032), still unresolved.
- Fix: Remove `--webpack` from the build script.

✅ CLEAN: `connect-src` is correctly narrowed to specific Supabase URLs and project WebSocket host (BUG-A8-003 fix confirmed). `blob:` removed from `script-src-elem` (BUG-A8-010 fix confirmed). `unsafe-eval` is dev-only (R-A8-007 fix confirmed). HSTS header present (R-A8-011 fix confirmed).

---

### `public/sw.js`

**BUG-A8-5-022: `public/sw.js` (generated) [MEDIUM] Service worker caches `GET /api/projects` responses for 24 hours — stale data shown after project deletion or ownership transfer**
The runtime caching rule `matcher: ({url: e}) => /^\/api\/projects/.test(e.pathname)` with `NetworkFirst` strategy and `maxAgeSeconds: 86400` (24h) means deleted or transferred projects may continue appearing in the projects list for up to 24 hours when offline or on slow networks. `maxEntries: 20` is also very low for production use.
- Fix: Reduce `maxAgeSeconds` to 300 (5 min) for API project responses, or invalidate the cache key on project mutation events via the service worker's `message` handler.

**BUG-A8-5-023: `public/sw.js` (generated) [MEDIUM] PDF files are cached with `CacheFirst` strategy and no expiry — stale PDFs served indefinitely after re-upload**
The rule `matcher: ({url: e}) => /\.pdf$/.test(e.pathname)` uses `CacheFirst` with no `maxAgeSeconds` limit. If a user uploads a revised PDF for the same project, the old PDF is served from cache forever. The cache entry is never invalidated.
- Fix: Add `maxAgeSeconds: 3600` (1 hour) and `maxEntries: 10` to the PDF cache rule, or switch to `NetworkFirst` for PDF files so re-uploads are reflected immediately.

**BUG-A8-5-024: `public/sw.js` (generated) [LOW] `skipWaiting: false` means updated service worker waits for all tabs to close — users on slow connections may run stale SW version for hours**
`skipWaiting: false` is the safer default (avoids mid-session SW updates breaking in-flight requests), but it means that after a deploy, users with open tabs will continue running the old service worker until all MeasureX tabs are closed. In practice, active users may never see the update.
- Fix: Consider adding a "Update available — reload to get the latest version" banner in the app that calls `postMessage({ type: 'SKIP_WAITING' })` to the waiting SW and then reloads. The message listener (`self.addEventListener("message", e => { "SKIP_WAITING" === e.data && self.skipWaiting() })`) is already in the generated SW.

---

### `public/manifest.json` + icons

**BUG-A8-5-025: `public/manifest.json` [LOW] Both icons use `"purpose": "any maskable"` — should be split into separate `"any"` and `"maskable"` entries**
The Web App Manifest spec recommends separate entries for `"purpose": "any"` and `"purpose": "maskable"` rather than combining them in a single string. Combining means the same icon is used for both purposes; maskable icons require a "safe zone" (inner 80% of the icon) to avoid cropping in adaptive icon contexts. If the icons are not designed with this safe zone, they will appear clipped on Android.
- Fix: Verify icons have a safe zone design, then split into two entries per icon:
  ```json
  { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" }
  ```

**BUG-A8-5-026: `public/manifest.json` [LOW] Missing `screenshots` field — reduces PWA installability score on Chromium browsers**
Chrome's PWA install criteria recommend `screenshots` for enhanced install UI. Without this field, the install prompt is minimal and may not meet future installability requirements.
- Fix: Add at least one screenshot entry pointing to a `/screenshots/` directory.

✅ CLEAN: `manifest.json` has `id`, `start_url`, `scope`, `display: standalone`, `orientation`, `lang`, `categories`, `background_color`, `theme_color`, and both icon sizes (192, 512). Icons are present at `public/icon-192.png` and `public/icon-512.png`.

---

### `vercel.json`

**BUG-A8-5-027: `vercel.json:5` [MEDIUM] `maxDuration: 300` on `/api/ws` SSE endpoint is misleading — Vercel Serverless cap is 60s on Pro, 10s on hobby**
5-minute timeout is only honored on Enterprise plans. SSE connections will silently disconnect after the plan limit. Clients using the SSE connection have no reconnect logic.
- Fix: Document the Vercel plan requirement in a comment; add client-side reconnect with exponential backoff in `src/lib/ws-client.ts`; or migrate SSE to a separate long-running service. Previously flagged (BUG-A8-5-024), still unresolved.

**BUG-A8-5-028: `vercel.json` [LOW] `regions: ["iad1", "sfo1"]` multi-region deployment without a database connection pool configured — each region opens direct connections to Supabase**
Deploying to two Vercel regions (US East + US West) without a PgBouncer or Supabase connection pooler means each serverless invocation opens a direct Postgres connection. Under load, this will exhaust Supabase's connection limit (default 60 for free tier, 200 for Pro).
- Fix: Enable Supabase's built-in connection pooler (Transaction mode) and update `NEXT_PUBLIC_SUPABASE_URL` to point to the pooler endpoint; or reduce to a single region.

✅ CLEAN: `NEXT_TELEMETRY_DISABLED: "1"` is set. `X-Content-Type-Options: nosniff` applied to all `/api/(.*)` routes. Function timeouts for AI, upload, chat, and share export routes are appropriate.

---

### `supabase/migrations/` — All 24 Files

**BUG-A8-5-029: `supabase/migrations/024_fix_seed_created_by.sql` [MEDIUM] Migration is not idempotent — no `_migrations` tracking INSERT and no safety guard**
Migration `024_fix_seed_created_by.sql` contains only:
```sql
UPDATE mx_classification_library
  SET created_by = '00000000-0000-0000-0000-000000000000'
  WHERE is_org = true AND created_by IS NULL;
```
It has no `INSERT INTO _migrations` record and no idempotency guard. If the migration runner re-applies it (e.g., after a rollback), the UPDATE runs again harmlessly, but the migration won't be tracked and may be applied twice if the runner uses `_migrations` table to decide what to run.
- Fix: Add `INSERT INTO _migrations (name) VALUES ('024_fix_seed_created_by.sql') ON CONFLICT (name) DO NOTHING;` at the end.

**BUG-A8-5-030: `supabase/migrations/` [MEDIUM] Duplicate migration number conflict: `006_estimates.sql` and `006_mx_formula_fields.sql` both use prefix `006_`**
Two migrations share the `006` prefix. If the migration runner sorts by filename, one of the two will be applied before the other in a non-deterministic order (depending on OS sort order for the second character). If it uses a numbering scheme to determine order, both will collide.
- Fix: Rename one of them (e.g., `006_estimates.sql` → `006a_estimates.sql` or renumber to `006b_`) and update the `_migrations` record name accordingly.

**BUG-A8-5-031: `supabase/migrations/013_classification_library.sql` and `013_mx_pages_text.sql` [MEDIUM] Duplicate migration number conflict: both use prefix `013_`**
Same issue as BUG-A8-5-030 — two migrations share the `013` prefix.
- Fix: Renumber one (e.g., `013b_mx_pages_text.sql`).

**BUG-A8-5-032: `supabase/migrations/022_rls_owner_scoped.sql` [MEDIUM] `DROP POLICY IF EXISTS "Allow all"` is applied per-table, but `009_complete_schema.sql` may have created policies with slightly different names on some tables — silent partial drop**
`009_complete_schema.sql` creates policies named `"Allow all"` (lines 188–216). Migration 022 drops `IF EXISTS "Allow all"` on each table. If any policy was renamed or created with a different name in an intermediate migration, the drop silently does nothing and the old permissive policy remains. No verification that the drop succeeded.
- Fix: After each `DROP POLICY`, add a guard: `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mx_projects' AND policyname != 'projects_select' ...) THEN RAISE EXCEPTION 'Residual permissive policy detected'; END IF; END $$;`

**BUG-A8-5-033: `supabase/migrations/010_share_tokens.sql` and `012_share_token.sql` [LOW] Redundant duplicate migrations — 012 is a verbatim copy of 010**
`012_share_token.sql` explicitly notes it is a "re-application" of 010. Both use `ADD COLUMN IF NOT EXISTS` and `CREATE UNIQUE INDEX IF NOT EXISTS`, so re-running is safe. However, 012 does not insert into `_migrations`, meaning it will be re-applied on every migration run if the runner checks that table.
- Fix: Add `INSERT INTO _migrations (name) VALUES ('012_share_token.sql') ON CONFLICT (name) DO NOTHING;` to 012, or delete 012 entirely since 010 is idempotent.

**BUG-A8-5-034: `supabase/migrations/009_complete_schema.sql` [LOW] Schema defines `mx_projects` without `owner_id` — migration 021 adds it later, but 009 as a "self-contained" migration would still create a schema without the column**
Migration 009 claims to be "self-contained if run on a fresh database" but creates `mx_projects` without `owner_id`. Running 009 in isolation would require 021 to be applied afterwards; the comment is misleading.
- Fix: Update the comment in 009 to note the dependency on 021, or add `owner_id` to the 009 `CREATE TABLE IF NOT EXISTS` definition (it will be skipped if the column already exists when 021 runs).

✅ CLEAN migrations (idempotent, tracked, correct):
- `000_bootstrap.sql` — R-A8-001 RCE fix confirmed in place ✅
- `001_mx_tables.sql` — standard table creation with IF NOT EXISTS ✅
- `002_mx_history.sql` through `008_performance_indexes.sql` — all idempotent ✅
- `021_add_owner_id_to_projects.sql` — R-A8-003 fix, idempotent ✅
- `022_rls_owner_scoped.sql` — R-A8-002 fix, complete coverage of all 8 tables ✅
- `023_security_hardening.sql` — BUG-A8-4-012/013/014 fixes, storage RLS ✅
- `020_mx_scales_add_cm_unit.sql` — idempotent unit constraint update ✅

---

## Summary

| Severity  | Count | Notes |
|-----------|-------|-------|
| CRITICAL  | 0     | All critical RCE/RLS issues from Cycles 1–4 confirmed fixed |
| HIGH      | 2     | API key in localStorage; projectId from localStorage unvalidated |
| MEDIUM    | 10    | CSP unsafe-inline, SW cache TTLs, migration numbering conflicts, API key persistence, BroadcastChannel validation |
| LOW       | 12    | UX bugs, print auto-trigger, manifest icons, Vercel multi-region, duplicate migrations |
| **Total** | **24** | |

> **Post-report update (commit 8fe227a, 2026-03-20 14:23):** `X-Frame-Options: DENY` removed; `frame-ancestors 'self'` added to CSP. BUG-A8-5-020 original issue resolved; BUG-A8-5-020b documents the new limited attack surface introduced by this change (LOW, intentional trade-off).

### Regressions from Cycle 4
None detected. All critical RLS/RCE fixes (021–023 migrations, `_exec_sql` REVOKE, storage RLS) are confirmed landed correctly.

### Top Priorities for Cycle 6

1. **BUG-A8-5-010** — OpenAI API key in localStorage (HIGH, credential exposure)
2. **BUG-A8-5-019** — `unsafe-inline` in production CSP `script-src` (MEDIUM, XSS mitigation gap)
3. **BUG-A8-5-022** — Service worker caches API project list for 24h (MEDIUM, stale data)
4. **BUG-A8-5-023** — PDF files cached indefinitely with CacheFirst (MEDIUM, stale PDF after re-upload)
5. **BUG-A8-5-029** — Migration 024 not tracked in `_migrations` table (MEDIUM, idempotency)
6. **BUG-A8-5-030/031** — Duplicate migration number prefixes 006 and 013 (MEDIUM, ordering risk)
7. **BUG-A8-5-032** — Silent partial policy drop in 022 if policy names differ (MEDIUM, RLS integrity)
