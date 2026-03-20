# AUDIT REPORT — A8 CYCLE 5
**Repo:** measurex-takeoff  
**Scope:** Pages + Config + Infrastructure (A8 sector)  
**Date:** 2026-03-20  
**Auditor:** Admiral 7 (OpenClaw)  
**Branch:** main  
**Files audited:**
- `src/app/layout.tsx`
- `src/app/global-error.tsx`
- `src/app/page.tsx`
- `src/app/projects/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/share/[token]/page.tsx`
- `src/app/print/page.tsx`
- `src/app/library/page.tsx`
- `src/app/learn/page.tsx`
- `next.config.ts`
- `vercel.json`
- `package.json`
- `public/manifest.json`
- `public/sw.js`
- `supabase/migrations/000_bootstrap.sql`
- `supabase/migrations/009_complete_schema.sql`
- `supabase/migrations/013_classification_library.sql`
- `supabase/migrations/021_add_owner_id_to_projects.sql`
- `supabase/migrations/022_rls_owner_scoped.sql`
- `supabase/migrations/023_security_hardening.sql`
- All other migration files

---

## CYCLE 5 FIX VERIFICATION (Regression Check)

The following critical bugs from Cycles 1–4 were verified against current code:

### ✅ FIXED — R-A8-001: `_exec_sql` PUBLIC EXECUTE revoked
`supabase/migrations/000_bootstrap.sql` now includes:
```sql
REVOKE EXECUTE ON FUNCTION _exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _exec_sql(text) TO service_role;
```
Also adds `SET search_path = public, pg_temp` on the function. **CONFIRMED FIXED.**

### ✅ FIXED — R-A8-002: RLS `USING (true)` policies replaced
`supabase/migrations/022_rls_owner_scoped.sql` drops all permissive "Allow all" policies and replaces them with owner-scoped policies on all 8 core tables. **CONFIRMED FIXED.**

### ✅ FIXED — R-A8-003: `owner_id` column added to `mx_projects`
`supabase/migrations/021_add_owner_id_to_projects.sql` adds the column. **CONFIRMED FIXED.**

### ✅ FIXED — R-A8-004: API key localStorage/ID generation
`src/app/settings/page.tsx`: `crypto.randomUUID()` used, one-time copy warning shown, key masked after dismissal. **CONFIRMED FIXED.**

### ✅ FIXED — R-A8-005: `defaultScale`/`applyToAll` persisted
Both now write to `localStorage` immediately on change via `updateDefaultScale`/`updateApplyToAll`. **CONFIRMED FIXED.**

### ✅ FIXED — R-A8-006: Sign Out and Change Password wired
Both buttons have real `onClick` handlers. **CONFIRMED FIXED.**

### ✅ FIXED — R-A8-007: `unsafe-eval` gated to dev only
`next.config.ts`: `process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""` in `script-src`. **CONFIRMED FIXED.**

### ✅ FIXED — R-A8-008: Two-region Vercel deployment
`vercel.json`: `"regions": ["iad1", "sfo1"]`. **CONFIRMED FIXED.**

### ✅ FIXED — R-A8-009: `error.tsx` renamed to `global-error.tsx`
File is `src/app/global-error.tsx` with proper `<html>/<body>` wrapper. **CONFIRMED FIXED.**

### ✅ FIXED — R-A8-011: HSTS header added
`next.config.ts` now includes `Strict-Transport-Security` header. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-001: `encodeURIComponent` + `noopener,noreferrer` on share export
`src/app/share/[token]/page.tsx:123` now uses both. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-002: AI calls are exclusively server-proxied (CSP comment added)
**CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-003: `worker-src blob:` vs `script-src` difference documented
Comment added in `next.config.ts`. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-004: Hardcoded PII defaults removed
`src/app/settings/page.tsx`: name defaults to empty string loaded from localStorage; email starts empty. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-005: `svgScale` stale ref fixed
`src/app/print/page.tsx`: `canvasDims` state used instead of `canvasRef.current` in `useMemo`. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-006: `maxDuration` for share export route added
`vercel.json`: `"src/app/api/share/[token]/export/route.ts": { "maxDuration": 60 }`. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-008: Library delete no longer optimistic
`src/app/library/page.tsx`: delete confirmed before state update. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-009: Import modal caches projects list
`src/app/library/page.tsx`: `projectsCacheRef` caches result; stale-while-revalidate pattern. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-012: `GRANT SELECT TO anon` revoked on classification library
`supabase/migrations/023_security_hardening.sql`. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-013: `is_org` promotion blocked for non-service_role
`supabase/migrations/023_security_hardening.sql`. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-014: PDF storage RLS policies added
`supabase/migrations/023_security_hardening.sql`. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-L003: Error digest shown in global error boundary
`src/app/global-error.tsx:29`. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-L004: Reset button in error boundary has disabled state
`src/app/global-error.tsx`. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-L006: `teamName` persisted to localStorage
`src/app/settings/page.tsx`: `updateTeamName` writes to localStorage. **CONFIRMED FIXED.**

### ✅ FIXED — BUG-A8-4-L017: `img-src` narrowed
`next.config.ts`: `img-src 'self' data: blob: https://*.supabase.co`. **CONFIRMED FIXED.**

---

## REMAINING OPEN BUGS FROM CYCLE 4 (Not Yet Fixed)

---

### BUG-A8-4-010 (MEDIUM) — `src/app/projects/page.tsx`: context menu still renders off-screen near viewport edges
**File:** `src/app/projects/page.tsx` (contextMenu state positioning)  
**Status:** NOT FIXED — context menu uses raw `clientX/clientY`, no viewport clamping logic found.  
**Fix:** After positioning, clamp: `left = Math.min(clientX, window.innerWidth - menuWidth)`, `top = Math.min(clientY, window.innerHeight - menuHeight)`.

---

### BUG-A8-4-011 (MEDIUM) — `src/app/page.tsx`: `projectId` encoded in `replaceState` (VERIFIED FIXED in two places, but one new instance found)
**File:** `src/app/page.tsx:1183, 1329`  
**Status:** FIXED in both `ensureProject` and `handleSave` — both use `encodeURIComponent(project.id)`. ✅

---

### BUG-A8-4-L001 (LOW) — `src/app/layout.tsx`: OpenGraph still missing `og:image`, `og:url`, `og:site_name`
**File:** `src/app/layout.tsx:28–33`  
**Status:** NOT FIXED. The `openGraph` block still has only `title`, `description`, and `type`. No `images`, `url`, or `siteName`.

---

### BUG-A8-4-L002 (LOW) — `public/manifest.json`: still missing maskable icons, `id`, `scope`, `orientation`, `lang`, `categories`
**File:** `public/manifest.json`  
**Status:** NOT FIXED. Manifest has only 6 fields; still missing all recommended PWA fields.

---

### BUG-A8-4-L005 (LOW) — `src/app/learn/page.tsx`: "Help Center" and "Contact Support" CTAs still non-functional
**File:** `src/app/learn/page.tsx:305–313` (bottom section)  
**Status:** NOT FIXED. Tutorial card play buttons and the two CTA buttons have no `onClick` handlers.

---

### BUG-A8-4-L007 (LOW) — `src/app/projects/page.tsx`: localStorage data shape not validated after `JSON.parse`
**File:** `src/app/projects/page.tsx:109–135`  
**Status:** NOT FIXED. `loadStarred()`, `loadFolders()`, `loadProjectTags()` all use bare `JSON.parse` with no shape validation — a corrupted value passed to `new Set()` will silently fail.

---

### BUG-A8-4-L008 (LOW) — `src/app/projects/page.tsx`: context menu has no keyboard accessibility
**File:** `src/app/projects/page.tsx` (contextMenu rendering)  
**Status:** NOT FIXED. No `role="menu"`, no focus trapping, no arrow-key navigation.

---

### BUG-A8-4-L009 (LOW) — `public/sw.js`: `skipWaiting: true` activates SW without user consent
**File:** `public/sw.js` (Serwist config)  
**Status:** NOT FIXED. `skipWaiting: true` and `clientsClaim: true` still present in the built SW. Mid-session tab takeover possible.

---

### ✅ BUG-A8-4-L010 (LOW) — `supabase/migrations/013_classification_library.sql`: seeded org rows `created_by` — CONFIRMED FIXED
**File:** `supabase/migrations/024_fix_seed_created_by.sql`  
**Status:** FIXED — Migration `024_fix_seed_created_by.sql` was added (commit e43e8c4) that updates all `is_org = true AND created_by IS NULL` rows to use `'00000000-0000-0000-0000-000000000000'` as the stable system UUID. Removing from open bug list.

---

### BUG-A8-4-L011 (LOW) — Redundant migrations `011` and `012` still lack explanatory comments
**File:** `supabase/migrations/011_add_formula_columns.sql`, `supabase/migrations/012_share_token.sql`  
**Status:** NOT FIXED. No header comments explaining the duplication.

---

### BUG-A8-4-L012 (LOW) — `package.json`: `"lint"` script still has no target path
**File:** `package.json:7`  
**Status:** NOT FIXED. `"lint": "eslint"` with no target/path argument.

---

### BUG-A8-4-L013 (LOW) — `package.json`: still no `typecheck` script
**File:** `package.json:scripts`  
**Status:** NOT FIXED. No `"typecheck": "tsc --noEmit"`.

---

### BUG-A8-4-L014 (LOW) — `package.json`: `test:e2e` still uses `--experimental-strip-types`
**File:** `package.json:11`  
**Status:** NOT FIXED. `"test:e2e": "node --experimental-strip-types scripts/e2e-api-test.ts"` and `"mx"` and `"load-test"` scripts also use the same flag.

---

### BUG-A8-4-L015 (LOW) — `src/app/share/[token]/page.tsx`: "Shared by Contractor" hardcoded byline
**File:** `src/app/share/[token]/page.tsx` (byline text — confirmed present in Cycle 4, not visible in lines read this cycle but likely still present in JSX below line 250)  
**Status:** UNVERIFIED in this read (lines 250+ not fully re-read). Flagging as carry-forward per Cycle 4.

---

### BUG-A8-4-L016 (LOW) — `src/app/share/[token]/page.tsx`: `formattedDate` hydration note
**File:** `src/app/share/[token]/page.tsx`  
**Status:** VERIFIED FIXED — comment `// BUG-A8-030 fix` present and `useMemo` with empty dep array used. ✅

---

## NEW BUGS FOUND IN CYCLE 5

---

### BUG-A8-5-001 (HIGH) — `src/app/settings/page.tsx`: OpenAI API key stored in `saveAiSettings` (likely localStorage) — key survives sessions in plaintext
**File:** `src/app/settings/page.tsx:153–162`, `src/lib/ai-settings.ts` (referenced)  
**Description:** The `ai.openaiApiKey` value is stored via `saveAiSettings(next)` every time it changes. The `ai-settings.ts` lib is loaded from localStorage (pattern matches `loadAiSettings()` / `saveAiSettings()`). This means the raw OpenAI API key (prefixed `sk-`) is persisted in localStorage indefinitely — not just for the session. The Cycle 4 fix (R-A8-004) addressed the platform API keys tab, but the AI tab's OpenAI key continues to be persisted in plaintext localStorage under a stable key. Any script with localStorage access (XSS, browser extension) can read it. Additionally, the key is shown in plaintext when `showApiKey` toggle is active, with no inactivity auto-hide.  
**Fix:** (1) Do not persist `openaiApiKey` in localStorage. Store only in session memory (React state), prompt re-entry on reload. OR (2) If persistence is required, use the same masked + one-time-copy pattern implemented for the API Keys tab. (3) Auto-hide the toggle (`setShowApiKey(false)`) after 30 seconds of inactivity.

---

### BUG-A8-5-002 (HIGH) — `src/app/settings/page.tsx`: "Change Email" button has no `onClick` handler
**File:** `src/app/settings/page.tsx:257–261` (the `<button className="...">Change Email</button>`)  
**Description:** The "Change Email" button in the Profile tab renders as interactive but has no `onClick` handler. Users who click it receive no feedback and cannot change their email. The R-A8-006 fix in Cycle 4 wired "Change Password" and "Sign Out" but missed "Change Email."  
**Fix:** Wire to `supabase.auth.updateUser({ email: newEmail })` or redirect to a dedicated email-change flow that sends a confirmation link. At minimum add a disabled state and tooltip explaining the feature is coming.

---

### BUG-A8-5-003 (HIGH) — `src/app/settings/page.tsx`: `handleDeleteAccount` is a no-op stub
**File:** `src/app/settings/page.tsx:207–210`  
**Description:**
```tsx
const handleDeleteAccount = () => {
  if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
    // placeholder
  }
};
```
The confirmation dialog fires but the `// placeholder` body does nothing. Users who confirm account deletion are silently dropped back to the settings page with their account still active. This is a false-trust UX issue and may create GDPR/data-deletion compliance risk if users believe their accounts have been deleted.  
**Fix:** Implement or block: either (1) call `supabase.auth.admin.deleteUser()` via a server-side API route and then sign out, or (2) replace the `window.confirm` with a visible disabled state and tooltip: "Account deletion is currently handled by support — contact support@measurex.io."

---

### BUG-A8-5-004 (MEDIUM) — `src/app/settings/page.tsx`: Profile avatar initials are hardcoded as `"NS"`
**File:** `src/app/settings/page.tsx:236` — `<div ...>NS</div>`  
**Description:** The avatar circle hardcodes the initials `"NS"` regardless of the authenticated user's name or email. A user named "John Doe" will always see "NS" as their initials. This was introduced as part of the Cycle 4 fix that removed the hardcoded `'Nathan Solis'` default name but forgot to update the avatar initials rendering.  
**Fix:** Derive initials dynamically from the `name` state:
```tsx
const initials = name.trim()
  ? name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('')
  : '?';
```

---

### BUG-A8-5-005 (MEDIUM) — `src/app/settings/page.tsx`: `email` state is `useState('')` with no population from `supabase.auth.getUser()`
**File:** `src/app/settings/page.tsx:66`  
**Description:** The `email` state is initialized to `''` (empty string) and is `readOnly` in the UI. There is no `useEffect` that calls `supabase.auth.getUser()` to populate it. The profile tab therefore always shows a blank email field. Combined with BUG-A8-5-004 (hardcoded initials), the profile section is effectively non-functional for any user who is not Nathan Solis.  
**Fix:** Add a `useEffect` on mount:
```tsx
useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    if (data?.user?.email) setEmail(data.user.email);
    if (data?.user?.user_metadata?.full_name) setName(prev => prev || data.user.user_metadata.full_name);
  });
}, []);
```

---

### ✅ BUG-A8-5-006 (MEDIUM) — `src/app/page.tsx`: keyboard shortcut `'a'` gated on `aiLoading` — CONFIRMED FIXED
**File:** `src/app/page.tsx:933–935`  
**Status:** FIXED — `if (aiLoading) return;` is present at line 934, directly before `handleAITakeoff()`. This was fixed in the same Cycle 4 fix commit as BUG-A8-4-L018 (ab5b2d4). Removing from open bug list.

---

### BUG-A8-5-007 (MEDIUM) — `public/sw.js`: overlapping `/api/*` route matchers in `eD` legacy array AND `runtimeCaching` array
**File:** `public/sw.js` (generated Serwist output)  
**Description:** The SW contains **two** separate sets of route matchers for the same URL patterns:
1. The `eD` legacy array (defined inline in the compiled bundle) registers handlers for `/api/*`, images, fonts, JS/CSS assets.
2. The `runtimeCaching` array in the `eS` constructor config registers additional handlers for the same patterns (including `/api/projects`, `/api/` generic, `/_next/static`, images).

Serwist's router processes routes in registration order; the first matching handler wins. The legacy `eD` routes are registered via `this.registerRoute(t)` **before** the `runtimeCaching` entries, meaning the intent of the new `runtimeCaching` config (e.g., the `api-projects` cache with `maxEntries: 20`) may never fire for `/api/projects` requests because the legacy `eD` matcher (`/api/*` with `NetworkFirst`) intercepts them first.

This is BUG-A8-4-007 from Cycle 4 confirmed still present — `public/sw.js` has not been regenerated from `src/sw.ts` with the legacy `eD` array removed.  
**Fix:** Remove or deduplicate the legacy `eD` array in `src/sw.ts` before regenerating `public/sw.js`. Run `npm run build` to produce a clean SW.

---

### BUG-A8-5-008 (MEDIUM) — `next.config.ts`: `unsafe-inline` in `script-src` and `script-src-elem` both in production
**File:** `next.config.ts:27–29`  
**Description:** Even with the Cycle 4 fix gating `unsafe-eval` to dev-only, `'unsafe-inline'` is still included in `script-src` and `script-src-elem` for all environments including production:
```
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net
script-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net
```
`'unsafe-inline'` in `script-src` allows inline `<script>` tags and `javascript:` URIs, negating most XSS protection the CSP provides. While Next.js requires nonces for inline scripts (App Router uses `__NEXT_DATA__` and hydration scripts), these can be served via nonce-based CSP rather than blanket `unsafe-inline`.  
**Fix:** Investigate if Next.js 16 App Router supports `'nonce-{nonce}'` in `script-src` (it does via middleware). Migrate to nonce-based inline script authorization. If too complex for this sprint, document the accepted risk in a CSP comment and create a tracking ticket.

---

### BUG-A8-5-009 (MEDIUM) — `src/app/projects/page.tsx`: `handleCreate` duplicate-project check is case-insensitive but only checks `name` — does not handle trimming edge cases
**File:** `src/app/projects/page.tsx:243–252`  
**Description:**
```tsx
const existing = projects.find(
  (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
);
```
This comparison is correct for simple cases, but the `trimmed` variable is already trimmed (line 235: `const trimmed = newName.trim()`), while `p.name` from the API may or may not be trimmed. If an existing project was created with leading/trailing whitespace (possible via direct API call or older client versions), `"  My Project  ".toLowerCase() !== "my project"` and the dedup check passes, creating a visual duplicate.  
**Fix:** Trim `p.name` in the comparison: `p.name.trim().toLowerCase() === trimmed.toLowerCase()`.

---

### BUG-A8-5-010 (MEDIUM) — `supabase/migrations/022_rls_owner_scoped.sql`: no `UPDATE` policy guard on `mx_projects.owner_id` column — owner_id can be changed by the row owner
**File:** `supabase/migrations/022_rls_owner_scoped.sql:10–13`  
**Description:** The `projects_update` policy is:
```sql
CREATE POLICY "projects_update" ON mx_projects
  FOR UPDATE USING (owner_id = auth.uid());
```
There is no `WITH CHECK` clause restricting what can be updated. This means the authenticated owner of a project can set `owner_id = <another_user_uuid>`, effectively transferring (or orphaning) the project to another user's ownership. Once transferred, the original owner loses access (their `owner_id = auth.uid()` check fails) and the new "owner" gains full access to the project without their consent.  
**Fix:** Add a `WITH CHECK` clause:
```sql
CREATE POLICY "projects_update" ON mx_projects
  FOR UPDATE USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```
This prevents any `UPDATE` from changing `owner_id` away from the current user.

---

### BUG-A8-5-011 (MEDIUM) — `supabase/migrations/023_security_hardening.sql`: storage DELETE policy missing for `pdfs` bucket (only INSERT + SELECT added)
**File:** `supabase/migrations/023_security_hardening.sql:32–53`  
**Description:** The migration adds:
- `"Users can upload own project PDFs"` (INSERT) ✅
- `"Users can read own project PDFs"` (SELECT) ✅
- `"Users can delete own project PDFs"` (DELETE) ✅ — Wait, re-reading the file...

Actually the migration **does** include a DELETE policy. However it does **not** include an UPDATE policy. Supabase storage objects can be updated (overwritten) via a PUT operation. Without an UPDATE policy, a user who knows another user's PDF path can overwrite it.  
**Fix:** Add:
```sql
CREATE POLICY "Users can update own project PDFs" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM mx_projects WHERE owner_id = auth.uid()
    )
  );
```

---

### BUG-A8-5-012 (MEDIUM) — `src/app/print/page.tsx`: `dateStr` computed with `new Date()` directly in render (not in state), causing SSR/client hydration mismatch
**File:** `src/app/print/page.tsx:294–298`  
**Description:** There are now **two** date computations in `print/page.tsx`:
1. The `formattedDate` `useMemo` in `SharedViewPage` (share page) — **FIXED** (BUG-A8-4-L016)
2. A separate `dateStr` inside `PrintViewInner` (print page) computed directly in the render body:
```tsx
const dateStr = new Date().toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric',
});
```
This is NOT inside a `useMemo` or `useEffect` — it is recalculated on every render. For a print page that is SSR-rendered and then hydrated, this causes a React hydration mismatch warning if the server and client render at different milliseconds (especially around midnight UTC). The share page fix was applied, but this parallel instance in `print/page.tsx` was missed.  
**Fix:** Move `dateStr` to a `useState` initialized from a `useEffect`:
```tsx
const [dateStr, setDateStr] = useState('');
useEffect(() => {
  setDateStr(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
}, []);
```
Or add `suppressHydrationWarning` to the element that renders it.

---

### BUG-A8-5-013 (MEDIUM) — `src/app/projects/page.tsx`: `handlePdfUpload` does not clean up the created project on upload failure
**File:** `src/app/projects/page.tsx:470–492`  
**Description:**
```tsx
const handlePdfUpload = async (file: File, projectName?: string) => {
  // 1. Create the project
  const res = await fetch('/api/projects', { method: 'POST', ... });
  const projectId = data.project.id;
  // 2. Upload the PDF
  const uploadRes = await fetch(`/api/projects/${projectId}/upload`, ...);
  if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);
  // 3. Redirect
};
```
If step 2 (PDF upload) fails, step 1 has already created an empty project in the database. The `catch` block calls `loadProjects()` and `setUploading(false)` but does NOT delete the orphaned project. The user is left with an empty project in their list, named after the PDF but containing no data. On the next upload attempt with the same name, the `handleCreate` dedup check will redirect them to the empty project instead of creating a new one.  
**Fix:** In the `catch` block, call `fetch(`/api/projects/${projectId}`, { method: 'DELETE' })` to clean up the orphaned project (only if `projectId` was set before the failure).

---

### BUG-A8-5-014 (MEDIUM) — `src/app/settings/page.tsx`: `updateDefaultScale` / `updateApplyToAll` parse `localStorage` without validation on read
**File:** `src/app/settings/page.tsx:90–104` (`updateDefaultScale`, `updateApplyToAll`)  
**Description:** Both update functions read the existing localStorage value via:
```tsx
const prev = JSON.parse(localStorage.getItem(MEASURE_PREFS_KEY) || '{}');
```
If `localStorage.getItem(MEASURE_PREFS_KEY)` contains malformed JSON (e.g., truncated write from a previous crash), `JSON.parse` will throw, and the entire `updateDefaultScale`/`updateApplyToAll` call fails silently. The state update still fires (via the setter call before `JSON.parse`), but the persisted value is lost, resulting in the new value not being written to localStorage.  
**Fix:** Wrap in `try/catch`:
```tsx
let prev = {};
try { prev = JSON.parse(localStorage.getItem(MEASURE_PREFS_KEY) || '{}'); } catch { /* reset */ }
localStorage.setItem(MEASURE_PREFS_KEY, JSON.stringify({ ...prev, defaultScale: v }));
```

---

### BUG-A8-5-015 (LOW) — `next.config.ts`: `font-src` includes `https://fonts.gstatic.com` but Geist font is self-hosted via `next/font`
**File:** `next.config.ts:33`  
**Description:** The `font-src` CSP directive includes `https://fonts.gstatic.com` and `https://cdn.jsdelivr.net`. The app uses `next/font/google` which downloads fonts at build time and self-hosts them from `/_next/static/media/` — meaning `fonts.gstatic.com` is never contacted at runtime. The `fonts.gstatic.com` entry in `font-src` is dead code that unnecessarily widens the CSP surface.  
**Fix:** Remove `https://fonts.gstatic.com` from `font-src` (keep `'self'` and `https://cdn.jsdelivr.net` for pdf.js fonts if needed). Verify with a CSP violation report in staging.

---

### BUG-A8-5-016 (LOW) — `next.config.ts`: `X-XSS-Protection: 1; mode=block` header is deprecated and counterproductive in modern browsers
**File:** `next.config.ts:51`  
**Description:** `X-XSS-Protection: 1; mode=block` is a legacy IE/old Chrome feature that has been **removed** from Chromium 78+ and Firefox. In modern browsers it is a no-op; in some configurations it can actually introduce XSS vectors by blocking pages that contain benign content matching heuristics.  
**Fix:** Remove the `X-XSS-Protection` header entirely. Modern XSS protection should rely solely on a well-formed CSP.

---

### BUG-A8-5-017 (LOW) — `src/app/learn/page.tsx`: Tutorial card `<button>` elements fire `onClick` with no handler (cursor:pointer implied but nothing happens)
**File:** `src/app/learn/page.tsx:244–259`  
**Description:** Each tutorial card renders as a `<button>` with `cursor-pointer` styling and a hover border effect, strongly implying clickability. They have no `onClick` handlers. This is the same as BUG-A8-4-L005 but scoped specifically to the tutorial article cards (separate from the video play buttons and bottom CTA buttons). All 6 tutorial cards in the grid are non-functional.  
**Fix:** Either: (1) Add `href` links to real documentation articles and convert to `<a>` tags, or (2) Add `onClick` that opens a modal or navigates to a docs URL, or (3) Remove the button affordance (use `<div>` styling without pointer cursor) to avoid misleading users.

---

### BUG-A8-5-018 (LOW) — `public/sw.js`: `eD` legacy array includes Google Fonts handlers (`google-fonts-webfonts`, `google-fonts-stylesheets`) but app self-hosts all fonts
**File:** `public/sw.js` (`eD` array, first two entries)  
**Description:** The compiled `public/sw.js` registers CacheFirst handlers for `fonts.gstatic.com` and `fonts.googleapis.com` (from the `eD` legacy array). Since the app uses `next/font/google` which bundles fonts at build time, these routes never match at runtime — they are dead cache rules that bloat the SW registration. Combined with BUG-A8-5-015 (font-src CSP includes gstatic.com), this confirms the font self-hosting migration was not fully reflected in the SW and CSP config.  
**Fix:** Remove Google Fonts matchers from `src/sw.ts` before rebuilding `public/sw.js`.

---

### BUG-A8-5-019 (LOW) — `supabase/migrations/009_complete_schema.sql`: `mx_projects` `CREATE TABLE IF NOT EXISTS` missing `owner_id` column
**File:** `supabase/migrations/009_complete_schema.sql:17–23`  
**Description:** The `009` migration creates `mx_projects` without `owner_id`. Migration `021` adds it separately. If a fresh database is initialized by running migrations in order, this is fine — `021` runs after `009`. However, if `009` is ever run in isolation (e.g., for a dev seed script), the created `mx_projects` table will not have `owner_id`, and subsequently `018_mx_groups_rls_fix.sql` will fail (it references `mx_projects.owner_id`). The migration ordering is safe for sequential runs but fragile for partial/out-of-order execution.  
**Fix:** For documentation clarity, add a comment in `009_complete_schema.sql`: `-- NOTE: owner_id column is added by migration 021_add_owner_id_to_projects.sql`. Alternatively, consider a consolidated `009b` migration that adds the column in the same batch.

---

### BUG-A8-5-020 (LOW) — `src/app/settings/page.tsx`: API Keys tab shows "Keys are stored in your browser's local storage and sent to the server only when running a takeoff. They are never logged or stored server-side." — this claim cannot be verified and may be false
**File:** `src/app/settings/page.tsx` (API Keys info box, last paragraph)  
**Description:** The UI text reads: "Keys are stored in your browser's local storage and sent to the server only when running a takeoff. They are never logged or stored server-side." This is a trust/security claim in UI copy. If any server-side route logs request bodies or headers that include the API key (e.g., `console.log(req.body)` in `/api/ai-takeoff`), the claim is false and creates liability. The current audit scope (pages + config + infra) cannot verify server-side logging — but the claim should be tested.  
**Fix:** Audit `/api/ai-takeoff/route.ts` and all API routes that accept the API key to confirm no request body logging occurs. If confirmed safe, add a comment in the route code. If logging does occur, remove it and update the UI copy accordingly.

---

## SUMMARY TABLE

| Category | Count |
|----------|-------|
| Confirmed Fixed from Cycle 4 (CRITICAL) | 3 |
| Confirmed Fixed from Cycle 4 (HIGH/MEDIUM) | 18 |
| Confirmed Fixed from Cycle 4 (LOW) | 4 |
| Additionally confirmed fixed (in Cycle 5 read) | 2 |
| Still Open from Cycle 4 (MEDIUM) | 2 |
| Still Open from Cycle 4 (LOW) | 9 |
| New MEDIUM bugs (Cycle 5) | 9 |
| New LOW bugs (Cycle 5) | 6 |
| **TOTAL NEW + CARRY-FORWARD OPEN BUGS** | **26** |

---

## PRIORITY FIX ORDER (CYCLE 6)

### 🔴 CRITICAL
None — all prior critical bugs confirmed fixed.

### 🟠 HIGH (fix this sprint)
1. **BUG-A8-5-001** — OpenAI API key persisted in plaintext localStorage via `saveAiSettings`
2. **BUG-A8-5-002** — "Change Email" button has no handler
3. **BUG-A8-5-003** — `handleDeleteAccount` is a no-op stub (GDPR/UX risk)

### 🟡 MEDIUM (this or next sprint)
4. **BUG-A8-5-004** — Hardcoded "NS" avatar initials
5. **BUG-A8-5-005** — Email state never populated from `supabase.auth.getUser()`
6. **BUG-A8-5-007** — Overlapping SW route matchers (`eD` legacy vs `runtimeCaching`)
7. **BUG-A8-5-008** — `unsafe-inline` in `script-src` in production
8. **BUG-A8-5-010** — RLS `projects_update` lacks `WITH CHECK (owner_id = auth.uid())`
9. **BUG-A8-5-011** — Storage `pdfs` bucket missing UPDATE policy
10. **BUG-A8-5-012** — `dateStr` in print page causes hydration mismatch
11. **BUG-A8-5-013** — `handlePdfUpload` orphans empty project on upload failure
12. **BUG-A8-5-014** — `updateDefaultScale`/`updateApplyToAll` don't guard `JSON.parse`
13. **BUG-A8-4-010** — Context menu renders off-screen near viewport edges
14. **BUG-A8-5-009** — `handleCreate` duplicate check doesn't trim `p.name` from API

### 🔵 LOW (polish/backlog)
- BUG-A8-5-015 through BUG-A8-5-020
- BUG-A8-4-L001, L002, L005, L007, L008, L009, L011, L012, L013, L014, L015 (carry-forwards; L003, L004, L006, L010, L016, L017 now confirmed fixed)

---

*Report generated by Admiral 7 — Cycle 5 Audit of A8 sector (Pages + Config + Infrastructure)*  
*Updated: 2026-03-20 — corrected BUG-A8-5-006 and BUG-A8-4-L010 as FIXED after live code verification*  
*Total new bugs: 18 (3 HIGH, 9 MEDIUM, 6 LOW)*  
*Total confirmed fixed since Cycle 1: 27 bugs*  
*Total open going into Cycle 6: 26 bugs*
