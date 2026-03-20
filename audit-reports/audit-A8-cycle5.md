# Cycle 5 Audit — A8 — Pages + Infra + Config
**Date:** 2026-03-20
**Auditor:** Claude Code (automated)
**Scope:** src/app pages, next.config.ts, public/, vercel.json, supabase/migrations/
**Files audited:**
- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/projects/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/share/[token]/page.tsx`
- `src/app/print/page.tsx`
- `next.config.ts`
- `public/sw.js` (generated from `src/sw.ts`)
- `public/manifest.json` + icons
- `vercel.json`
- `supabase/migrations/` (all 25 files, 000–024)

---

## Regression Check — Cycle 4 RLS/RCE Fixes

All critical fixes from Cycles 1–4 were verified against current source:

### VERIFIED FIXED: R-A8-001 — `_exec_sql` PUBLIC EXECUTE revoked
`supabase/migrations/000_bootstrap.sql` includes `REVOKE EXECUTE ON FUNCTION _exec_sql(text) FROM PUBLIC` and restricts to `service_role`. **CONFIRMED FIXED.**

### VERIFIED FIXED: R-A8-002 — RLS policies `USING (true)` replaced
`022_rls_owner_scoped.sql` drops all "Allow all" policies on all 8 core tables and replaces with `owner_id = auth.uid()` checks. **CONFIRMED FIXED.**

### VERIFIED FIXED: R-A8-003 — `owner_id` column added to `mx_projects`
`021_add_owner_id_to_projects.sql` adds `owner_id UUID REFERENCES auth.users(id)` with index. **CONFIRMED FIXED.**

### VERIFIED FIXED: BUG-A8-4-012 — anon SELECT on `mx_classification_library` revoked
`023_security_hardening.sql` includes `REVOKE SELECT ON mx_classification_library FROM anon`. **CONFIRMED FIXED.**

### VERIFIED FIXED: BUG-A8-4-013 — `is_org` promotion locked to service_role
Policy enforces `is_org = false OR auth.role() = 'service_role'` on UPDATE. **CONFIRMED FIXED.**

### VERIFIED FIXED: BUG-A8-4-014 — Storage RLS for `pdfs` bucket
Three policies (INSERT/SELECT/DELETE) added in 023, scoped by `owner_id`. **CONFIRMED FIXED.**

### VERIFIED FIXED: BUG-A8-008 — mx_groups permissive RLS replaced
`018_mx_groups_rls_fix.sql` replaces all permissive policies with owner-scoped checks. **CONFIRMED FIXED.**

### VERIFIED FIXED: BUG-A8-009 — anon write access to mx_assemblies revoked
`019_assemblies_anon_grant_fix.sql` revokes INSERT/UPDATE/DELETE from anon. **CONFIRMED FIXED.**

**No regressions detected from Cycle 4.**

---

## File-by-File Findings

---

### `src/app/layout.tsx`

CLEAN: No security issues or CSP gaps. Layout correctly renders `ServiceWorkerRegister`, `PWAInstallBanner`, `OfflineBanner`, `KeyboardShortcutsPortal`, `PerfMonitor`, `OfflineIndicator`. `DevPerfOverlayLoader` gated to `NODE_ENV === 'development'`. Skip-to-content link present for accessibility. OpenGraph metadata complete.

**BUG-A8-5-037:** `src/app/layout.tsx:35` [MEDIUM] **OG image references non-existent file `og-image.png`**
Metadata defines `images: [{ url: "https://app.measurex.io/og-image.png" }]` but no `og-image.png` exists in `public/`. Social media link previews will show a broken image or no preview at all. The hardcoded `app.measurex.io` URL also means the OG image won't work in other environments (staging, localhost).
- Fix: Create `public/og-image.png` (1200x630) and reference it with a relative path or use `metadataBase`.

---

### `src/app/page.tsx`

**BUG-A8-5-001:** `src/app/page.tsx:548` [HIGH] **Project hydration reads `projectId` from `localStorage` without UUID validation**
`localStorage.getItem('measurex_project_id')` is trusted as a valid project UUID. A non-UUID value causes a 500 error from the API, leaking error details. Under XSS, an attacker could force hydration of an arbitrary project ID.
- Fix: Validate against UUID regex before calling `hydrateProject()`.

**BUG-A8-5-002:** `src/app/page.tsx:1191–1208` [MEDIUM] **`onFileChange` validates PDF only by MIME type — client-controlled, not verified against file bytes**
Browser-supplied `file.type === 'application/pdf'` is based on file extension. A renamed HTML file will pass this check.
- Fix: Read first 5 bytes and verify `%PDF-` magic bytes.

**BUG-A8-5-003:** `src/app/page.tsx:820` [MEDIUM] **AI takeoff `a` key fires without debounce — race window allows concurrent requests**
Although `aiLoading` is checked, there's a brief window between keypress and state update where repeated rapid presses queue concurrent `/api/ai-takeoff` requests.
- Fix: Use a `useRef` flag for re-entry prevention.

**BUG-A8-5-004:** `src/app/page.tsx:1060` [LOW] **`window.history.replaceState` called with empty title string (deprecated) and without checking if URL already matches**
Causes unnecessary history mutations and triggers browser deprecation warnings.
- Fix: Check `window.location.search` before replacing; use `null` for title.

**BUG-A8-5-005:** `src/app/page.tsx` [LOW] **`installMeasurexAPI()` called on mount with no cleanup — stale closures on remount**
`useEffect(() => { installMeasurexAPI(); }, [])` installs globals on `window.measurex` with no cleanup.
- Fix: Return cleanup function that removes `window.measurex`.

**BUG-A8-5-006:** `src/app/page.tsx:855` [LOW] **Number keys 1–7 for page navigation hardcoded — no feedback for pages 8+**
Only digits 1–7 navigate pages. Projects with >7 pages have no keyboard shortcut for higher pages.
- Fix: Handle all digits dynamically up to `totalPages`.

---

### `src/app/projects/page.tsx`

**BUG-A8-5-007:** `src/app/projects/page.tsx:237` [MEDIUM] **Duplicate project name check races against stale local cache**
The BUG-R5-005 fix checks duplicates against the locally cached `projects` array (fetched once on mount). A project created in another tab between page load and create-click bypasses the check.
- Fix: Re-fetch project list before the duplicate check, or add server-side uniqueness constraint on `(owner_id, name)`.

**BUG-A8-5-008:** `src/app/projects/page.tsx` [MEDIUM] **Star/folder/tag state stored only in `localStorage` — lost on data clear, not per-user**
Starred projects, folder assignments, and tags are persisted exclusively to `localStorage`. Not synced, not per-user, silently lost on incognito or storage clear.
- Fix: Persist to a `mx_user_preferences` table or user-settings API.

**BUG-A8-5-009:** `src/app/projects/page.tsx:464` [LOW] **`handlePageDrop` useCallback missing `handlePdfUpload` in deps**
`handlePageDrop` is defined with `useCallback([], [])` but references `handlePdfUpload` which is not in the dependency array.
- Fix: Wrap `handlePdfUpload` in `useCallback` and add to deps.

---

### `src/app/settings/page.tsx`

**BUG-A8-5-010:** `src/app/settings/page.tsx:534` [HIGH] **OpenAI API key persisted in plaintext to `localStorage` via `saveAiSettings()`**
`updateAi({ openaiApiKey: e.target.value })` stores the full API key in `localStorage`. Any JavaScript on the same origin (including future XSS) can read it. The key is never cleared on logout.
- Fix: Store to `sessionStorage` (clears on tab close), or use a one-time-copy flow. Minimum: clear `localStorage.removeItem('mx-ai-settings')` on sign-out.

**BUG-A8-5-011:** `src/app/settings/page.tsx:155` [MEDIUM] **`apiKeys` state initialized from `useState([])` with no `localStorage` persistence — keys lost on reload**
User-added API keys are stored only in React state. Refreshing the page loses all added keys.
- Fix: Persist `apiKeys` to `localStorage` with full key shown only once on creation.

**BUG-A8-5-012:** `src/app/settings/page.tsx:254` [LOW] **Avatar initials hardcoded to "NS" — not derived from `name` state**
The avatar always shows "NS" regardless of user's name.
- Fix: `name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'ME'`.

**BUG-A8-5-013:** `src/app/settings/page.tsx:280` [LOW] **"Change Email" button has no `onClick` handler — clicking does nothing**
- Fix: Wire to `supabase.auth.updateUser({ email: newEmail })` flow.

---

### `src/app/share/[token]/page.tsx`

CLEAN (security): BUG-A8-001 (global store contamination), BUG-A8-002 (unchecked response body), BUG-A8-4-001 (opener leakage), BUG-A8-030 (date hydration mismatch) all confirmed fixed. Share view uses isolated local state.

**BUG-A8-5-014:** `src/app/share/[token]/page.tsx:550–561` [LOW] **"Download PDF" button duplicates "Print" — both call `window.print()`**
Users expect "Download PDF" to produce a file download, not a print dialog.
- Fix: Wire "Download PDF" to `/api/share/${token}/export?format=pdf`.

**BUG-A8-5-015:** `src/app/share/[token]/page.tsx` [LOW] **Share page shows no expiry information or warning**
The share page never displays when the link expires or was created.
- Fix: Include `expiresAt` in the `/api/share/[token]` response and display it.

**BUG-A8-5-044:** `src/app/share/[token]/page.tsx:563,658` [LOW] **"Open in MeasureX" links expose internal project UUID to unauthenticated viewers**
`href={/?project=${project.id}}` renders the internal UUID in visible links. With owner-scoped RLS the UUID alone doesn't grant access, but it leaks internal identifiers to anyone with the share link.
- Fix: Remove or gate "Open in MeasureX" behind auth check; or use share token in the link.

**BUG-A8-5-045:** `src/app/share/[token]/page.tsx:127` [LOW] **Excel export fetch uses unencoded token, inconsistent with JSON/PDF path**
Line 127: `fetch(/api/share/${token}/export?format=excel)` — no `encodeURIComponent(token)`. Line 124 uses `encodeURIComponent(token)` for JSON/PDF. Token is UUID so safe in practice, but inconsistent.
- Fix: Use `encodeURIComponent(token)` consistently in all export paths.

---

### `src/app/api/share/[token]/export/route.ts`

**BUG-A8-5-035:** `src/app/api/share/[token]/export/route.ts` [HIGH] **Export route does NOT check token expiry — bypasses share link expiration**
The main share route (`/api/share/[token]/route.ts:38-42`) checks `expiresAt` and returns 410 Gone if expired. The export route (`/api/share/[token]/export/route.ts`) performs NO expiry check. An expired share link still allows data export via the export endpoint, completely bypassing the expiry mechanism.
- Fix: Add the same expiry check:
  ```typescript
  const expiresAt = (project as any).expiresAt;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
  }
  ```

**BUG-A8-5-036:** `src/app/api/share/[token]/export/route.ts` [MEDIUM] **Export route has no rate limiting — unbounded export requests possible**
The main share route uses `rateLimitResponse(_req, 30, 60_000)`. The export route has no rate limiting at all. An attacker could repeatedly hit the export endpoint to generate Excel/PDF files, consuming server resources.
- Fix: Add `rateLimitResponse(_req, 10, 60_000)` at the top of the GET handler.

---

### `src/app/print/page.tsx`

CLEAN (security): BUG-A8-005, BUG-A8-014, BUG-A8-4-005 all confirmed fixed.

**BUG-A8-5-016:** `src/app/print/page.tsx:134` [MEDIUM] **BroadcastChannel `print-state` data cast without field validation**
`ev.data.state` items are cast directly as `Classification[]` / `Polygon[]` with no field validation. Malformed data (missing `points` or `classificationId`) causes downstream errors without useful messages.
- Fix: Validate minimum required fields on each polygon/classification before `setState`.

**BUG-A8-5-017:** `src/app/print/page.tsx:180` [LOW] **pdf.js worker URL points to CDN — dependency on CSP `worker-src` including `cdn.jsdelivr.net`**
Currently correct (`worker-src blob: 'self' https://cdn.jsdelivr.net` in CSP). Fragile if CSP is tightened.
- Note: Document the dependency; no fix needed unless CSP changes.

**BUG-A8-5-018:** `src/app/print/page.tsx:218` [LOW] **Auto-print fires unconditionally even if tab is hidden**
`setTimeout(() => window.print(), 500)` — some browsers suppress the print dialog when the tab is not visible.
- Fix: Check `document.visibilityState` before calling `window.print()`.

---

### `next.config.ts`

**BUG-A8-5-019:** `next.config.ts:35` [MEDIUM] **`'unsafe-inline'` in `script-src` present in production — weakens XSS protection**
Comment says it's for "pdf.js inline worker init". This permits execution of any inline `<script>`, defeating CSP's primary XSS mitigation.
- Fix: Use per-request nonce (`'nonce-<value>'`) via Next.js middleware instead of `'unsafe-inline'`.

**BUG-A8-5-020b:** `next.config.ts:53` [LOW] **`frame-ancestors 'self'` expands attack surface vs prior `X-Frame-Options: DENY`**
Intentional trade-off for OpenClaw sandbox compatibility. If user-controlled HTML is ever served from the same origin, same-origin clickjacking becomes possible.
- Status: Intentional. Document the requirement. Tighten to specific allowed origins if needed.

**BUG-A8-5-021:** `next.config.ts` [LOW] **`turbopack: {}` in config but build uses `--webpack`**
`next build --webpack` forces webpack, making the turbopack config dead code.
- Fix: Remove `--webpack` from build script.

**BUG-A8-5-038:** `next.config.ts:43` [MEDIUM] **`NEXT_PUBLIC_APP_HOST` fallback to `localhost:3000` in production CSP `connect-src`**
If `NEXT_PUBLIC_APP_HOST` env var is not set, the CSP header in production reads `wss://localhost:3000`, which:
1. Whitelists WebSocket connections to localhost on every user's machine (minor security issue)
2. Causes real WebSocket connections to the production host to be blocked by CSP
This is a silent deployment failure — the app appears to work but real-time collaboration silently breaks.
- Fix: Throw at build time if `NEXT_PUBLIC_APP_HOST` is not set in production, or default to the deployment hostname.

**BUG-A8-5-046:** `next.config.ts` / `src/lib/supabase.ts` [MEDIUM] **No build-time validation of required `NEXT_PUBLIC_` env vars**
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required for the app to function. `src/lib/supabase.ts` throws at runtime if missing, but there is no build-time check. The app compiles and deploys successfully without these vars; failures only appear when users interact with Supabase features.
- Fix: Add env validation in `next.config.ts` (e.g., throw during `headers()` if required vars are missing in production).

CLEAN: `connect-src` narrowed correctly (BUG-A8-003 fix). `blob:` removed from `script-src-elem` (BUG-A8-010 fix). `unsafe-eval` dev-only (R-A8-007 fix). HSTS present (R-A8-011 fix).

---

### `public/sw.js` (generated from `src/sw.ts`)

**BUG-A8-5-022:** `src/sw.ts:60–69` [MEDIUM] **Service worker caches `/api/projects` for 24 hours — stale data after project deletion**
`NetworkFirst` strategy with `maxAgeSeconds: 86400` (24h) and `maxEntries: 20`. Deleted or transferred projects appear in the list for up to 24h when offline or on slow networks.
- Fix: Reduce `maxAgeSeconds` to 300 (5 min), or invalidate on project mutation via `message` handler.

**BUG-A8-5-023:** `src/sw.ts:46–49` [MEDIUM] **PDF files cached with `CacheFirst` and no expiry — stale PDFs after re-upload**
PDF cache rule uses `CacheFirst` with no `maxAgeSeconds` or `maxEntries`. Re-uploaded PDFs are never reflected in the cache.
- Fix: Add `maxAgeSeconds: 3600` and `maxEntries: 10`, or switch to `NetworkFirst`.

**BUG-A8-5-024:** `src/sw.ts:30` [LOW] **`skipWaiting: false` means stale SW persists until all tabs close**
Users with open tabs run the old service worker indefinitely after a deploy. The `SKIP_WAITING` message listener is already wired up but the app has no UI to trigger it.
- Fix: Add an "Update available — reload" banner that calls `postMessage('SKIP_WAITING')`.

---

### `public/manifest.json` + Icons

**BUG-A8-5-025:** `public/manifest.json:15` [LOW] **Both icons use `"purpose": "any maskable"` — should be separate entries**
Spec recommends separate `"any"` and `"maskable"` entries. Combined means the icon must have an 80% safe zone or it will be cropped on Android.
- Fix: Split into two entries per icon size.

**BUG-A8-5-026:** `public/manifest.json` [LOW] **Missing `screenshots` field — reduces PWA installability score**
Chrome recommends `screenshots` for enhanced install UI.
- Fix: Add screenshot entries.

**BUG-A8-5-040:** `public/` [LOW] **Missing `favicon.ico` — browsers request this by default**
No `favicon.ico` in `public/`. Browsers will request `/favicon.ico` on every page load, resulting in 404s in server logs.
- Fix: Generate `favicon.ico` from `icon-192.png`.

**BUG-A8-5-041:** `public/` [LOW] **Missing `apple-touch-icon.png` — iOS PWA installs lack proper icon**
No `apple-touch-icon.png` (180x180) in `public/`. iOS Safari's "Add to Home Screen" will use a generic placeholder or screenshot.
- Fix: Add `public/apple-touch-icon.png` (180x180) and reference in `layout.tsx` metadata.

CLEAN: `manifest.json` has `id`, `start_url`, `scope`, `display: standalone`, `orientation`, `lang`, `categories`, `background_color`, `theme_color`, and both icon sizes (192, 512). Icons are present at `public/icon-192.png` and `public/icon-512.png`.

---

### `vercel.json`

**BUG-A8-5-027:** `vercel.json:9` [MEDIUM] **`maxDuration: 300` on `/api/ws` requires Enterprise plan — silently ignored on lower plans**
Vercel Serverless caps at 60s (Pro) / 10s (Hobby). SSE connections disconnect silently after the plan limit with no client-side reconnect.
- Fix: Document plan requirement; add client-side reconnect with exponential backoff.

**BUG-A8-5-028:** `vercel.json:6` [LOW] **Multi-region deployment (`iad1`, `sfo1`) without connection pooler**
Each serverless invocation opens a direct Postgres connection. Under load, this exhausts Supabase's connection limit.
- Fix: Enable Supabase connection pooler (Transaction mode) or reduce to single region.

CLEAN: `NEXT_TELEMETRY_DISABLED: "1"` set. `X-Content-Type-Options: nosniff` on `/api/(.*)`. Function timeouts appropriate.

---

### `supabase/migrations/` — All 25 Files

**BUG-A8-5-029:** `supabase/migrations/024_fix_seed_created_by.sql` [MEDIUM] **Migration not tracked — no `_migrations` INSERT**
Has no `INSERT INTO _migrations` at end. Will be re-applied on every migration run if the runner uses `_migrations` to decide what to run.
- Fix: Add `INSERT INTO _migrations (name) VALUES ('024_fix_seed_created_by.sql') ON CONFLICT (name) DO NOTHING;`

**BUG-A8-5-030:** `supabase/migrations/` [MEDIUM] **Duplicate migration prefix `006_`: `006_estimates.sql` and `006_mx_formula_fields.sql`**
Non-deterministic application order depending on filesystem sort.
- Fix: Renumber one (e.g., `006a_estimates.sql`).

**BUG-A8-5-031:** `supabase/migrations/` [MEDIUM] **Duplicate migration prefix `013_`: `013_classification_library.sql` and `013_mx_pages_text.sql`**
Same prefix collision.
- Fix: Renumber one (e.g., `013b_mx_pages_text.sql`).

**BUG-A8-5-032:** `supabase/migrations/022_rls_owner_scoped.sql` [MEDIUM] **`DROP POLICY IF EXISTS "Allow all"` — silent no-op if policy was renamed**
If any policy was created with a different name in an intermediate migration, the drop silently does nothing and the old permissive policy remains.
- Fix: Add a guard after each drop to verify no residual permissive policies exist.

**BUG-A8-5-033:** `supabase/migrations/012_share_token.sql` [LOW] **Redundant duplicate of 010 — no `_migrations` tracking**
Verbatim re-application of 010. Both are idempotent (`IF NOT EXISTS`) but 012 has no migration tracking.
- Fix: Add `_migrations` INSERT, or delete 012.

**BUG-A8-5-034:** `supabase/migrations/009_complete_schema.sql` [LOW] **Claims "self-contained" but creates `mx_projects` without `owner_id`**
Running 009 in isolation produces a schema missing the `owner_id` column required by RLS policies in 022.
- Fix: Update comment to document dependency on 021, or add `owner_id` to the 009 table definition.

**BUG-A8-5-039:** `supabase/migrations/017_mx_groups.sql` [MEDIUM] **Migration not tracked — no `_migrations` INSERT**
Has no `INSERT INTO _migrations` at end. Will be re-applied on every migration run.
- Fix: Add `INSERT INTO _migrations (name) VALUES ('017_mx_groups.sql') ON CONFLICT (name) DO NOTHING;`

**BUG-A8-5-042:** `supabase/migrations/016_assemblies_grants.sql` [LOW] **Migration not tracked — no `_migrations` INSERT**
Has no `INSERT INTO _migrations`. GRANT statements are idempotent so re-running is harmless, but inconsistent with tracking convention.
- Fix: Add `INSERT INTO _migrations (name) VALUES ('016_assemblies_grants.sql') ON CONFLICT (name) DO NOTHING;`

**BUG-A8-5-043:** `supabase/migrations/013_classification_library.sql` [LOW] **Migration not tracked — no `_migrations` INSERT**
Creates `mx_classification_library` table (idempotent `IF NOT EXISTS`) but seed INSERT rows will attempt re-insertion on re-run. Without tracking, the runner may re-apply and fail on duplicate seed data if no conflict clause is present.
- Fix: Add `_migrations` tracking, and add `ON CONFLICT DO NOTHING` to the seed INSERT.

CLEAN migrations (idempotent, tracked, correct):
- `000_bootstrap.sql` — R-A8-001 RCE fix confirmed
- `001_mx_tables.sql` through `008_performance_indexes.sql` — all idempotent
- `010_share_tokens.sql` — idempotent, tracked
- `011_add_formula_columns.sql` — idempotent, tracked
- `018_mx_groups_rls_fix.sql` — owner-scoped policies, tracked
- `019_assemblies_anon_grant_fix.sql` — anon revoke, tracked
- `020_mx_scales_add_cm_unit.sql` — idempotent, tracked
- `021_add_owner_id_to_projects.sql` — owner_id column, tracked
- `022_rls_owner_scoped.sql` — full RLS overhaul, tracked
- `023_security_hardening.sql` — storage RLS + library hardening, tracked

---

## TODO/FIXME Remaining

| # | File | Content |
|---|------|---------|
| 1 | `src/lib/export.ts:2` | `TODO: migrate to exceljs. For now, tree-shake and restrict to server path.` |
| 2 | `src/components/ExportPanel.tsx:6-7` | `TODO: migrate to exceljs or SheetJS Pro.` (xlsx@0.18.x CVE-2023-30533) |
| 3 | `src/components/MarkupTools.tsx:54` | `TODO: BUG-A7-2-017 — wire activeTool/activeColor/strokeWidth to the canvas drawing layer` |

All 3 TODOs are tracked in the bug audit system. No untracked TODOs or FIXMEs found.

---

## Summary

| Severity  | Count | Notes |
|-----------|-------|-------|
| CRITICAL  | 0     | All critical RCE/RLS issues from Cycles 1–4 confirmed fixed |
| HIGH      | 3     | API key in localStorage (010); projectId unvalidated (001); share export bypasses expiry (035) |
| MEDIUM    | 13    | CSP unsafe-inline (019), SW cache TTLs (022,023), migration numbering (030,031), migration tracking (029,039), BroadcastChannel validation (016), export no rate limit (036), OG image missing (037), NEXT_PUBLIC_APP_HOST fallback (038), env validation (046), stale project list race (007), localStorage-only prefs (008), API keys not persisted (011), vercel maxDuration (027), silent policy drop (032) |
| LOW       | 15    | UX bugs (004,005,006,009,012,013,014,015,018,021), manifest icons (025,026), missing assets (040,041), migration tracking (033,034,042,043), frame-ancestors (020b), multi-region (028), SW skipWaiting (024), pdf.js worker CSP (017), share leaks UUID (044), unencoded token (045) |
| **Total** | **31** | |

### New Bugs (not in prior reports)

| Bug ID | Severity | Summary |
|--------|----------|---------|
| BUG-A8-5-035 | HIGH | Share export route bypasses token expiry check |
| BUG-A8-5-036 | MEDIUM | Share export route has no rate limiting |
| BUG-A8-5-037 | MEDIUM | OG image referenced in metadata but file doesn't exist |
| BUG-A8-5-038 | MEDIUM | CSP `connect-src` falls back to `wss://localhost:3000` if env var missing |
| BUG-A8-5-039 | MEDIUM | Migration 017_mx_groups.sql missing `_migrations` tracking |
| BUG-A8-5-040 | LOW | Missing `favicon.ico` in public/ |
| BUG-A8-5-041 | LOW | Missing `apple-touch-icon.png` for iOS PWA |
| BUG-A8-5-042 | LOW | Migration 016_assemblies_grants.sql missing `_migrations` tracking |
| BUG-A8-5-043 | LOW | Migration 013_classification_library.sql missing `_migrations` tracking (seed data may duplicate) |
| BUG-A8-5-044 | LOW | Share page "Open in MeasureX" links expose internal project UUID |
| BUG-A8-5-045 | LOW | Share excel export fetch uses unencoded token (inconsistent) |
| BUG-A8-5-046 | MEDIUM | No build-time validation of required NEXT_PUBLIC_ env vars |

### Top Priorities for Cycle 6

1. **BUG-A8-5-035** — Share export bypasses expiry (HIGH, security — data leaks past intended expiration)
2. **BUG-A8-5-010** — OpenAI API key in localStorage (HIGH, credential exposure)
3. **BUG-A8-5-001** — Unvalidated projectId from localStorage (HIGH, error leak / XSS escalation)
4. **BUG-A8-5-019** — `unsafe-inline` in production CSP `script-src` (MEDIUM, XSS mitigation gap)
5. **BUG-A8-5-038** — CSP `connect-src` defaults to localhost in production (MEDIUM, silent breakage)
6. **BUG-A8-5-046** — No build-time env var validation (MEDIUM, silent deployment failure)
7. **BUG-A8-5-022/023** — Service worker stale cache TTLs (MEDIUM, stale data)
8. **BUG-A8-5-036** — Share export no rate limiting (MEDIUM, DoS vector)
9. **BUG-A8-5-029/039** — Untracked migrations (MEDIUM, idempotency risk)
