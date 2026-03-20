# AUDIT REPORT — A8 CYCLE 4
**Repo:** measurex-takeoff  
**Scope:** Pages + Config + Infrastructure — MEDIUM and LOW severity bugs; regression check against Cycles 1–3 fixes  
**Date:** 2026-03-20  
**Auditor:** Admiral 7/8  
**Branch:** main  

---

## SUMMARY TABLE

| Category | Count |
|----------|-------|
| Confirmed Regressions (CRITICAL/HIGH) | 3 |
| Confirmed Regressions (MEDIUM/LOW) | 8 |
| New MEDIUM bugs | 14 |
| New LOW bugs | 18 |
| **TOTAL FINDINGS** | **43** |

---

## PART 1 — REGRESSION CHECK: CYCLES 1–3 FIXES

The following Cycle 1–3 bugs were verified against the current codebase. All confirmed fixes from Cycle 2 (A8-001 through A8-010) are acknowledged, but several issues from Cycle 3's expanded audit remain unaddressed.

---

### REGRESSION R-A8-001 (CRITICAL) — BUG-A8-3-122 / BUG-A8-3-123: `_exec_sql` still exposes PUBLIC EXECUTE
**File:** `supabase/migrations/000_bootstrap.sql:12`  
**Status:** NOT FIXED  
The `_exec_sql` SECURITY DEFINER function was reported as a critical RCE vector in Cycle 3 because the `PUBLIC` role (including `anon`) retains EXECUTE privilege by default. The migration file still reads:
```sql
CREATE OR REPLACE FUNCTION _exec_sql(sql_text text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE sql_text; END; $$;
```
No `REVOKE EXECUTE ON FUNCTION _exec_sql FROM PUBLIC;` statement has been added. No `SET search_path = public` guard has been applied. An unauthenticated user who can reach the Supabase API can still invoke arbitrary SQL.  
**Fix:** Add immediately after the function definition:
```sql
REVOKE EXECUTE ON FUNCTION _exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _exec_sql(text) TO service_role;
ALTER FUNCTION _exec_sql(text) SET search_path = public, pg_temp;
```
Or remove the function entirely if it is no longer needed by the migration runner.

---

### REGRESSION R-A8-002 (CRITICAL) — BUG-A8-3-136: RLS policies `USING (true)` still in place
**File:** `supabase/migrations/009_complete_schema.sql:188–216`  
**Status:** NOT FIXED  
All eight core tables (`mx_projects`, `mx_pages`, `mx_scales`, `mx_classifications`, `mx_polygons`, `mx_history`, `mx_assemblies`, `mx_estimates`) still have their RLS policies defined as `USING (true) WITH CHECK (true)`. This grants every authenticated (and, combined with existing grants, potentially anonymous) session full read/write access to every row in every table. A new migration to replace these with `auth.uid()`-scoped policies has not been written.  
**Fix:** Create migration `020b_rls_owner_scoped.sql` that drops the permissive "Allow all" policies and replaces them with policies that check `owner_id = auth.uid()` on `mx_projects` and cascades to child tables via `project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid())`.  
**Blocker:** This depends on BUG-A8-3-124/R-A8-003 below — `mx_projects` still lacks an `owner_id` column.

---

### REGRESSION R-A8-003 (CRITICAL) — BUG-A8-3-154 / BUG-A8-3-124: `owner_id` column still missing from `mx_projects`
**File:** `supabase/migrations/009_complete_schema.sql:17–23`, `supabase/migrations/018_mx_groups_rls_fix.sql:19`  
**Status:** NOT FIXED  
`mx_projects` table definition in `009_complete_schema.sql` contains only: `id`, `name`, `description`, `created_at`, `updated_at`. There is no `owner_id UUID REFERENCES auth.users(id)` column. Migration `018_mx_groups_rls_fix.sql` references `mx_projects.owner_id = auth.uid()` in all four group RLS policies, meaning those policies either fail at creation or silently return zero rows for all queries — effectively locking all users out of their groups.  
**Fix:** Create migration `020c_add_owner_id_to_projects.sql`:
```sql
ALTER TABLE mx_projects ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_mx_projects_owner_id ON mx_projects(owner_id);
-- Backfill: for now leave NULL; application layer must set owner_id on INSERT
```
Then update all API routes that INSERT into `mx_projects` to include `owner_id: user.id`.

---

### REGRESSION R-A8-004 (HIGH) — BUG-A8-3-042/043: API keys still stored in localStorage and state unmasked
**File:** `src/app/settings/page.tsx:113–122`  
**Status:** NOT FIXED  
`addApiKey` still uses `Math.random().toString(36).slice(2)` for ID generation (BUG-A8-3-049 is also still open). More critically, the API key value is stored in `apiKeys` React state and (when saved) in localStorage. The Cycle 3 audit identified this as HIGH severity; no change has been made.  
**Fix:** (1) Switch ID generation to `crypto.randomUUID()`. (2) Never store full API key values in localStorage or unmasked React state after initial entry — display only masked versions. (3) Show a one-time "copy now" warning before clearing the key from state.

---

### REGRESSION R-A8-005 (MEDIUM) — BUG-A8-3-044: `defaultScale` and `applyToAll` settings still not persisted
**File:** `src/app/settings/page.tsx:60`  
**Status:** NOT FIXED  
The `defaultScale` and `applyToAll` state variables are initialized from component state with no corresponding `localStorage.setItem` call on change and no API persistence. These settings are silently lost on every page reload.  
**Fix:** Add `useEffect` watchers on `defaultScale` and `applyToAll` that write to localStorage under a stable key, mirroring the existing `saveMeasurementSettings()` pattern.

---

### REGRESSION R-A8-006 (MEDIUM) — BUG-A8-3-047/048: "Change Email", "Change Password", and "Sign Out" buttons still non-functional
**File:** `src/app/settings/page.tsx:548–557`  
**Status:** NOT FIXED  
All three account-action buttons (`Change Password` at line 549, `Sign Out` at line 557) have no `onClick` handlers — confirmed by code inspection. These appear interactive but do nothing. This is misleading for users who expect to sign out.  
**Fix:** At minimum wire "Sign Out" to `supabase.auth.signOut()` then `router.push('/login')`. Wire "Change Password" to the Supabase `updateUser({ password })` flow or redirect to a dedicated password-change page.

---

### REGRESSION R-A8-007 (MEDIUM) — BUG-A8-3-076/077: `unsafe-eval` and `unsafe-inline` still in `script-src`
**File:** `next.config.ts:33`  
**Status:** NOT FIXED  
The Cycle 3 audit flagged `script-src 'unsafe-eval' 'unsafe-inline'` as rendering the entire script-src directive effectively useless against XSS. These directives are still present in the current `next.config.ts`. The Cycle 2 fix narrowed `connect-src` (BUG-A8-003) but did not address eval/inline.  
**Fix:** Investigate which libraries actually require `unsafe-eval` (likely pdf.js and potentially webpack HMR in dev only). If limited to dev, gate the directive: `process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ""`. Migrate inline scripts to nonce-based or hash-based CSP for production.

---

### REGRESSION R-A8-008 (MEDIUM) — BUG-A8-3-085: Single-region Vercel deployment, no failover
**File:** `vercel.json:5`  
**Status:** NOT FIXED — `"regions": ["iad1"]`  
A regional outage in `iad1` takes the entire app offline. Noted in Cycle 3 as MEDIUM; no additional regions have been configured.  
**Fix:** Add a second region (e.g., `"regions": ["iad1", "sfo1"]`) or document that this is an accepted limitation given the Supabase instance's own region.

---

### REGRESSION R-A8-009 (MEDIUM) — BUG-A8-3-025: `error.tsx` still mis-named (not `global-error.tsx`)
**File:** `src/app/error.tsx:1`  
**Status:** PARTIALLY FIXED — component was renamed to `GlobalError` internally but the file is still named `error.tsx`  
In Next.js 13+ App Router, a `global-error.tsx` at the root of the `app/` directory is required to catch errors thrown inside the root layout. A file named `error.tsx` is scoped to its route segment and cannot catch root-layout errors. The component is exported as `GlobalError` which implies intent, but the file name is wrong.  
**Fix:** Rename `src/app/error.tsx` → `src/app/global-error.tsx` and add an `<html>` + `<body>` wrapper around the error UI (required for `global-error.tsx` since it replaces the root layout entirely).

---

### REGRESSION R-A8-010 (LOW) — BUG-A8-3-023: `maximumScale: 1` WCAG violation still present
**File:** `src/app/layout.tsx:43`  
**Status:** NOT FIXED — `maximumScale: 1` remains in `generateViewport()`  
This prevents pinch-to-zoom on mobile, violating WCAG 1.4.4 (Resize Text, Level AA). Noted in Cycle 3; unchanged.  
**Fix:** Remove `maximumScale: 1` from the viewport configuration, or replace it with `maximumScale: 5` which allows zoom without restricting accessibility.

---

### REGRESSION R-A8-011 (LOW) — BUG-A8-3-081: No HSTS header
**File:** `next.config.ts`  
**Status:** NOT FIXED  
No `Strict-Transport-Security` header has been added to the response headers in `next.config.ts`. The app is vulnerable to SSL-stripping on initial connections.  
**Fix:** Add to the `headers()` array:
```ts
{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }
```

---

## PART 2 — NEW MEDIUM BUGS (CYCLE 4)

---

### BUG-A8-4-001 (MEDIUM) — Share page: token still passed unencoded to `window.open` export URL
**File:** `src/app/share/[token]/page.tsx:123`  
**Description:** The `handleExport` callback opens `window.open(`/api/share/${token}/export?format=${format}`, '_blank')` for JSON and PDF formats. The `token` value comes directly from `useParams()` with no sanitization or `encodeURIComponent` wrapping. If the token somehow contains characters like `#`, `?`, or `&` (unlikely for UUID tokens but possible for other token formats), the constructed URL will be malformed. More importantly, there is no `rel="noopener noreferrer"` equivalent for `window.open` — the opened tab inherits the opener reference.  
**Fix:** (1) Apply `encodeURIComponent(token)` in the URL template. (2) Use `window.open(url, '_blank', 'noopener,noreferrer')` to prevent opener leakage.

---

### BUG-A8-4-002 (MEDIUM) — `next.config.ts`: `connect-src` missing OpenAI/AI provider domains
**File:** `next.config.ts:39`  
**Description:** The current `connect-src` is:
```
'self' <supabase_url> wss://<app_host> https://*.supabase.co
```
The app makes client-side fetch calls to OpenAI (or similar AI APIs) directly from the browser for AI takeoff operations. If these calls originate from the browser (not the server proxy), they will be blocked by the CSP and silently fail. Investigation of `src/app/page.tsx` shows `handleAITakeoff` calling `/api/ai-takeoff` server-side, but the settings page reads an API key suggesting some direct browser calls may be intended.  
**Fix:** Audit all client-side fetch targets and add any external AI API domains explicitly to `connect-src`. If AI calls are exclusively server-proxied, document this in a comment and add a test that verifies no direct client-to-OpenAI calls exist.

---

### BUG-A8-4-003 (MEDIUM) — `next.config.ts`: `worker-src` missing `blob:` for pdf.js main thread case
**File:** `next.config.ts:41`  
**Description:** `worker-src` is set to `blob: 'self' https://cdn.jsdelivr.net`. The `blob:` entry is cited as required for pdf.js workers. However, `script-src` does NOT include `blob:` (correctly removed as the Cycle 2 BUG-A8-010 fix). The risk is that pdf.js in some code paths dynamically constructs a blob-URL worker from `script-src` not `worker-src` — this is browser-dependent. The inconsistency between `worker-src` (blob: allowed) and `script-src` (blob: removed) should be documented with explicit rationale.  
**Fix:** Add a comment in `next.config.ts` explicitly documenting why `blob:` is in `worker-src` but not `script-src`, referencing the specific pdf.js worker initialization pattern. Add an automated CSP test that validates these directives on each build.

---

### BUG-A8-4-004 (MEDIUM) — `src/app/settings/page.tsx`: Hardcoded PII defaults exposed to unauthenticated users
**File:** `src/app/settings/page.tsx:59–66`  
**Description:** The `getUserName()` function returns `'Nathan Solis'` as default and `email` state is initialized to `'nathan@measurex.io'`. Since there is no authentication check on the settings page (R-A8-004 in prior cycles, still open from BUG-A8-3-041), these personal details are rendered to any unauthenticated visitor. Even if authentication is added, these should come from the authenticated user session, not hardcoded defaults.  
**Fix:** Replace hardcoded defaults with empty strings. Populate name and email exclusively from `supabase.auth.getUser()` after the auth check is implemented.

---

### BUG-A8-4-005 (MEDIUM) — `src/app/print/page.tsx`: `svgScale` useMemo does not re-compute when canvas dimensions change
**File:** `src/app/print/page.tsx:266–269`  
**Description:** The Cycle 3 audit (BUG-A8-3-059) identified that `svgScale` depends on `canvasRef.current?.width` inside a `useMemo([state])`. React does not track ref mutations, so `svgScale` is stale (returns 1) until `state` changes after the canvas renders. The current code still reads:
```ts
const svgScale = useMemo(() => {
  if (!state || !canvasRef.current) return 1;
  return (canvasRef.current?.width ?? state.pageDims.width) / state.pageDims.width;
}, [state]);
```
`canvasRef.current` is not in the dependency array and cannot be.  
**Fix:** Use a `ResizeObserver` or `useLayoutEffect` that updates a `canvasWidth` piece of state whenever the canvas element resizes, then use that state value (not the ref directly) in `svgScale`.

---

### BUG-A8-4-006 (MEDIUM) — `vercel.json`: `/api/share/[token]/export` has no `maxDuration`
**File:** `vercel.json:7–26`  
**Description:** The share export route (`/api/share/[token]/export`) is not listed in the `functions` block of `vercel.json`. For large projects, generating an Excel export or rendering a print-quality PDF can exceed Vercel's default function timeout (10–15s on standard plans). There is no timeout guard.  
**Fix:** Add to `vercel.json` functions:
```json
"src/app/api/share/[token]/export/route.ts": { "maxDuration": 60 }
```

---

### BUG-A8-4-007 (MEDIUM) — `public/sw.js`: overlapping route matchers between legacy and new runtimeCaching arrays
**File:** `public/sw.js`  
**Description:** BUG-A8-3-095 from Cycle 3 identified duplicate/conflicting route registrations in the service worker. This was not fixed in Cycle 3 and remains. The legacy `eD` array and the inline `runtimeCaching` array both define matchers for `/api/*`, JS/CSS assets, and images. Workbox silently uses the first-registered handler; the intended handler for certain routes may never fire. This can cause stale-cache reads for API responses in offline mode.  
**Fix:** Consolidate to a single `runtimeCaching` array, remove the legacy `eD` array entirely, and run `npm run build` to regenerate `public/sw.js` from `src/sw.ts`.

---

### BUG-A8-4-008 (MEDIUM) — `src/app/library/page.tsx`: no rollback on optimistic delete failure
**File:** `src/app/library/page.tsx:130`  
**Description:** BUG-A8-3-053 from Cycle 3 (optimistic delete with no rollback). Still present in current code. `handleDelete` removes the item from UI state before confirming the Supabase delete succeeded. If the delete fails (RLS rejection, network error), the item vanishes from the UI but still exists in the database.  
**Fix:** Hold the deleted item in a temporary variable, perform the Supabase delete, and only update state on success. On failure, re-insert the item and show an error toast.

---

### BUG-A8-4-009 (MEDIUM) — `src/app/library/page.tsx`: import modal fires uncached API call on every open
**File:** `src/app/library/page.tsx:143`  
**Description:** BUG-A8-3-054 from Cycle 3 — `handleImportOpen` calls `fetch('/api/projects')` on every modal open with no caching or deduplication. Rapid open/close triggers multiple concurrent requests. Still not fixed.  
**Fix:** Cache the projects list in `useRef` or a state variable on first fetch. Add a stale-while-revalidate pattern: show cached list immediately, refresh in background.

---

### BUG-A8-4-010 (MEDIUM) — `src/app/projects/page.tsx`: context menu renders off-screen near viewport edges
**File:** `src/app/projects/page.tsx:437`  
**Description:** BUG-A8-3-038 from Cycle 3 — context menu positioned at raw `clientX/clientY` with no viewport boundary clamping. Still present. On small screens or when right-clicking near the right/bottom edge, menu items are cut off.  
**Fix:** After positioning, measure the menu element's `getBoundingClientRect()` and clamp `left = Math.min(clientX, window.innerWidth - menuWidth)` and `top = Math.min(clientY, window.innerHeight - menuHeight)`.

---

### BUG-A8-4-011 (MEDIUM) — `src/app/page.tsx`: `projectId` not encoded in `window.history.replaceState` calls
**File:** `src/app/page.tsx:1177, 1328`  
**Description:** BUG-A8-3-003/004 from Cycle 3 remain. Both `handleSave` (line 1328) and the project-loaded callback (line 1177) call:
```ts
window.history.replaceState({}, '', `/?project=${project.id}`)
```
without `encodeURIComponent(project.id)`. While UUID-format project IDs are URL-safe, this is a code-quality issue: the project ID comes from an API response, and if the ID format ever changes or is tampered with (e.g., via the BUG-A8-3-001 localStorage injection vector), an unencoded special character could corrupt the URL or enable open-redirect.  
**Fix:** Replace both with:
```ts
window.history.replaceState({}, '', `/?project=${encodeURIComponent(project.id)}`)
```

---

### BUG-A8-4-012 (MEDIUM) — `supabase/migrations/013_classification_library.sql`: `GRANT SELECT TO anon` exposes pricing data
**File:** `supabase/migrations/013_classification_library.sql:25`  
**Description:** BUG-A8-3-140 from Cycle 3 — `GRANT SELECT ON mx_classification_library TO anon` is still present. Unauthenticated visitors can read all classification library items including `unit_cost` pricing data via a direct Supabase API call.  
**Fix:** Revoke anonymous read access: `REVOKE SELECT ON mx_classification_library FROM anon;` Restrict library reads to `authenticated` role only.

---

### BUG-A8-4-013 (MEDIUM) — `supabase/migrations/013_classification_library.sql`: no guard on `is_org` promotion
**File:** `supabase/migrations/013_classification_library.sql`  
**Description:** BUG-A8-3-142 from Cycle 3 — no `UPDATE` policy guard on the `is_org` column. Any authenticated user can promote their own library entry to `is_org = true`, making it visible to all users. This is still unaddressed.  
**Fix:** Add a policy that restricts `is_org` updates to service_role or a specific admin role:
```sql
CREATE POLICY "library_org_flag_admin_only" ON mx_classification_library
  FOR UPDATE USING (auth.role() = 'service_role')
  WITH CHECK (is_org = false OR auth.role() = 'service_role');
```

---

### BUG-A8-4-014 (MEDIUM) — `supabase/migrations/015_pdf_storage_bucket.sql`: no storage RLS policies
**File:** `supabase/migrations/015_pdf_storage_bucket.sql`  
**Description:** BUG-A8-3-144 from Cycle 3 — the `pdfs` storage bucket is created with no corresponding storage RLS policies. Any user (potentially including `anon` depending on Supabase project settings) can upload, download, or list PDFs belonging to other users' projects. This remains unfixed.  
**Fix:** Add storage policies:
```sql
CREATE POLICY "Users can upload own project PDFs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM mx_projects WHERE owner_id = auth.uid()
    )
  );
CREATE POLICY "Users can read own project PDFs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM mx_projects WHERE owner_id = auth.uid()
    )
  );
```

---

## PART 3 — NEW LOW BUGS (CYCLE 4)

---

### BUG-A8-4-L001 (LOW) — `src/app/layout.tsx`: OpenGraph missing `og:image`, `og:url`, `og:site_name`
**File:** `src/app/layout.tsx:24–33`  
**Description:** BUG-A8-3-021 from Cycle 3 — still not fixed. The `openGraph` metadata block has `title`, `description`, and `type`, but no `images`, `url`, or `siteName`. Slack, Twitter, and Facebook unfurl previews will show no image.  
**Fix:**
```ts
openGraph: {
  title: "MeasureX",
  description: "...",
  type: "website",
  url: "https://app.measurex.io",
  siteName: "MeasureX",
  images: [{ url: "https://app.measurex.io/og-image.png", width: 1200, height: 630 }],
},
twitter: { card: "summary_large_image", title: "MeasureX", description: "..." },
```

---

### BUG-A8-4-L002 (LOW) — `public/manifest.json`: no maskable icon, missing `id`, `scope`, `orientation`, `lang`, `categories`
**File:** `public/manifest.json`  
**Description:** Multiple BUG-A8-3-099 through BUG-A8-3-104 from Cycle 3 remain unaddressed in a single manifest file. The manifest still has:
- No `"purpose": "maskable"` on either icon (causes Android adaptive icon clipping)
- No `"id"` field (PWA identity tied to fragile `start_url`)
- No `"scope"` field (navigation boundary undefined)
- No `"orientation"` field (unintended rotation on tablets)
- No `"lang": "en"` (accessibility/localization)
- No `"categories"` field (discoverability)  
**Fix:**
```json
{
  "id": "/",
  "scope": "/",
  "lang": "en",
  "orientation": "any",
  "categories": ["productivity", "business"],
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

---

### BUG-A8-4-L003 (LOW) — `src/app/error.tsx`: error `digest` not shown to user
**File:** `src/app/error.tsx:19–22`  
**Description:** BUG-A8-3-029 from Cycle 3. The `error.digest` is passed to `captureError()` for server-side logging, but is never shown in the UI. Users cannot report a specific error to support because they have no reference ID.  
**Fix:** Add `{error.digest && <p className="text-xs text-gray-500">Error ID: {error.digest}</p>}` below the "Something went wrong." message.

---

### BUG-A8-4-L004 (LOW) — `src/app/error.tsx`: "Try again" button allows rapid repeated clicks
**File:** `src/app/error.tsx:23`  
**Description:** BUG-A8-3-026 partial fix — the component was renamed to `GlobalError` but no debounce or disabled state was added to the reset button. Multiple rapid clicks can fire multiple concurrent reset attempts.  
**Fix:** Add `disabled` state: `const [resetting, setResetting] = useState(false)` and wrap `onClick` with `setResetting(true); reset();`.

---

### BUG-A8-4-L005 (LOW) — `src/app/learn/page.tsx`: tutorial cards and CTA buttons still non-functional
**File:** `src/app/learn/page.tsx:209, 228`  
**Description:** BUG-A8-3-057/058 from Cycle 3 — tutorial cards' "play" buttons and "Help Center"/"Contact Support" CTAs still have no `onClick` handlers. They render with pointer cursors and hover styles suggesting interactivity but do nothing.  
**Fix:** Wire "Help Center" to an external documentation URL (`window.open('https://docs.measurex.io', '_blank')`). Wire "Contact Support" to `mailto:support@measurex.io`. For video cards, either embed a real video link or remove the play-button affordance entirely.

---

### BUG-A8-4-L006 (LOW) — `src/app/settings/page.tsx`: `teamName` state never persisted
**File:** `src/app/settings/page.tsx:75`  
**Description:** BUG-A8-3-046 from Cycle 3 — the Organization tab's team name input is bound to `teamName` state but has no save mechanism. Changes are lost on reload.  
**Fix:** Add a "Save" button that calls `localStorage.setItem('measurex_team_name', teamName)` as a stopgap, or wire to a Supabase `organization_settings` table.

---

### BUG-A8-4-L007 (LOW) — `src/app/projects/page.tsx`: localStorage data never validated after `JSON.parse`
**File:** `src/app/projects/page.tsx:94`  
**Description:** BUG-A8-3-037 from Cycle 3 — starred IDs, folders, and tags are read from localStorage via `JSON.parse` inside `catch` blocks that swallow errors silently. If stored data is corrupted or unexpected shape (e.g., a non-array passed to `new Set()`), the catch block fires with no user feedback and the UI falls back to empty state silently.  
**Fix:** After `JSON.parse`, validate the shape: `if (!Array.isArray(parsed)) throw new Error('Expected array')`. Show a non-blocking toast if data is corrupt.

---

### BUG-A8-4-L008 (LOW) — `src/app/projects/page.tsx`: context menu has no keyboard accessibility
**File:** `src/app/projects/page.tsx:437`  
**Description:** BUG-A8-3-039 from Cycle 3 — the right-click context menu has no `role="menu"`, no `aria-expanded`, no focus trapping, and no keyboard navigation. WCAG 2.1 AA violation.  
**Fix:** Add `role="menu"` to the menu container, `role="menuitem"` to each item, focus the first item on open, handle `ArrowUp`/`ArrowDown` for navigation, `Escape` to close, and trap focus within the menu while open.

---

### BUG-A8-4-L009 (LOW) — `public/sw.js`: `skipWaiting` + `clientsClaim` activates new SW without user consent
**File:** `public/sw.js`  
**Description:** BUG-A8-3-097 from Cycle 3. A new service worker activates and takes control of all tabs immediately on update. If a user has a long-running print or AI takeoff operation in progress, mid-session SW replacement can cause fetch interception inconsistencies.  
**Fix:** Either remove `skipWaiting()` (defer activation until all tabs are closed) or add a `message` event listener that only calls `skipWaiting()` when the page sends an explicit "SKIP_WAITING" message (after showing a "New version available — reload?" banner).

---

### BUG-A8-4-L010 (LOW) — `supabase/migrations/013_classification_library.sql`: seed data `created_by = null` causes RLS edge case
**File:** `supabase/migrations/013_classification_library.sql:27`  
**Description:** BUG-A8-3-141 from Cycle 3 — org template rows are seeded with `created_by = null`. The `org_library_read` policy evaluates `is_org = true OR auth.uid() = created_by`. When `created_by` is null, the second condition is always false. This means seeded org templates are accessible only via the `is_org = true` branch, which is correct, but any future policy change that reorders the conditions could silently break org-template visibility.  
**Fix:** Update seed data to use a stable system UUID for `created_by` (e.g., `'00000000-0000-0000-0000-000000000000'`) or a dedicated service account, so the FK and policy logic are consistent.

---

### BUG-A8-4-L011 (LOW) — `supabase/migrations/012_share_token.sql` and `011_add_formula_columns.sql`: redundant migrations
**File:** `supabase/migrations/012_share_token.sql`, `supabase/migrations/011_add_formula_columns.sql`  
**Description:** BUG-A8-3-159/160 from Cycle 3 — both files are confirmed duplicates of earlier migrations (010 and 006 respectively), still using `IF NOT EXISTS` guards. They inflate migration history and create audit confusion.  
**Fix:** Document the duplicates with a header comment explaining they are no-ops kept for migration-history completeness, or remove them and renumber the migration sequence.

---

### BUG-A8-4-L012 (LOW) — `package.json`: `"lint"` script has no target path
**File:** `package.json:scripts`  
**Description:** BUG-A8-3-109 from Cycle 3 — `"lint": "eslint"` with no target means `npm run lint` exits with an error or lints nothing. CI gates depending on this script will pass vacuously.  
**Fix:** Change to `"lint": "eslint . --ext .ts,.tsx --report-unused-disable-directives --max-warnings 0"`.

---

### BUG-A8-4-L013 (LOW) — `package.json`: no `typecheck` script
**File:** `package.json:scripts`  
**Description:** BUG-A8-3-110 from Cycle 3 — no `"typecheck": "tsc --noEmit"` script means TypeScript errors can slip through builds if `next build` is configured with `ignoreBuildErrors`. Still absent.  
**Fix:** Add `"typecheck": "tsc --noEmit"` to scripts and add it as a CI step.

---

### BUG-A8-4-L014 (LOW) — `package.json`: `test:e2e` uses experimental Node.js flag
**File:** `package.json:37`  
**Description:** BUG-A8-3-111 from Cycle 3 — `"test:e2e": "node --experimental-strip-types scripts/e2e-api-test.ts"` uses an unstable flag. Still present.  
**Fix:** Replace with `"test:e2e": "tsx scripts/e2e-api-test.ts"` using the already-available `tsx` dev dependency.

---

### BUG-A8-4-L015 (LOW) — `src/app/share/[token]/page.tsx:375`: "Shared by Contractor" is hardcoded
**File:** `src/app/share/[token]/page.tsx:375`  
**Description:** BUG-A8-3-072 from Cycle 3 — the byline "Shared by Contractor" is hardcoded in the share view UI. It does not reflect the actual sharer's name and could create false trust for social engineering.  
**Fix:** Include the sharer's display name in the share token API response and render it dynamically, or remove the byline entirely.

---

### BUG-A8-4-L016 (LOW) — `src/app/share/[token]/page.tsx:148`: hydration mismatch from `new Date()` in useMemo
**File:** `src/app/share/[token]/page.tsx:148`  
**Description:** BUG-A8-3-067 from Cycle 3 — `formattedDate` is computed via `new Date()` in a `useMemo`. On SSR the timestamp differs from client render time, causing a React hydration mismatch warning in development and a potential flash in production.  
**Fix:** Use `suppressHydrationWarning` on the date element, or compute the date on the server and pass it as a prop, or defer it to a `useEffect` that sets state after mount.

---

### BUG-A8-4-L017 (LOW) — `next.config.ts`: `img-src` allows `https:` (all HTTPS image sources)
**File:** `next.config.ts`  
**Description:** BUG-A8-3-089 from Cycle 3 — `img-src 'self' data: blob: https:` allows loading images from any HTTPS source. A stored-XSS or CSS injection attack could exfiltrate data by loading a crafted image from an attacker-controlled server.  
**Fix:** Narrow to known image sources: `img-src 'self' data: blob: https://*.supabase.co https://storage.googleapis.com`. If third-party avatar or blueprint imagery is used, enumerate those domains explicitly.

---

### BUG-A8-4-L018 (LOW) — `src/app/page.tsx`: keyboard shortcut `e.key === 'a'` fires even when `aiLoading` is true
**File:** `src/app/page.tsx:689–695` (approx., BUG-A8-3-017)  
**Description:** BUG-A8-3-017 from Cycle 3 — the AI takeoff keyboard shortcut is not gated on `aiLoading`, allowing multiple concurrent AI requests to be queued via keyboard. Still present.  
**Fix:** Add `if (aiLoading) return;` at the top of the keyboard shortcut handler for `'a'`.

---

## PART 4 — CONFIRMED CLEAN (NO REGRESSION)

The following Cycle 1–2 fixes were verified and remain in place:

- **BUG-A8-001** (CRITICAL): Share page no longer calls `hydrateState()` or `setProjectId()` on the global store — share view uses isolated local state only. ✅
- **BUG-A8-002** (CRITICAL): `handleExport('excel')` now checks `res.ok` before calling `res.blob()`. ✅
- **BUG-A8-003** (CRITICAL): `connect-src` narrowed from `wss: https:` to specific trusted origins. ✅
- **BUG-A8-004** (HIGH): Share page no longer sets global `projectId`. ✅
- **BUG-A8-005** (HIGH): Print page now uses BroadcastChannel with localStorage fallback; null guard on `state` before computing `quantityRows`. ✅
- **BUG-A8-006** (HIGH): `fetchProjects` now checks `res.ok` before `await res.json()`. ✅
- **BUG-A8-010** (HIGH): `blob:` removed from `script-src-elem`. ✅
- **BUG-A8-3-019** (Cycle 3, migration `019`): `GRANT ALL ON mx_assemblies TO anon` revoked for write operations. ✅

---

## PART 5 — PRIORITY FIX ORDER (CYCLE 5)

### 🔴 CRITICAL (block deploy)
1. **R-A8-001** — Revoke `PUBLIC` EXECUTE on `_exec_sql`; add `SET search_path`
2. **R-A8-002** — Replace `USING (true)` RLS policies on all core tables
3. **R-A8-003** — Add `owner_id` column to `mx_projects`; fix groups RLS policies

### 🟠 HIGH (fix this sprint)
4. **R-A8-004** — API key localStorage storage; switch ID gen to `crypto.randomUUID()`
5. **BUG-A8-4-014** — PDF storage bucket RLS policies
6. **BUG-A8-4-013** — Block unprivileged `is_org` promotion in library
7. **BUG-A8-4-012** — Revoke `GRANT SELECT TO anon` on classification library
8. **R-A8-007** — Investigate and reduce `unsafe-eval` in CSP

### 🟡 MEDIUM (this or next sprint)
9. **R-A8-005** — Persist `defaultScale`/`applyToAll` settings
10. **R-A8-006** — Wire "Sign Out" and "Change Password" buttons
11. **R-A8-009** — Rename `error.tsx` → `global-error.tsx` with html/body wrapper
12. **BUG-A8-4-005** — Fix `svgScale` stale ref in print page
13. **BUG-A8-4-006** — Add `maxDuration` for share export in `vercel.json`
14. **BUG-A8-4-007** — Consolidate SW runtimeCaching arrays
15. **BUG-A8-4-008** — Add delete rollback in library page
16. **BUG-A8-4-010** — Clamp context menu to viewport bounds
17. **BUG-A8-4-011** — `encodeURIComponent` on projectId in `replaceState` calls
18. **BUG-A8-4-004** — Remove hardcoded PII defaults from settings page

### 🔵 LOW (polish/backlog)
- BUG-A8-4-L001 through L018 as backlog items

---

## APPENDIX — BUGS REPORTED BUT DEFERRED (OUT OF CYCLE 4 SCOPE)

The following Cycle 3 bugs are CRITICAL or HIGH severity and were not addressed in Cycle 3 or Cycle 4, but fall into other sectors (A5/A6/A7) — tracked in their respective audit reports:
- BUG-A5-3-001/004/014/020: Auth bypass on admin, AI, chat, and feature-flag routes
- BUG-A6-3-122: DrawingSetManager data loss on `moveDrawing`
- BUG-A7-4-001 through A7-4-003: Store regressions (cutPolygon stub, scale setter guards, setScaleForPage page mismatch)

---

*Report generated by Admiral 7/8 — Cycle 4 Audit of A8 sector (Pages + Config + Infrastructure)*  
*Total findings: 43 (3 critical regressions, 8 medium/low regressions, 14 new medium, 18 new low)*
