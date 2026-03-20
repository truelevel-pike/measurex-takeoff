# AUDIT REPORT — A8 CYCLE 3
**Repo:** measurex-takeoff  
**Scope:** Pages + Config + Infra  
**Date:** 2026-03-20  
**Engineers:** E36 (001–030), E37 (031–060), E38 (061–090), E39 (091–115), E40B (121–160)  
**Total bugs found:** 155

---

## SEVERITY SUMMARY

| Severity | Count |
|----------|-------|
| CRITICAL | 9 |
| HIGH | 53 |
| MEDIUM | 56 |
| LOW | 37 |

---

## SECTION 1 — src/app/page.tsx + layout.tsx + error.tsx (E36)

BUG-A8-3-001: src/app/page.tsx:383 HIGH No validation or sanitization of the `project` URL search parameter — `search.get('project')` is used directly as a project ID passed into fetch URLs (`/api/projects/${pid}`), localStorage, and `window.history.replaceState`, enabling path traversal or URL injection if the API does not enforce ownership/format

BUG-A8-3-002: src/app/page.tsx:383 HIGH `localStorage.getItem('measurex_project_id')` is used without any format validation as a project ID; a malicious or corrupted value could inject arbitrary path segments into API fetch calls

BUG-A8-3-003: src/app/page.tsx:556 HIGH `window.history.replaceState({}, '', `/?project=${project.id}`)` — `project.id` from the API response is injected into the URL without `encodeURIComponent`, potentially allowing open-redirect or URL manipulation if the server returns an unexpected value

BUG-A8-3-004: src/app/page.tsx:628 HIGH `window.history.replaceState({}, '', `/?project=${data.project.id}`)` in `handleSave` — same unencoded injection of API-returned project ID into the URL

BUG-A8-3-005: src/app/page.tsx:672 MEDIUM `printUrl` constructs `/print?projectId=${projectId}&name=${encodeURIComponent(name)}&page=${currentPageNum}` — `projectId` is not passed through `encodeURIComponent`; if projectId contains special characters, this corrupts the URL or could be abused

BUG-A8-3-006: src/app/page.tsx:383-386 MEDIUM No project ID format/UUID validation before calling `hydrateProject(pid)` — there is no regex or length check ensuring the ID is a valid UUID or safe string; arbitrary values from URL params or localStorage are accepted

BUG-A8-3-007: src/app/page.tsx:444 MEDIUM `hydrateProject` calls `fetch('/api/projects/${pid}', ...)` with an unvalidated `pid`; if `pid` contains path traversal characters (e.g., `../../admin`), the constructed URL will target an unintended endpoint

BUG-A8-3-008: src/app/page.tsx:509 MEDIUM `localStorage.setItem('measurex_project_id', DEMO_PROJECT_ID)` and all other `localStorage.setItem('measurex_project_id', ...)` calls store the project ID without integrity protection; a cross-origin script or XSS could tamper with this value to redirect hydration

BUG-A8-3-009: src/app/page.tsx:719-724 MEDIUM `handleAITakeoff` silently `console.error`s and shows a status string derived from `error.message` directly in the UI (`setAiStatus(`Error: ${error instanceof Error ? error.message : 'AI failed'}`)`) — error messages from API failures may leak internal server details to the user

BUG-A8-3-010: src/app/page.tsx:811 MEDIUM `handleAITakeoffAllPages` similarly exposes raw `err.message` from network/API errors directly in the UI via `setAiPageStatuses` `errorMsg` field, leaking internal error details

BUG-A8-3-011: src/app/page.tsx:469-473 MEDIUM Demo project hydration path calls `saveDemoProject()` then `loadDemoProject()` but neither return value is null-checked before accessing `.state`; if `loadDemoProject()` returns null, `demo?.state` is `undefined` and falls back silently, but `demo?.meta?.name` could fail in edge cases

BUG-A8-3-012: src/app/page.tsx:415-418 LOW `reloadProjectPolygonsAndClassifications` uses `Promise.all` with `fetch().catch(() => null)` — if both fetches fail, `classRes` and `polyRes` are `null`, causing the `!classRes?.ok` check to throw on `throw new Error(...)` but the `await classRes.json()` line after it would also throw a null dereference; the error is propagated but the null check is incomplete

BUG-A8-3-013: src/app/page.tsx:535-538 LOW `flushSave` silently swallows save errors with `persistSaveStatus` but does not propagate the error or offer retry for data loss scenarios; if the save fails repeatedly, the user may not notice data is lost beyond a transient status message

BUG-A8-3-014: src/app/page.tsx:383 LOW `useEffect` depends on `[search, hydrateProject]` — `hydrateProject` is defined with `useCallback` but its identity changes if `setCurrentPage` or `setSheetName` change (store selectors), potentially causing duplicate hydration calls on re-render

BUG-A8-3-015: src/app/page.tsx:370-373 LOW `knownPolygonIds`, `knownClassificationIds`, and `syncedClassificationsById` refs are initialized inline using `useStore.getState()` calls at render time — this runs before effects, but calling `useStore.getState()` in the render body (outside a selector) bypasses subscription and could read stale state in concurrent renders

BUG-A8-3-016: src/app/page.tsx:602 LOW `onFileChange` handler does not prevent the same file from being re-uploaded when the user selects the same file again (no input reset / `e.target.value = ''`), potentially causing stale state if the user re-uploads the same PDF after a failed upload

BUG-A8-3-017: src/app/page.tsx:689-695 LOW `handleAITakeoff` keyboard shortcut (`e.key === 'a'`) is always triggered even when `aiLoading` is true, allowing the user to queue multiple simultaneous AI takeoff requests via keyboard

BUG-A8-3-018: src/app/page.tsx:543-548 LOW `requestAutoSave` schedules `flushSave` with a 1200ms debounce, but `autosaveFingerprint` includes `projectId` — if `projectId` changes (new project created), a pending autosave for the old project could fire after `projectId` is already updated in the closure, saving to the new project with stale data

BUG-A8-3-019: src/app/page.tsx:587 LOW `pendingPageTextRef.current` is flushed in a `useEffect` on `projectId` change, but the flush fires `fetch` calls without awaiting them or tracking success; if any flush fetch fails, page text is silently lost with no retry

BUG-A8-3-020: src/app/page.tsx:493-498 LOW Auto-fetch of stored PDF (`fetch('/api/projects/${pid}/pdf', ...)`) catches all errors with `.catch(() => null)` — no distinction between 404 (PDF not uploaded) and network/auth errors; both silently fall through to the re-upload prompt without informing the user of authentication failures

BUG-A8-3-021: src/app/layout.tsx:28-36 MEDIUM OpenGraph metadata is missing `og:image`, `og:url`, and `og:site_name` tags — these are required for proper social media link previews (Slack, Twitter, Facebook unfurls will show no image)

BUG-A8-3-022: src/app/layout.tsx:28-36 LOW OpenGraph metadata is missing `twitter:card`, `twitter:title`, `twitter:description` Twitter-specific meta tags — Twitter/X will not render a rich card preview for shared links

BUG-A8-3-023: src/app/layout.tsx:39-46 LOW `generateViewport` sets `maximumScale: 1` which prevents pinch-to-zoom on mobile — this is an accessibility violation (WCAG 1.4.4) as it prevents users with low vision from zooming

BUG-A8-3-024: src/app/layout.tsx:50 LOW `<html lang="en">` hardcodes the language to English with no mechanism for i18n or dynamic locale — this is low severity but will cause accessibility issues if the app is ever localized

BUG-A8-3-025: src/app/error.tsx:1 MEDIUM The file is named `error.tsx` (app-level error boundary) but the exported component is named `GlobalError` — in Next.js App Router, the top-level error boundary for root layout must use `global-error.tsx` with an `<html>` and `<body>` wrapper; naming it `error.tsx` means it does NOT catch errors in the root layout, leaving the root layout unprotected

BUG-A8-3-026: src/app/error.tsx:14 HIGH The `reset` function is called via `onClick={reset}` but there is no guard preventing repeated rapid clicks — clicking "Try again" multiple times in rapid succession can trigger multiple concurrent reset/re-render attempts, potentially causing an infinite error loop if the underlying cause persists

BUG-A8-3-027: src/app/error.tsx:8 MEDIUM `captureError` is called in a `useEffect` with `[error]` dependency, but if `captureError` itself throws (e.g., the error tracker is down), the error is unhandled and will bubble to the browser as an uncaught exception in the error boundary itself, potentially causing a blank screen

BUG-A8-3-028: src/app/error.tsx:1-28 LOW The error UI renders with `m-8` margin and `rounded-lg` in a small `div` — if this is used as a full-page error boundary (root-level), the page will not fill the screen and will look broken; there is no `h-screen` / `min-h-screen` wrapper for a full-page fallback

BUG-A8-3-029: src/app/error.tsx:19 LOW The error message shown to users ("Something went wrong.") gives no actionable detail or error reference (e.g., `error.digest`) — the `digest` field is captured in `captureError` but never shown to the user, making it impossible for users to report the specific error to support

BUG-A8-3-030: src/app/page.tsx:670 LOW `onPrintBlueprint` uses `encodeURIComponent(name)` for the project name but `projectId` is interpolated directly without encoding; additionally `currentPageNum` is a number (safe), but the overall print URL is opened via `window.open` without any same-origin validation, allowing a crafted projectId to redirect to an arbitrary path

---

## SECTION 2 — App Pages: projects, settings, library, learn, print (E37)

BUG-A8-3-031: src/app/projects/page.tsx:304 HIGH Missing error handling in handlePdfUpload — if the upload step (step 2) fails, `setUploading(false)` is only called in the catch block but NOT in the finally block; if the router.push succeeds after a failed loadProjects, the spinner never clears under some race conditions

BUG-A8-3-032: src/app/projects/page.tsx:304 HIGH handlePdfUpload has no finally block — `setUploading(false)` is called only in the catch handler; on success the spinner is never explicitly dismissed before navigation, leaving it visible if router.push is slow or fails silently

BUG-A8-3-033: src/app/projects/page.tsx:348 MEDIUM handlePageDrop references handlePdfUpload via closure but handlePdfUpload is defined AFTER the useCallback hooks that reference it — dependency array of handlePageDrop does not include handlePdfUpload, causing stale closure capture of the upload function

BUG-A8-3-034: src/app/projects/page.tsx:362 MEDIUM nameFromFile is a plain function defined inside the component on every render but not memoized; while not a bug per se, it is captured in handlePdfUpload (also un-memoized) and will cause unnecessary recalculation; combined with handlePdfUpload being called from multiple paths this creates inconsistency

BUG-A8-3-035: src/app/projects/page.tsx:248 HIGH handleCreate calls handlePdfUpload with `await` but handleCreate itself is not in a try/catch around that await — if handlePdfUpload throws (e.g. network error), the error propagates to an unhandled promise rejection since handleCreate's outer try/catch block returns early before the await

BUG-A8-3-036: src/app/projects/page.tsx:232 MEDIUM Duplicate name check is case-insensitive but only checks loaded client-side project list — a project created in another tab or by another user between the check and the POST will still result in a duplicate name with no server-side uniqueness enforcement surfaced to the user

BUG-A8-3-037: src/app/projects/page.tsx:94 LOW localStorage data (starred IDs, folders, tags) is never validated after JSON.parse — malformed data (e.g. non-array for starred) passed to `new Set()` will throw a silent runtime error; the catch blocks swallow these errors without user notification

BUG-A8-3-038: src/app/projects/page.tsx:437 MEDIUM Context menu is positioned using fixed pixel coordinates from mouse event (clientX/clientY) with no viewport boundary clamping — the menu can render off-screen on small displays or when right-clicking near the right/bottom edge

BUG-A8-3-039: src/app/projects/page.tsx:437 LOW Context menu has no keyboard accessibility (no role="menu", no aria-expanded, no keyboard navigation/focus trapping) — violates WCAG 2.1 AA

BUG-A8-3-040: src/app/projects/page.tsx:1 CRITICAL No authentication check anywhere in the page — any unauthenticated user who can reach /projects will see and be able to create/delete/upload projects; there is no redirect to login, no session check, no auth guard

BUG-A8-3-041: src/app/settings/page.tsx:1 CRITICAL No authentication check in SettingsPage — the page renders fully for unauthenticated users; the hardcoded email `nathan@measurex.io` and name `Nathan Solis` are exposed as defaults to any visitor

BUG-A8-3-042: src/app/settings/page.tsx:44 HIGH OpenAI API key is stored in localStorage via `saveAiSettings` and rendered in a password input — the key is accessible to any JS running on the page (XSS vector) and is never cleared on session end; no warning is shown to the user about this risk

BUG-A8-3-043: src/app/settings/page.tsx:97 HIGH API Keys tab stores raw API key values in React state and localStorage (`apiKeys` state, `addApiKey`) — full key values are kept in memory and localStorage unmasked; the display mask is cosmetic only; Copy button copies full plaintext key via clipboard API without any user confirmation

BUG-A8-3-044: src/app/settings/page.tsx:60 MEDIUM `defaultScale` and `applyToAll` states are managed locally but never persisted (no localStorage save, no API call) — changes are silently lost on page reload with no user feedback

BUG-A8-3-045: src/app/settings/page.tsx:64 MEDIUM MeasurementSettings `ms` is initialized via `loadMeasurementSettings()` which reads localStorage — if `ms` is null (first run or cleared storage), the entire Measurements tab renders nothing with no fallback UI or error message

BUG-A8-3-046: src/app/settings/page.tsx:75 LOW `teamName` state is never persisted — Organization tab has an editable team name input but no save button and no persistence mechanism; changes are always lost

BUG-A8-3-047: src/app/settings/page.tsx:160 LOW "Change Email" and "Change Password" buttons are non-functional placeholders with no onClick handlers — clicking them does nothing, which could confuse users expecting account management functionality

BUG-A8-3-048: src/app/settings/page.tsx:188 LOW "Sign Out" button has no onClick handler — it is a completely non-functional placeholder; users cannot sign out from the Settings page

BUG-A8-3-049: src/app/settings/page.tsx:82 MEDIUM `addApiKey` uses `Math.random().toString(36).slice(2)` for ID generation — not cryptographically random and has collision risk; `crypto.randomUUID()` should be used instead

BUG-A8-3-050: src/app/library/page.tsx:1 CRITICAL No authentication check — the library page reads from and writes to Supabase `mx_classification_library` using the client-side supabase instance; if RLS is misconfigured or anonymous access is enabled, unauthenticated users can read all library items and create/delete records

BUG-A8-3-051: src/app/library/page.tsx:68 HIGH `handleCreate` calls `supabase.auth.getUser()` to get `userId` but does not check for auth error or null user before inserting — `userId` will be null for unauthenticated users, and the insert will proceed with `created_by: null`, silently treating the item as an org-level record

BUG-A8-3-052: src/app/library/page.tsx:56 MEDIUM The error shown ("Supabase not configured") when `isConfigured()` returns false gives no actionable guidance to the user — no link to docs, no setup instructions

BUG-A8-3-053: src/app/library/page.tsx:130 MEDIUM `handleDelete` performs an optimistic UI update with no rollback on error — if the Supabase delete fails (RLS rejection, network error), the item disappears from the UI but still exists in the database; no retry or refresh is triggered

BUG-A8-3-054: src/app/library/page.tsx:143 MEDIUM `handleImportOpen` fetches projects every time the import modal opens — no caching or deduplication; rapid open/close will fire multiple concurrent `/api/projects` requests

BUG-A8-3-055: src/app/library/page.tsx:163 HIGH `handleImportConfirm` error path calls `setImportItem(null)` (closes the modal) before the user can see or act on the error — the error is shown in the global error banner but the modal closes immediately, making it unclear which import failed

BUG-A8-3-056: src/app/learn/page.tsx:1 LOW No authentication check — the Learn page is fully static content, but it links back to /projects and presents product feature details; if authentication is required for the product, this page should either be explicitly documented as public or guard access consistently with other pages

BUG-A8-3-057: src/app/learn/page.tsx:209 LOW Tutorial cards and Video Guide play buttons have no onClick handlers and no href — clicking them does nothing; they appear interactive (cursor pointer, hover styles, ArrowRight icon) but are dead UI with no functionality

BUG-A8-3-058: src/app/learn/page.tsx:228 LOW "Help Center" and "Contact Support" buttons have no onClick handlers — completely non-functional placeholders that appear as actionable CTAs

BUG-A8-3-059: src/app/print/page.tsx:137 HIGH svgScale computation depends on `canvasRef.current?.width` inside a `useMemo` with `[state]` dependency — canvasRef.current is a mutable ref and React does not track ref mutations; svgScale will be stale (value 1) until the next state change, causing SVG overlay polygons to render at wrong scale on initial PDF load

BUG-A8-3-060: src/app/print/page.tsx:1 MEDIUM No print media query for `@page size` orientation guard — the `@page { size: landscape; }` rule forces all prints to landscape regardless of drawing aspect ratio; portrait drawings will be rendered sideways with no user control or auto-detection of optimal orientation

---

## SECTION 3 — Share Page + next.config.ts + vercel.json (E38)

BUG-A8-3-061: src/app/share/[token]/page.tsx:60 CRITICAL No token validation or expiry check performed on the client side before issuing the fetch — the API is the sole gatekeeper; if the API route lacks expiry enforcement the share link is permanently valid

BUG-A8-3-062: src/app/share/[token]/page.tsx:60 HIGH No rate limiting on the client-side fetch to /api/share/[token] — an attacker can enumerate tokens in a tight loop with no throttle or backoff

BUG-A8-3-063: src/app/share/[token]/page.tsx:60 HIGH Token is taken directly from useParams() without any format/length validation — any arbitrary string is forwarded to the API, enabling potential path traversal or injection if the API constructs a DB query naively

BUG-A8-3-064: src/app/share/[token]/page.tsx:104 HIGH JSON export and PDF export use window.open() with a user-controlled token in the URL — no sanitisation of the token before interpolation; if token contains special chars this can produce malformed URLs or open-redirect risk

BUG-A8-3-065: src/app/share/[token]/page.tsx:104 MEDIUM window.open() for JSON/PDF export opens in a new tab with the share token fully visible in the URL and without rel="noopener noreferrer" semantics, leaking the token to the opened page via Referer header

BUG-A8-3-066: src/app/share/[token]/page.tsx:116 MEDIUM The anchor element `<a href={`/?project=${project.id}`}>` exposes the internal project UUID to any public viewer of the share link — no access control on the project ID

BUG-A8-3-067: src/app/share/[token]/page.tsx:148 LOW The `formattedDate` memo uses `new Date()` evaluated at render time on the client; on SSR this will differ from server render time, causing a hydration mismatch warning

BUG-A8-3-068: src/app/share/[token]/page.tsx:104 MEDIUM `handleExport` for json/pdf formats calls window.open() without checking res.ok or handling errors — export failures are silently swallowed with no user feedback

BUG-A8-3-069: src/app/share/[token]/page.tsx:1 HIGH Page is marked `'use client'` — the share token fetch runs entirely in the browser, meaning no server-side authentication or session check occurs before the page is rendered; an unauthenticated user receives the full page shell including the project name before the API validates the token

BUG-A8-3-070: src/app/share/[token]/page.tsx:40 MEDIUM `project.state` fields (polygons, classifications) are used with no defensive checks — if the API returns a malformed or partial payload (e.g., missing `polygons` array), `.filter()` and `.reduce()` calls will throw uncaught TypeErrors at runtime

BUG-A8-3-071: src/app/share/[token]/page.tsx:116 LOW The `<a href={`/?project=${project.id}`}>` links allow any visitor to attempt loading a project directly in the editor via its UUID, potentially bypassing share-only access if the editor does not enforce auth

BUG-A8-3-072: src/app/share/[token]/page.tsx:375 LOW "Shared by Contractor" is a hardcoded string — it does not reflect the actual sharer's identity, which is misleading and could be used socially to create false trust

BUG-A8-3-073: next.config.ts:30 HIGH `connect-src` falls back to `https://*.supabase.co` (wildcard subdomain) when `NEXT_PUBLIC_SUPABASE_URL` is not set — overly broad; could allow connections to any Supabase tenant

BUG-A8-3-074: next.config.ts:31 HIGH `connect-src` uses `process.env.NEXT_PUBLIC_APP_HOST` with fallback `localhost:3000` — if this env var is not set in production, the CSP will be built with `wss://localhost:3000`, which is wrong/useless in production

BUG-A8-3-075: next.config.ts:30 MEDIUM `connect-src` does not whitelist `https://cdn.jsdelivr.net`, which is listed in `script-src`, `style-src`, `font-src`, and `worker-src` — any fetch() or XHR to that CDN (e.g., by pdf.js) will be blocked by CSP

BUG-A8-3-076: next.config.ts:28 MEDIUM `script-src` includes `'unsafe-eval'` globally — this defeats CSP protections against injected scripts and is unnecessary for production

BUG-A8-3-077: next.config.ts:28 MEDIUM `script-src` includes `'unsafe-inline'` — combined with `'unsafe-eval'` this renders the entire script-src CSP directive effectively useless against XSS

BUG-A8-3-078: next.config.ts:1 MEDIUM No environment variable validation at startup — critical vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_APP_HOST`, etc.) are consumed with `?? fallback` but never asserted to be present; a misconfigured deployment silently runs with wrong/insecure defaults

BUG-A8-3-079: next.config.ts:33 LOW `worker-src` includes `https://cdn.jsdelivr.net` — allowing workers to be loaded from a third-party CDN is a supply-chain risk; a compromised CDN asset could run arbitrary code in a worker context

BUG-A8-3-080: next.config.ts:35 LOW `script-src-elem` includes `'unsafe-inline'` — inline script elements bypass CSP nonce/hash protections

BUG-A8-3-081: next.config.ts:1 LOW No `Strict-Transport-Security` (HSTS) header is set — without HSTS, the app is vulnerable to SSL stripping attacks on first connection

BUG-A8-3-082: next.config.ts:1 LOW No `Cross-Origin-Embedder-Policy` or `Cross-Origin-Opener-Policy` headers set — required for SharedArrayBuffer (used by some pdf.js builds) and recommended for isolation against Spectre-class side-channel attacks

BUG-A8-3-083: vercel.json:7 HIGH The `/api/share/[token]` and `/api/share/[token]/export` routes have no `maxDuration` set — they default to Vercel's platform default (10s on Hobby, 15s on Pro), which may be insufficient for large projects and also means no explicit timeout guard against runaway DB queries

BUG-A8-3-084: vercel.json:7 MEDIUM `/api/projects/[id]/upload` has `memory: 1024` (1 GB) but no other API routes have memory configured — large PDF processing in other routes (e.g., ai-takeoff) may silently OOM with the default limit

BUG-A8-3-085: vercel.json:1 MEDIUM Deployment is pinned to a single region (`iad1`) with no failover configuration — a regional outage will make the entire application unavailable with no redundancy

BUG-A8-3-086: vercel.json:40 LOW `"rewrites": []` is present as an empty array — if a rewrite rule was accidentally deleted (e.g., for `/api/share` proxy or auth middleware), the omission could cause silent 404s on routes that formerly worked

BUG-A8-3-087: vercel.json:1 LOW No `outputDirectory` is specified — relies on Next.js default `.next`; if the build pipeline ever changes output dir, deployment will silently serve stale or incorrect files

BUG-A8-3-088: vercel.json:43 LOW `NEXT_TELEMETRY_DISABLED` is set via `env` block (build-time env) — runtime telemetry (if any) requires it in `build.env` or as a Vercel project env var; the intent may not be fully achieved

BUG-A8-3-089: next.config.ts:1 LOW `img-src` allows `https:` (all HTTPS image sources) — this is overly broad; images should be restricted to known domains (Supabase storage, CDN) to prevent data exfiltration via CSS/image injection

BUG-A8-3-090: src/app/share/[token]/page.tsx:104 LOW `URL.createObjectURL(blob)` object URL is revoked immediately after `a.click()` — on some browsers the click is asynchronous and the download may fail because the object URL is already revoked before the browser processes the click event

---

## SECTION 4 — PWA + package.json (E39)

BUG-A8-3-091: public/sw.js:1 HIGH sw.js is fully minified/bundled with no source map reference — makes security review, debugging, and future audits of the service worker logic practically impossible in production

BUG-A8-3-092: public/sw.js:1 HIGH All precache entries use `'revision':null` for Next.js chunk URLs that do NOT embed a content hash in the filename — any entry with a non-hashed URL and null revision will never be cache-busted on redeploy

BUG-A8-3-093: public/sw.js:1 MEDIUM The `/api/auth/.*` route is handled by `NetworkOnly` with a 10-second timeout but NO error handler or offline fallback — failed auth requests silently drop rather than returning a meaningful offline error to the user

BUG-A8-3-094: public/sw.js:1 MEDIUM The catch-all last runtime route uses `NetworkOnly` with no `networkTimeoutSeconds` set — requests matching this catch-all can hang indefinitely with no offline fallback

BUG-A8-3-095: public/sw.js:1 MEDIUM The `eD` (legacy runtimeCaching array) and the inline `runtimeCaching` array both define overlapping matchers for `/api/*`, images, JS, CSS, and Next.js static assets — duplicate/conflicting route registration means the first-registered handler silently wins and the intended handler may never run

BUG-A8-3-096: public/sw.js:1 MEDIUM The `/api/projects` cache uses `NetworkFirst` with `maxAgeSeconds:86400` but no `networkTimeoutSeconds` — on a slow connection the SW will wait for the network indefinitely before falling back to cache

BUG-A8-3-097: public/sw.js:1 LOW `skipWaiting:true` + `clientsClaim:true` means a new SW activates and claims all tabs immediately without user consent — this can cause half-updated UI states if a page loaded with the old SW suddenly has its fetch interception switched mid-session

BUG-A8-3-098: public/sw.js:1 LOW `navigationPreload:true` is enabled but there is no explicit `handlerDidError` fallback registered for navigation requests — if preload fails and network is unavailable, navigation will throw with no offline page served

BUG-A8-3-099: public/manifest.json:7 HIGH No maskable icon is declared — both icons lack `"purpose": "maskable"`, causing Android adaptive icon clipping/poor display on home screen; PWA install quality checks (Lighthouse) will flag this as a failure

BUG-A8-3-100: public/manifest.json:1 LOW No `"orientation"` field set — for a construction takeoff tool used on tablets the manifest should explicitly set `"orientation": "any"` or `"landscape"` to prevent unintended rotation locking

BUG-A8-3-101: public/manifest.json:1 LOW No `"categories"` field — omitting `["productivity","business"]` or similar reduces discoverability in PWA-aware app stores and install prompts

BUG-A8-3-102: public/manifest.json:1 LOW No `"lang"` field — missing `"lang": "en"` means the browser cannot infer the primary language for accessibility and localization

BUG-A8-3-103: public/manifest.json:1 LOW No `"id"` field — without a stable `"id"` the browser derives the PWA identity from `start_url`; if `start_url` ever changes the user loses their installed PWA

BUG-A8-3-104: public/manifest.json:4 LOW `"start_url": "/"` is correct but no `"scope"` is defined — without an explicit `"scope"` the browser defaults to the manifest's directory, which may allow navigation outside the intended app boundary

BUG-A8-3-105: package.json:28 CRITICAL `xlsx` (sheetjs) version `^0.18.5` is affected by two unpatched HIGH vulnerabilities with no fix available: Prototype Pollution (GHSA-4r6h-6v6p-xvw6, CVSS 7.8) and ReDoS (GHSA-5pgg-2g8v-p4x9, CVSS 7.5) — the entire `*` range is vulnerable and no safe version exists on npm; must migrate to `exceljs` or `@e965/xlsx`

BUG-A8-3-106: package.json:25 HIGH `next` pinned at `16.1.6` has 4 moderate + 1 low CVEs: HTTP request smuggling in rewrites (GHSA-ggv3-7p47-pfv8), unbounded disk cache growth (GHSA-3x4c-7xq6-9pq8), unbounded postponed-resume buffering DoS (GHSA-h27x-g6w4-24gq), null-origin CSRF bypass on Server Actions (GHSA-mq59-m269-xvcx) — fix available: upgrade to `>=16.1.7`

BUG-A8-3-107: package.json:1 HIGH Transitive dependency `flatted` `<=3.4.1` has two HIGH vulnerabilities: unbounded recursion DoS in `parse()` (GHSA-25h7-pfq9-p65f, CVSS 7.5) and Prototype Pollution via `parse()` (GHSA-rf6f-7fwh-wjgh) — fix available via `npm audit fix`

BUG-A8-3-108: package.json:1 MEDIUM Transitive dependency `hono` `<4.12.7` has Prototype Pollution via `parseBody({dot:true})` (GHSA-v8w9-8mx6-g223, CVSS 4.8) — fix available via `npm audit fix`

BUG-A8-3-109: package.json:32 MEDIUM `"lint": "eslint"` script has no target path or config flags — running `npm run lint` will error or lint nothing; should be `"eslint . --ext .ts,.tsx"` or equivalent

BUG-A8-3-110: package.json:1 MEDIUM No `"typecheck"` script defined — there is no way to run `tsc --noEmit` as a CI gate; type errors can silently slip into builds

BUG-A8-3-111: package.json:37 MEDIUM `"test:e2e": "node --experimental-strip-types scripts/e2e-api-test.ts"` uses an experimental Node.js flag — this is unstable, will emit warnings in CI logs, and may break on Node.js version upgrades; should use `tsx` or `ts-node` instead

BUG-A8-3-112: package.json:25 MEDIUM `next` is pinned to an exact version `16.1.6` (no caret/tilde) — the lack of a range prefix means `npm install` will never auto-pull the patched `16.1.7+` even after an `npm audit fix`

BUG-A8-3-113: package.json:1 LOW No `"prepare"` or `"postinstall"` script for Husky or lint-staged — no pre-commit hooks are enforced, allowing unformatted or failing code to be committed

BUG-A8-3-114: package.json:1 LOW No `"engines"` field — the project uses `--experimental-strip-types` (Node ≥22.6) and React 19, but nothing prevents running on incompatible Node/npm versions

BUG-A8-3-115: package.json:1 LOW `"migrate": "npx tsx scripts/migrate.ts"` runs database migrations via `npx` (network-fetched binary) rather than a locally installed dep — introduces supply-chain risk and version non-determinism in production migration scripts

---

## SECTION 5 — Supabase Migrations (E40B)

BUG-A8-3-121: supabase/migrations/000_bootstrap.sql:12 CRITICAL `_exec_sql` SECURITY DEFINER function has no `SET search_path = public` — attacker can manipulate search_path to execute arbitrary code in a different schema context

BUG-A8-3-122: supabase/migrations/000_bootstrap.sql:12 CRITICAL `_exec_sql` allows any caller with EXECUTE privilege to run arbitrary SQL as the definer's superuser-equivalent role — this is a remote code execution vector; the function should be restricted to `service_role` only or removed entirely

BUG-A8-3-123: supabase/migrations/000_bootstrap.sql:17 HIGH No REVOKE of EXECUTE on `_exec_sql` from PUBLIC — by default all roles (including `anon`) inherit EXECUTE privilege, enabling unauthenticated arbitrary SQL execution

BUG-A8-3-124: supabase/migrations/001_mx_tables.sql:1 HIGH No `owner_id` column on `mx_projects` — all user-data tables downstream reference `mx_projects` but there is no ownership column; 018_mx_groups_rls_fix.sql references `owner_id` which does not exist, causing RLS policies to break at runtime

BUG-A8-3-125: supabase/migrations/001_mx_tables.sql:1 HIGH RLS never enabled on `mx_projects`, `mx_pages`, `mx_scales`, `mx_classifications`, `mx_polygons`, `mx_history`, `mx_assemblies` in this migration — all user data exposed to any authenticated user with no row isolation

BUG-A8-3-126: supabase/migrations/001_mx_tables.sql:50 MEDIUM `mx_set_updated_at()` trigger function created with no `SET search_path` — vulnerable to search_path injection if schema is altered

BUG-A8-3-127: supabase/migrations/001_mx_tables.sql:57 MEDIUM Trigger `trg_mx_projects_updated_at` created without `DROP TRIGGER IF EXISTS` guard — running migration twice causes "trigger already exists" error; not idempotent

BUG-A8-3-128: supabase/migrations/001_mx_tables.sql:62 MEDIUM Trigger `trg_mx_polygons_updated_at` created without `DROP TRIGGER IF EXISTS` guard — not idempotent

BUG-A8-3-129: supabase/migrations/002_mx_history.sql:1 HIGH No RLS enabled on `mx_history` — audit log rows for all users are accessible to any authenticated session

BUG-A8-3-130: supabase/migrations/002_mx_history.sql:1 MEDIUM `mx_history.entity_id` has no foreign key constraint to any entity table — referential integrity not enforced; orphaned history rows possible

BUG-A8-3-131: supabase/migrations/003_mx_assemblies.sql:1 HIGH No RLS enabled on `mx_assemblies` — any authenticated user can read or modify any other user's assembly records

BUG-A8-3-132: supabase/migrations/003_mx_assemblies.sql:1 MEDIUM No `updated_at` trigger created for `mx_assemblies` in this migration — trigger added only in 009; if 003 is applied alone the column exists but never auto-updates

BUG-A8-3-133: supabase/migrations/006_estimates.sql:1 MEDIUM Duplicate migration prefix — two files share prefix `006` (`006_estimates.sql` and `006_mx_formula_fields.sql`); Supabase migration order is filename-sorted and both share the same ordinal, making execution order undefined and potentially destructive

BUG-A8-3-134: supabase/migrations/006_estimates.sql:1 HIGH No RLS enabled on `mx_estimates` — any authenticated user can read or write any project's cost estimates

BUG-A8-3-135: supabase/migrations/006_estimates.sql:18 MEDIUM `uq_mx_estimates_proj_class` UNIQUE constraint added via `ALTER TABLE` with no `IF NOT EXISTS` guard — fails if migration is re-run and constraint already exists; not idempotent

BUG-A8-3-136: supabase/migrations/009_complete_schema.sql:1 CRITICAL All RLS policies use `USING (true) WITH CHECK (true)` — this grants every role including `anon` full read/write access to all user data tables; effectively disables row-level security

BUG-A8-3-137: supabase/migrations/009_complete_schema.sql:87 MEDIUM `mx_estimates` in 009 is missing the `UNIQUE (project_id, classification_id)` constraint that `006_estimates.sql` applied — if 009 is run on a fresh database without 006, the constraint is absent and duplicate estimate rows are silently allowed

BUG-A8-3-138: supabase/migrations/009_complete_schema.sql:105 MEDIUM `mx_set_updated_at()` trigger function still has no `SET search_path` — repeated from 001; should include `SET search_path = public, pg_temp`

BUG-A8-3-139: supabase/migrations/013_classification_library.sql:1 MEDIUM Duplicate migration prefix — two files share prefix `013` (`013_classification_library.sql` and `013_mx_pages_text.sql`); execution order between them is undefined and one may silently shadow the other

BUG-A8-3-140: supabase/migrations/013_classification_library.sql:25 MEDIUM `GRANT SELECT ON mx_classification_library TO anon` — unauthenticated users can read the classification library including `unit_cost` pricing data; likely unintentional

BUG-A8-3-141: supabase/migrations/013_classification_library.sql:27 LOW Seeded org templates use `created_by = null` but the `org_library_read` policy uses `is_org = true OR auth.uid() = created_by` — when `created_by` is null the second condition evaluates to `auth.uid() = null` which is always false; null FK is misleading and could break if the policy logic changes

BUG-A8-3-142: supabase/migrations/013_classification_library.sql:1 HIGH No `update` policy guards on `is_org` column — any authenticated user who created a library entry can set `is_org = true` on their own entry, making it visible to all users; no admin/role check on org-template promotion

BUG-A8-3-143: supabase/migrations/013_mx_pages_text.sql:7 HIGH `UPDATE mx_pages SET text = pdf_url WHERE pdf_url IS NOT NULL` — blindly copies all non-null `pdf_url` values (which are URLs, not text content) into the `text` column; corrupts text column with URL strings for any row where text was empty; data migration logic is incorrect

BUG-A8-3-144: supabase/migrations/015_pdf_storage_bucket.sql:1 MEDIUM No storage RLS policies created for the `pdfs` bucket — any role with storage access (including `anon` depending on Supabase config) can upload or download PDF files from other users' projects

BUG-A8-3-145: supabase/migrations/016_assemblies_grants.sql:5 CRITICAL `GRANT ALL ON TABLE mx_assemblies TO anon` — unauthenticated users receive full INSERT, UPDATE, DELETE, SELECT, TRUNCATE, REFERENCES, TRIGGER on the assemblies table; allows anonymous data destruction

BUG-A8-3-146: supabase/migrations/016_assemblies_grants.sql:3 HIGH `GRANT ALL ON TABLE mx_assemblies TO authenticated` — grants TRUNCATE and REFERENCES in addition to DML; authenticated users can truncate the entire assemblies table

BUG-A8-3-147: supabase/migrations/016_assemblies_grants.sql:1 MEDIUM No `_migrations` record inserted — this migration is not tracked in `_migrations`, making idempotency checking impossible for the migration runner

BUG-A8-3-148: supabase/migrations/017_mx_groups.sql:1 HIGH `mx_groups.classification_ids` is a `uuid[]` array column referencing classification IDs — no foreign key constraint enforced; deleted classifications leave dangling UUIDs in the array with no cascade or integrity check

BUG-A8-3-149: supabase/migrations/017_mx_groups.sql:18 HIGH `groups_select` policy uses `project_id IN (SELECT id FROM mx_projects WHERE id = mx_groups.project_id)` — this is a tautology (always true for any existing project_id); any authenticated user can select any group in any project; no ownership check

BUG-A8-3-150: supabase/migrations/017_mx_groups.sql:23 HIGH `groups_insert` policy uses `WITH CHECK (true)` — any authenticated (or anon) user can insert groups into any project with no ownership or membership validation

BUG-A8-3-151: supabase/migrations/017_mx_groups.sql:26 HIGH `groups_update` policy uses `USING (true)` — any authenticated user can update any group regardless of project ownership

BUG-A8-3-152: supabase/migrations/017_mx_groups.sql:29 HIGH `groups_delete` policy uses `USING (true)` — any authenticated user can delete any group regardless of project ownership

BUG-A8-3-153: supabase/migrations/017_mx_groups.sql:1 MEDIUM No `updated_at` trigger created for `mx_groups` — column exists but is never auto-updated

BUG-A8-3-154: supabase/migrations/018_mx_groups_rls_fix.sql:20 CRITICAL All four replacement RLS policies reference `mx_projects.owner_id` which does not exist in `mx_projects` as defined in 001/009 — policies will fail at creation or silently return no rows, effectively locking all users out of their groups or causing a migration error

BUG-A8-3-155: supabase/migrations/018_mx_groups_rls_fix.sql:1 MEDIUM No `_migrations` record inserted for `018_mx_groups_rls_fix.sql` prior to the INSERT at the end — migration tracking INSERT is present but the file has no idempotency guard for the DROP POLICY statements if policies were already dropped

BUG-A8-3-156: supabase/migrations/019_assemblies_anon_grant_fix.sql:1 MEDIUM `anon` still retains SELECT on `mx_assemblies` after the revoke — combined with `USING (true)` RLS policy from 009, unauthenticated users can read all assembly/cost data for all projects

BUG-A8-3-157: supabase/migrations/009_complete_schema.sql:1 HIGH `mx_projects` table has no `owner_id` / `user_id` column in 009 schema definition — all downstream RLS policies that should scope data per user have no anchor column; the entire RLS model is structurally broken

BUG-A8-3-158: supabase/migrations/010_share_tokens.sql:1 HIGH `share_token` column is UUID type stored in plaintext — if a token is guessed or leaked, there is no expiry, no revocation mechanism, and no scope limitation; tokens are permanent and grant indefinite project access

BUG-A8-3-159: supabase/migrations/012_share_token.sql:1 LOW Migration 012 is a redundant re-application of 010 — both files add the same column and index with IF NOT EXISTS guards; the duplicate migration adds noise and inflates migration history without adding value

BUG-A8-3-160: supabase/migrations/011_add_formula_columns.sql:1 LOW Migration 011 is a redundant re-application of 006_mx_formula_fields.sql — same three `ALTER TABLE` statements already applied in 006; duplicate migrations tracked separately inflate history without value

---

## TOP PRIORITY ACTION ITEMS

### 🔴 CRITICAL (fix before next deploy)
1. **BUG-A8-3-122 / BUG-A8-3-123** — `_exec_sql` SECURITY DEFINER function grants arbitrary SQL execution to `anon`; revoke PUBLIC execute and restrict to service_role immediately
2. **BUG-A8-3-136** — All RLS policies use `USING (true)` — every authenticated AND anonymous user has full read/write on all data; entire RLS model must be redesigned
3. **BUG-A8-3-145** — `GRANT ALL ON mx_assemblies TO anon` allows unauthenticated users to truncate/delete all assembly data
4. **BUG-A8-3-154** — `018_mx_groups_rls_fix.sql` references non-existent `owner_id` column; migration will fail or lock users out of groups
5. **BUG-A8-3-040 / BUG-A8-3-041 / BUG-A8-3-050** — /projects, /settings, /library pages have zero authentication checks
6. **BUG-A8-3-105** — `xlsx` package has unpatched CVEs with no safe version; migrate to `exceljs`

### 🟠 HIGH (fix this sprint)
- BUG-A8-3-001/002 — URL param / localStorage injection into API fetch paths
- BUG-A8-3-042/043 — API keys stored in localStorage (XSS risk)
- BUG-A8-3-106/107 — Vulnerable `next` and `flatted` dependencies
- BUG-A8-3-073/074 — CSP built with wrong/missing env vars in production
- BUG-A8-3-143 — Data migration corrupts `text` column with PDF URLs
- BUG-A8-3-158 — Share tokens have no expiry or revocation mechanism
- BUG-A8-3-149–152 — mx_groups RLS policies are tautologies (USING true on all ops)

---

*Report generated by engineers E36–E40B. 155 total findings across 5 audit sections.*