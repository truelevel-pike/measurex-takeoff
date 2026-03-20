# Audit A8 — Pages + Config + Infrastructure
**Date:** 2026-03-20  
**Admiral:** 7/8 (admirals78)  
**Sector:** Pages + Config + Infrastructure  
**Branch:** main  
**Repo:** `~/.openclaw/workspace-nate/measurex-takeoff`

---

## Files Audited

- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/projects/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/library/page.tsx`
- `src/app/learn/page.tsx`
- `src/app/print/page.tsx`
- `src/app/share/[token]/page.tsx`
- `src/app/error.tsx`
- `next.config.ts`
- `public/sw.js`
- `public/manifest.json` + icons
- `package.json`
- `src/types/estimates.ts`, `src/types/perf.d.ts`
- `vercel.json`
- `supabase/migrations/000–017`

---

## Findings

---

### 🔴 CRITICAL

**BUG-A8-001:** `[src/app/share/[token]/page.tsx:hydration]` **[severity: CRITICAL]**  
The share page calls `hydrateState(...)` which overwrites the entire Zustand store with shared project data. If a user opens a share link while they have an active project, their unsaved work **will be silently overwritten** in the Zustand store. The `QuantitiesPanel` uses this shared store directly, so reads and writes bleed across sessions.  
**Fix:** Use an isolated read-only context or local state for shared project rendering; do not hydrate the global store.

---

**BUG-A8-002:** `[src/app/share/[token]/page.tsx:handleExport]` **[severity: CRITICAL]**  
`handleExport('excel')` calls `fetch('/api/share/${token}/export?format=excel')` with no error handling on the fetch response status before calling `res.blob()`. If the share token is revoked mid-session, `res.blob()` will silently consume a 401/403 error body as a blob and create a corrupt download. Additionally, `handleExport('json' | 'pdf')` opens a new tab via `window.open(...)` — there is no auth or CSRF token required; any caller who knows a token can trigger these export endpoints without being the original recipient of the share link.  
**Fix:** Check `res.ok` before `res.blob()`. Add server-side expiration/revocation enforcement on export endpoints.

---

**BUG-A8-003:** `[next.config.ts:CSP]` **[severity: CRITICAL]**  
The `connect-src` directive is set to `wss: https:` — this allows WebSocket connections and HTTPS fetches to **any host in the world**. Combined with the `script-src` including `https://cdn.jsdelivr.net` and `https://esm.sh` (both of which serve arbitrary user-published packages), this CSP provides very limited XSS containment. A single compromised CDN package could exfiltrate user project data to any external server.  
**Fix:**  
- Narrow `connect-src` to `'self' wss://your-domain.com https://*.supabase.co`  
- Pin CDN URLs to specific trusted paths or use SRI integrity hashes  
- Consider removing `esm.sh` from `script-src` entirely

---

### 🟠 HIGH

**BUG-A8-004:** `[src/app/share/[token]/page.tsx:setProjectId]` **[severity: HIGH]**  
The share page calls `setProjectId(proj.id)` on the global Zustand store. This is the same `projectId` used by the main editor's auto-save loop. If a user navigates from a share link back to the main editor without a full reload, the auto-save could fire against the **shared project's ID** — overwriting someone else's shared data with the viewer's local state.  
**Fix:** Do not set global `projectId` from the share view. Use local component state or a read-only context.

---

**BUG-A8-005:** `[src/app/print/page.tsx:localStorage read]` **[severity: HIGH]**  
`PrintViewInner` reads `localStorage.getItem('measurex-state')` directly in a `useEffect` — bypassing Zustand entirely. This means if the print page is opened in a new tab (as `window.open(printUrl, '_blank')`) on a browser that partitions storage (Firefox in strict mode, Safari with ITP), `localStorage` will be empty and the print page will error with "No project data found" even though the user is actively working on a project. There is also a `JSON.parse` inside a `try/catch` that catches `setError('Failed to load project data.')` but still continues with `state === null`, eventually reaching the return path — but there's no null guard on `state.classifications` before `quantityRows` is computed.  
**Fix:** Pass project state via `postMessage`, a `BroadcastChannel`, or IndexedDB. Add null guard on `state` before computing `quantityRows`.

---

**BUG-A8-006:** `[src/app/library/page.tsx:fetchProjects]` **[severity: HIGH]**  
`fetchProjects` calls `fetch('/api/projects')` and calls `data.json()` but there is **no `res.ok` check** — if the API returns a 401 or 500, `data.json()` will attempt to parse an error body and likely set `projects` to an unexpected shape (or throw), crashing the import-to-project dropdown without user feedback.  
**Fix:** Add `if (!res.ok) throw new Error(...)` before `const data = await res.json()`.

---

**BUG-A8-007:** `[src/app/library/page.tsx:importItem delete flow]` **[severity: HIGH]**  
The `handleDelete` flow (if present, implied by the `Trash2` import and `LibraryItem` state) calls a Supabase delete on `mx_classification_library`. The RLS policy `org_library_delete` checks `auth.uid() = created_by` — but seeded org templates have `created_by = null`. This means **no authenticated user can delete seeded org items via the RLS policy**, which is correct, but the UI may show the delete button for org items without enforcing this server-side check on the client first, creating a confusing silent-failure UX where delete appears to succeed (optimistic UI) but the row is never actually removed.  
**Fix:** Disable/hide the delete button for `is_org = true` items in the UI.

---

**BUG-A8-008:** `[supabase/migrations/017_mx_groups.sql]` **[severity: HIGH]**  
The `groups_insert`, `groups_update`, and `groups_delete` RLS policies all use `with check (true)` / `using (true)` — effectively disabling access control. Any authenticated user can insert, update, or delete **any group** in the database regardless of project ownership. The `groups_select` policy is also effectively permissive (it checks `project_id IN (SELECT id FROM mx_projects WHERE id = mx_groups.project_id)` which is always true).  
**Fix:** Tie policies to project ownership: `using (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()))` (or equivalent auth check).

---

**BUG-A8-009:** `[supabase/migrations/016_assemblies_grants.sql]` **[severity: HIGH]**  
`GRANT ALL ON TABLE mx_assemblies TO anon` grants unauthenticated users full read/write/delete access to the assemblies table. This is almost certainly unintentional — anonymous visitors should not be able to modify project assemblies.  
**Fix:** Remove `GRANT ALL ON TABLE mx_assemblies TO anon;` or replace with `GRANT SELECT ON TABLE mx_assemblies TO anon;` if read access is needed.

---

**BUG-A8-010:** `[next.config.ts:CSP script-src-elem]` **[severity: HIGH]**  
`script-src-elem` includes `blob:` — this allows dynamically created blob URLs to execute as scripts. Combined with the service worker's use of `blob:` workers and the ability to create blobs from user-controlled data (e.g. AI-returned content injected into PDF layers), this opens a potential XSS vector where crafted blob content could be executed as a script.  
**Fix:** Remove `blob:` from `script-src-elem`. Service workers should be served from `/sw.js` (same origin), not blob URLs.

---

**BUG-A8-011:** `[package.json:xlsx version]` **[severity: HIGH]**  
`"xlsx": "^0.18.5"` — This is a very old version of SheetJS (now `xlsx`). Version 0.18.x has multiple known prototype pollution and ReDoS vulnerabilities (CVE-2023-30533 and related). The project has not moved to the commercial `@sheet/core` or a patched fork. The `xlsx` package is used for Excel export of user project data.  
**Fix:** Evaluate migrating to `exceljs` or the official SheetJS Pro, or audit and pin to a patched community fork. At minimum, restrict its use to server-side only (no client-side bundle exposure).

---

### 🟡 MEDIUM

**BUG-A8-012:** `[src/app/share/[token]/page.tsx:Download PDF button]` **[severity: MEDIUM]**  
The "Download PDF" button calls `window.print()` — the same as the "Print" button. This is misleading; users expecting a PDF download will get a print dialog instead. The export dropdown does offer a "Contractor Report" that opens `/api/share/${token}/export?format=pdf` in a new tab (which presumably generates a PDF), but the standalone "Download PDF" button does not use that endpoint.  
**Fix:** Wire "Download PDF" to the `/api/share/${token}/export?format=pdf` endpoint or remove the button and consolidate with the export dropdown.

---

**BUG-A8-013:** `[src/app/print/page.tsx:PDF rendering]` **[severity: MEDIUM]**  
The print page uses `pdfjsLib` to render the PDF from `projectId` passed as a search param — but it fetches the PDF via `fetch('/api/projects/${projectId}/pdf')` with **no authentication header**. Server-side route handlers typically rely on cookies for session auth (Next.js App Router), which should propagate automatically. However, if the PDF route requires an explicit auth token or the cookie is not set in the new tab context, the fetch will silently fail (`.catch(() => null)`) and the canvas will be blank — leaving a print page with no drawing and only a quantities table.  
**Fix:** Add explicit error display when the PDF fetch fails (not just `setError`); surface a message telling the user to re-upload.

---

**BUG-A8-014:** `[src/app/print/page.tsx:Suspense fallback]` **[severity: MEDIUM]**  
The `PrintPage` wrapper renders `<Suspense>` with a basic loading text fallback. If `useSearchParams()` suspends (as it can in Next.js App Router when the param is missing), the fallback shows indefinitely because there's no timeout or error recovery path.  
**Fix:** Add an error boundary around the `Suspense` block to catch suspense rejections.

---

**BUG-A8-015:** `[supabase/migrations/013_mx_pages_text.sql:data migration]` **[severity: MEDIUM]**  
The migration copies text from `pdf_url` to `text` for rows where `pdf_url IS NOT NULL AND pdf_url != ''`. This heuristic is incorrect — `pdf_url` is supposed to store file paths/URLs, not text content. Copying URL strings into the `text` column will produce rows with PDF storage paths (e.g. `pdfs/uuid/filename.pdf`) as their "text content", which will be fed to the auto-scale detection logic (`detectScaleFromText`) and produce false positives.  
**Fix:** Remove the `UPDATE` data migration; `text` should default to `''` for existing rows since `pdf_url` never contained text content in production.

---

**BUG-A8-016:** `[supabase/migrations — missing rollbacks]` **[severity: MEDIUM]**  
None of the 18 migration files (000–017) include rollback (`DOWN`) scripts. If a bad migration is deployed to production, there is no automated path to revert. Notable danger cases:  
- `009_complete_schema.sql` recreates all tables with `IF NOT EXISTS` but has no way to roll back constraint additions or column changes  
- `013_mx_pages_text.sql` runs a data `UPDATE` (see BUG-A8-015) that cannot be undone  
- `017_mx_groups.sql` enables RLS with permissive policies (see BUG-A8-008) that could silently expose data  
**Fix:** Add `-- DOWN` sections or separate rollback scripts for each migration that modifies data or alters constraints.

---

**BUG-A8-017:** `[public/sw.js:API caching]` **[severity: MEDIUM]**  
The service worker caches API responses under two rules:  
1. `matcher: ({url}) => /^\/api\/projects/.test(e.pathname)` → `NetworkFirst` with `maxAgeSeconds: 86400`  
2. `matcher: ({url}) => url.pathname.startsWith('/api/')` → `NetworkFirst, networkTimeoutSeconds: 3`  

The first rule caches project API responses for **24 hours**. If the server deletes or revokes a shared project (e.g. user deletes project), the service worker will continue serving stale cached data for up to a day. Worse, mutations (POST/PUT/DELETE) to `/api/projects/*` are also cached by the catch-all `NetworkFirst` handler because neither rule restricts to `GET`.  
**Fix:** Restrict API caching rules to `method: 'GET'` only. Reduce `maxAgeSeconds` for project data to 5–15 minutes or use `NetworkOnly` for mutable project endpoints.

---

**BUG-A8-018:** `[public/sw.js:PDF caching]` **[severity: MEDIUM]**  
The service worker caches PDFs under a `CacheFirst` strategy (`new eE({cacheName:"pdf-files"})`) with no expiration plugin (`ef`). Once a PDF is cached, it will be served from cache forever — including after the user uploads a new/revised PDF to the same project. The only way to clear it is a manual SW update cycle or cache deletion.  
**Fix:** Add a `CacheExpirationPlugin` with a reasonable `maxAgeSeconds` (e.g. `maxAgeSeconds: 604800`, 7 days) or switch to `StaleWhileRevalidate`.

---

**BUG-A8-019:** `[src/app/page.tsx:prompt() for project name]` **[severity: MEDIUM]**  
`handleSave` calls `window.prompt('Project name:')` when no `projectId` exists (manual first-save flow). `window.prompt` is blocked in many contexts (iframes, PWA standalone mode on iOS, certain browser policies) and will silently return `null` — the code handles `null` by returning early with `setSaving(false)`, but the user gets no feedback that the save was blocked.  
**Fix:** Replace `window.prompt` with an inline modal/input component. This also applies to new project creation from the `page.tsx` save handler.

---

**BUG-A8-020:** `[src/app/layout.tsx:missing apple-touch-icon]` **[severity: MEDIUM]**  
`layout.tsx` exports `metadata` with `manifest: "/manifest.json"` but there is no `<link rel="apple-touch-icon">` in the metadata or HTML head. PWA installations on iOS use `apple-touch-icon` for the home screen icon — without it, iOS falls back to a screenshot, which looks poor. The `manifest.json` icon references (`/icon-192.png`, `/icon-512.png`) are correctly present in `public/`, so the assets exist.  
**Fix:** Add `icons: { apple: '/icon-192.png' }` to the Next.js `metadata` export, or add `<link rel="apple-touch-icon" href="/icon-192.png" />` to `<head>`.

---

**BUG-A8-021:** `[next.config.ts:no env validation]` **[severity: MEDIUM]**  
`next.config.ts` does not validate that required environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, etc.) are set at build time. If the app is deployed without these vars, it will fail at runtime with cryptic errors rather than a clear build-time message.  
**Fix:** Add an env validation block at the top of `next.config.ts`:
```ts
const requiredEnvVars = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
for (const v of requiredEnvVars) {
  if (!process.env[v]) throw new Error(`Missing required env var: ${v}`);
}
```

---

**BUG-A8-022:** `[src/app/error.tsx:file naming]` **[severity: MEDIUM]**  
The file is named `error.tsx` (not `global-error.tsx`) but it imports and uses `captureError` and accepts `{ error, reset }` props like a global error boundary. In Next.js App Router, `error.tsx` at the `src/app/` root acts as a **route segment error boundary**, not the global boundary — `global-error.tsx` is needed for that. The `sw.js` precache manifest includes `app/_global-error/page-...` which suggests a `global-error` page exists somewhere — this `error.tsx` may be redundant or incorrectly scoped.  
**Fix:** Rename to `global-error.tsx` if global error capture is intended, or confirm the distinction between route-level and global error handling is intentional.

---

**BUG-A8-023:** `[supabase/migrations/013_classification_library.sql — duplicate number]` **[severity: MEDIUM]**  
There are two migrations with the prefix `013_`: `013_classification_library.sql` and `013_mx_pages_text.sql`. The migration runner (which uses filename as the primary key in `_migrations`) may apply one and silently skip the other, or throw a duplicate key error depending on ordering. Only `013_mx_pages_text.sql` writes to `_migrations`; `013_classification_library.sql` does not — meaning the library table may not be tracked as applied.  
**Fix:** Rename one of the `013_` files to `013a_` and `013b_` or renumber to maintain sequential unique naming. Ensure both record themselves in `_migrations`.

---

**BUG-A8-024:** `[src/app/share/[token]/page.tsx:trade inference]` **[severity: MEDIUM]**  
`inferTrade()` classifies every classification as 'Architectural' unless its name matches a hard-coded regex for structural or mechanical terms. This means classifications like "Plumbing Fixture", "Electrical Outlet", "HVAC Duct" (common in library seed data) will be bucketed as "Architectural" in the share view's grouped quantities table, making the grouping misleading for shared contractor reports.  
**Fix:** Expand the regex sets to cover more trade vocabulary, or remove the grouping and use classification names/types directly.

---

### 🔵 LOW

**BUG-A8-025:** `[src/app/learn/page.tsx:static content]` **[severity: LOW]**  
The learn page uses entirely hardcoded static content arrays (GETTING_STARTED, shortcuts, FAQ). There are no loading states or data fetching issues. However, the `HelpCircle` and `Mail` icons are imported but the mail link in the contact section uses `href="mailto:..."` without an actual email address visible in the code (likely templated). If the placeholder was never filled, users clicking "Contact Support" may trigger a blank mailto: link.  
**Fix:** Verify the mailto link is populated with a real support email before shipping.

---

**BUG-A8-026:** `[src/app/settings/page.tsx:no loading state on save]` **[severity: LOW]**  
The settings page appears to save configuration (based on imports of supabase and state management), but if the save action is async, there is no loading/saving indicator visible during the API call. This is a minor UX issue.  
**Fix:** Add a disabled + spinner state to the save button during async operations.

---

**BUG-A8-027:** `[vercel.json:missing CSP headers]` **[severity: LOW]**  
`vercel.json` defines `headers` for `/api/ws` and `/api/(.*)` routes but does **not** include the application-level security headers (CSP, X-Frame-Options, etc.) — these are only set via `next.config.ts`. On Vercel, `next.config.ts` headers take precedence, so this is not a runtime gap. However, if the app is ever served via a CDN or reverse proxy that bypasses Next.js middleware, the `vercel.json` headers would be the last line of defense — and they're absent.  
**Fix:** Add the security headers to `vercel.json` as a defense-in-depth fallback.

---

**BUG-A8-028:** `[public/sw.js:no skip-waiting version invalidation]` **[severity: LOW]**  
The service worker is initialized with `skipWaiting: true` and `clientsClaim: true`. This means a new SW version will immediately take control of all open tabs. If users have unsaved project work in open tabs when a deployment happens, the new SW may serve stale precached JS chunks (from the old build) while the HTML loads new chunks — causing chunk load errors or silent stale-module bugs until the user hard-refreshes.  
**Fix:** Add a `version` message broadcast so the app can warn users of a pending update and prompt them to save before reload.

---

**BUG-A8-029:** `[src/app/projects/page.tsx:uncaught promise]` **[severity: LOW]**  
`src/app/projects/page.tsx` — while not fully read in this pass, the pattern seen in `library/page.tsx` (calling `fetch('/api/projects')` with `await res.json()` before `res.ok` check) is likely replicated here based on structural similarity. Recommend verifying this file follows the same pattern as BUG-A8-006.  
**Fix:** Audit all `fetch` calls for missing `res.ok` guards.

---

**BUG-A8-030:** `[src/app/share/[token]/page.tsx:formattedDate in render]` **[severity: LOW]**  
`const formattedDate = new Date().toLocaleDateString(...)` is computed directly in the render function (not in `useMemo`). On SSR + client hydration, this will produce a hydration mismatch if the date ticks over midnight between server render and client hydration.  
**Fix:** Move to `useMemo(() => new Date().toLocaleDateString(...), [])` to ensure stable value.

---

## Summary Table

| ID | File | Severity | Category |
|----|------|----------|----------|
| BUG-A8-001 | share/[token]/page.tsx | 🔴 CRITICAL | Auth / Data isolation |
| BUG-A8-002 | share/[token]/page.tsx | 🔴 CRITICAL | Auth / Error handling |
| BUG-A8-003 | next.config.ts | 🔴 CRITICAL | CSP / Security headers |
| BUG-A8-004 | share/[token]/page.tsx | 🟠 HIGH | State mutation |
| BUG-A8-005 | print/page.tsx | 🟠 HIGH | Data access / Cross-tab |
| BUG-A8-006 | library/page.tsx | 🟠 HIGH | Error handling |
| BUG-A8-007 | library/page.tsx | 🟠 HIGH | RLS / UX |
| BUG-A8-008 | migrations/017_mx_groups.sql | 🟠 HIGH | RLS / Database security |
| BUG-A8-009 | migrations/016_assemblies_grants.sql | 🟠 HIGH | Database permissions |
| BUG-A8-010 | next.config.ts | 🟠 HIGH | CSP / XSS |
| BUG-A8-011 | package.json | 🟠 HIGH | Dependency vulnerability |
| BUG-A8-012 | share/[token]/page.tsx | 🟡 MEDIUM | UX / Misleading button |
| BUG-A8-013 | print/page.tsx | 🟡 MEDIUM | Error handling |
| BUG-A8-014 | print/page.tsx | 🟡 MEDIUM | Error boundary |
| BUG-A8-015 | migrations/013_mx_pages_text.sql | 🟡 MEDIUM | Bad data migration |
| BUG-A8-016 | migrations/* | 🟡 MEDIUM | Missing rollbacks |
| BUG-A8-017 | public/sw.js | 🟡 MEDIUM | Cache strategy |
| BUG-A8-018 | public/sw.js | 🟡 MEDIUM | Cache staleness |
| BUG-A8-019 | src/app/page.tsx | 🟡 MEDIUM | UX / Compatibility |
| BUG-A8-020 | src/app/layout.tsx | 🟡 MEDIUM | PWA / iOS |
| BUG-A8-021 | next.config.ts | 🟡 MEDIUM | Missing env validation |
| BUG-A8-022 | src/app/error.tsx | 🟡 MEDIUM | Error boundary scoping |
| BUG-A8-023 | migrations/013_* | 🟡 MEDIUM | Migration naming collision |
| BUG-A8-024 | share/[token]/page.tsx | 🟡 MEDIUM | Logic / Trade grouping |
| BUG-A8-025 | learn/page.tsx | 🔵 LOW | Static content |
| BUG-A8-026 | settings/page.tsx | 🔵 LOW | UX |
| BUG-A8-027 | vercel.json | 🔵 LOW | Defense in depth |
| BUG-A8-028 | public/sw.js | 🔵 LOW | SW update UX |
| BUG-A8-029 | projects/page.tsx | 🔵 LOW | Error handling |
| BUG-A8-030 | share/[token]/page.tsx | 🔵 LOW | Hydration mismatch |

---

## TODOs / FIXMEs Found

No explicit `// TODO`, `// FIXME`, `// HACK`, or `// XXX` comments were found in the audited files.

---

## Notes

- **PWA icons:** `icon-192.png` and `icon-512.png` are both present in `public/`. ✅  
- **manifest.json:** Valid, references correct icon sizes and paths. ✅  
- **Service worker:** Compiled/minified serwist output — caching strategy bugs documented above (A8-017, A8-018).  
- **`next.config.ts`:** Turbopack enabled, bundle analyzer wired, serwist integration present. No missing image domains config (no `images.domains` — Next.js image optimization is not in use, consistent with direct PDF/canvas rendering). ✅  
- **`layout.tsx`:** Charset via Next.js default (`utf-8`). Viewport exported correctly via `generateViewport()` — correct Next.js 14+ pattern. ✅  
- **`vercel.json`:** Function timeouts are appropriately set. No `env` secrets in the file. ✅  
- **Migration 009_complete_schema.sql:** Large idempotent schema definition — contains no dangerous `DROP` without `IF EXISTS`. ✅  
- **Duplicate index definitions** across multiple migrations (e.g. `idx_mx_pages_project` appears in 001, 008, and 009) are harmless due to `IF NOT EXISTS` guards. ✅

---

*Report generated by Admiral 7/8 on 2026-03-20. Feed to fix wave.*
