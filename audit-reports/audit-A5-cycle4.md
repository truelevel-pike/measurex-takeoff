# AUDIT REPORT — CYCLE 4
## MeasureX Takeoff — MEDIUM/LOW Bugs + Regression Check
**Repo:** measurex-takeoff (`~/.openclaw/workspace-nate/measurex-takeoff`)
**Date:** 2026-03-20
**Auditor:** Admiral 5 (P.I.K.E.)
**Cycle:** 4
**Scope:** All remaining MEDIUM and LOW severity bugs across API routes (A5), store/backend (A5/A7), UI components (A6), pages/infra/migrations (A8). Regression check on all Cycle 1–3 CRITICAL and HIGH fixes.

---

## EXECUTIVE SUMMARY

After three cycles of fixes targeting 25 CRITICAL and 102 HIGH bugs, the remaining work is substantial but less catastrophic. Cycle 4 surfaces **211 MEDIUM** and **193 LOW** bugs — totaling **404 issues** across four sectors. Additionally, regression analysis found **8 issues** where prior fixes are either incomplete, were partially reverted, or introduced new side effects.

The most important MEDIUM-severity clusters are:
1. Missing rate limiting on all authenticated endpoints (A5)
2. Race conditions throughout the file-based data layer (A5)
3. React unmount-safety and AbortController gaps across ~15 components (A6)
4. Broken accessibility semantics — missing ARIA roles/focus traps in 25+ dialogs (A6)
5. Structural migration problems — duplicate prefix files, tautological RLS policies (A8)
6. Scale/measurement calculation bugs including Infinity/NaN from division (A7)
7. MarkupTools toolbar still fully non-operational after Cycle 2 "TODO" fix (A7 regression)
8. RLS policies in groups migration referencing a non-existent column (A8 regression)

---

## SUMMARY TABLE

| Sector | MEDIUM Remaining | LOW Remaining | Regressions |
|--------|-----------------|---------------|-------------|
| A5 — API Routes + Backend | 47 | 42 | 2 |
| A6 — UI Components | 54 | 75 | 1 |
| A7 — Drawing/Store/Hooks | 54 | 39 | 3 |
| A8 — Pages + Infra + Migrations | 56 | 37 | 2 |
| **TOTAL** | **211** | **193** | **8** |

---

## SECTION 1 — REGRESSION REPORT (Cycle 1–3 Fixes)

### REG-001 — Rate Limiter Logic Inversion (A5)
**File:** `src/lib/rate-limit.ts:32-33`
**Severity:** MEDIUM (originally BUG-A5-3-407)
**Status:** Still present. The `checkRateLimit` function pushes the current request timestamp into the `valid` array *before* checking whether the limit is exceeded. An attacker making constant requests at the rate limit will never see their window expire — each rejected request resets the clock. The Cycle 2 webhook schema fix (BUG-A5-H05) did not touch rate-limit logic.
**Fix:** Record the timestamp only after the check passes, not before.

### REG-002 — Rate Limiter IP Map Never Pruned (A5)
**File:** `src/lib/rate-limit.ts:10`
**Severity:** MEDIUM (originally BUG-A5-3-406)
**Status:** Still present. The `hits` Map accumulates entries per IP indefinitely. No eviction logic exists.
**Fix:** Add `setInterval` cleanup every 5 minutes; delete entries whose all timestamps are older than the window.

### REG-003 — hydrateState Still Leaks Previous Project Data (A7)
**File:** `src/lib/store.ts:671`
**Severity:** HIGH (originally BUG-A7-3-002)
**Status:** Unresolved. No fix commit found. `hydrateState` does not reset `groups`, `assemblies`, `markups`, `repeatingGroups`, `sheetNames`, `drawingSets`, or `pageBaseDimensions` before populating new project data. Stale data from previous project leaks into newly loaded project on project switch. The Cycle 2 undo-snapshot fix (BUG-A5-H06) touched history inclusion but not this reset gap.
**Fix:** At the start of `hydrateState`, reset all project-scoped fields to their initial values before populating new state.

### REG-004 — Store Mutation Inside React Updater (A7)
**File:** `src/components/CanvasOverlay.tsx:202-213`
**Severity:** HIGH (originally BUG-A7-3-053)
**Status:** Unresolved. `updatePolygon` (Zustand mutation + undo snapshot + API sync) called inside a `setDragPoints` state updater. React 18 StrictMode double-invokes updaters, producing duplicate undo snapshots and double API sync on every drag-end. The Cycle 2 vertex-drag measurement fix (BUG-A5-H03) did not address this.
**Fix:** Move `updatePolygon` call out of the state updater and into a `useEffect` that runs after `dragPoints` state settles.

### REG-005 — MarkupTools State Still Disconnected (A7)
**File:** `src/components/MarkupTools.tsx:55`
**Severity:** HIGH (originally BUG-A7-3-174; noted as TODO in BUG-A7-2-017)
**Status:** Cycle 2 added a TODO comment only. The markup toolbar is still entirely non-operational — `activeTool`, `activeColor`, and `strokeWidth` are local `useState` values never passed to any canvas layer or store.
**Fix:** Wire markup tool state to Zustand store; connect to CanvasOverlay drawing layer.

### REG-006 — RLS Tautologies Survive in mx_groups (A8)
**Files:** `supabase/migrations/017_mx_groups.sql`, `018_mx_groups_rls_fix.sql`
**Severity:** CRITICAL (originally BUG-A8-3-149–154)
**Status:** Migration 018 attempted a fix but references `mx_projects.owner_id` which does not exist. The "fix" either fails at application or creates broken policies. No follow-up migration found.
**Fix:** Create new migration that: (1) adds `user_id` column to `mx_projects`, (2) corrects all group RLS policies to `USING (project_id IN (SELECT id FROM mx_projects WHERE user_id = auth.uid()))`.

### REG-007 — CM Unit Inconsistency After Recent Fix (A5, post-commit f604e4f)
**Files:** `src/app/api/projects/[id]/scale/route.ts`, `src/components/ScaleCalibrationPanel.tsx`
**Severity:** MEDIUM
**Status:** The most recent commit added `cm` to the DB check constraint, but BUG-A5-3-313 (`validated.unit` cast excluding `'cm'`) and BUG-A7-3-225 (ScaleCalibrationPanel unit select only offering ft/m/in) remain unaddressed in code. The DB accepts `cm` but the API route and UI cannot produce it.
**Fix:** Update `ScaleCalibrationPanel` unit select to include `cm` and `mm`; update the `as 'ft' | 'in' | 'm' | 'mm'` cast to include `'cm'`.

### REG-008 — _exec_sql Arbitrary SQL Still Present (A8)
**File:** `supabase/migrations/000_bootstrap.sql:12`
**Severity:** CRITICAL (originally BUG-A8-3-121/122)
**Status:** No migration found that revokes or drops `_exec_sql`. Cycle 3 audit flagged this but no fix commit addresses it.
**Fix:** New migration: `REVOKE EXECUTE ON FUNCTION _exec_sql FROM PUBLIC; REVOKE EXECUTE ON FUNCTION _exec_sql FROM authenticated; GRANT EXECUTE ON FUNCTION _exec_sql TO service_role ONLY;` — or drop the function if unused.

---

## SECTION 2 — A5: API Routes + Backend (MEDIUM/LOW Remaining)

### 2.1 Rate Limiting Gaps (MEDIUM)

**BUG-A5-3-003** `src/app/api/admin/errors/route.ts:4` MEDIUM
No rate limiting on admin errors endpoint. Authenticated admins can poll aggressively for reconnaissance.
*Fix:* Apply `checkRateLimit(ip, 10, 60_000)` before returning data.

**BUG-A5-3-012** `src/app/api/audit-log/route.ts:20` MEDIUM
No rate limiting on POST to audit log. Valid sessions can spam entries filling in-memory array.
*Fix:* Rate limit to 30 writes/minute per IP.

**BUG-A5-3-013** `src/app/api/audit-log/route.ts:35` MEDIUM
No length limits on `action`, `resource`, `resourceId` strings. A single POST can store megabytes.
*Fix:* Add `z.string().max(255)` to all string fields in audit-log schema.

**BUG-A5-3-018** `src/app/api/errors/route.ts:23` MEDIUM
No rate limiting on public error-logger POST. Can be spammed.
*Fix:* Rate limit 20 writes/min per IP; cap `loggedErrors` at 500 entries.

**BUG-A5-3-202** `[assemblies, batch, chat, classifications, duplicate, estimates, export/*]` MEDIUM
No rate limiting on any of these 11 routes after Cycle 3 auth fixes. Authenticated flood attack viable.
*Fix:* Apply `checkRateLimit()` to all 11 handlers. Tighter limits on expensive ops: batch (5/min), duplicate (3/min), AI endpoints (2/min), export (10/min).

### 2.2 Information Disclosure (MEDIUM)

**BUG-A5-3-005** `src/app/api/ai-takeoff/route.ts:461` MEDIUM
Upstream OpenAI/OpenRouter error body passed verbatim to client. Leaks rate-limit headers, partial key info.
*Fix:* Log full error server-side; return `{ error: "AI service unavailable", requestId }` to client.

**BUG-A5-3-006** `src/app/api/ai-takeoff/route.ts:388` MEDIUM
Silent empty-string fallback when `OPENROUTER_API_KEY` unset. Produces confusing upstream auth error.
*Fix:* `if (!process.env.OPENROUTER_API_KEY) return NextResponse.json({ error: 'OpenRouter not configured' }, { status: 500 });`

**BUG-A5-3-021** `src/app/api/flags/route.ts:4` MEDIUM
No auth on GET. Full internal feature-flag configuration exposed to unauthenticated users.
*Fix:* Add session check before returning flag config.

**BUG-A5-3-105** `src/app/api/metrics/route.ts:4` MEDIUM
Internal performance metrics exposed to any unauthenticated caller.
*Fix:* Require admin or service-role token.

**BUG-A5-3-112** `src/app/api/perf/summary/route.ts:3` MEDIUM
Returns last 100 perf events (including attacker-injected data) to unauthenticated callers.
*Fix:* Add auth check.

**BUG-A5-3-127** `src/app/api/projects/[id]/ai-takeoff/route.ts:70` MEDIUM
Error message includes raw `err.message`, potentially exposing AI API error details or internal URLs.
*Fix:* Sanitize error; log internally only.

**BUG-A5-3-203** `[Multiple export/mutation routes]` MEDIUM
`err instanceof Error ? err.message : String(err)` pattern across 10+ routes exposes file paths, parse details, library internals.
*Fix:* Replace with `{ error: 'Operation failed', requestId: crypto.randomUUID() }`; log full error server-side.

### 2.3 Race Conditions (MEDIUM)

**BUG-A5-3-008** `src/app/api/ai-takeoff/route.ts:504` MEDIUM
Two concurrent AI takeoff requests for same project+page both call `deletePolygonsByPage` then insert — duplicate polygon sets.
*Fix:* Per-project-page mutex (Redis or DB advisory lock) around delete+insert.

**BUG-A5-3-132** `src/app/api/projects/[id]/ai-takeoff/apply/route.ts:156` MEDIUM
Same race at the apply endpoint.
*Fix:* Same per-project-page mutex.

**BUG-A5-3-210** `src/app/api/projects/[id]/batch/route.ts:62` MEDIUM
No file locking on concurrent batch requests. Interleaved reads/writes on JSON data files cause data corruption or lost writes.
*Fix:* Per-project advisory lock or atomic write (write-then-rename) pattern.

**BUG-A5-3-220** `src/app/api/projects/[id]/duplicate/route.ts:30` MEDIUM
Source project may be modified between parallel reads and sequential writes during duplication — inconsistent copy.
*Fix:* Snapshot source data atomically before beginning writes to the new project.

**BUG-A5-3-316** `src/app/api/projects/[id]/pages/route.ts:44` MEDIUM
TOCTOU race in PATCH upsert: two concurrent requests for same non-existent page can both call `createPage`, creating duplicate records.
*Fix:* Use `INSERT ... ON CONFLICT DO UPDATE` at DB level.

**BUG-A5-3-319** `src/app/api/projects/[id]/share/route.ts:37` MEDIUM
Two concurrent POST requests both see null token and generate new tokens.
*Fix:* Atomic `INSERT ... ON CONFLICT DO NOTHING RETURNING token`.

**BUG-A5-3-320** `src/app/api/projects/[id]/history/[entryId]/restore/route.ts:50` MEDIUM
No concurrency guard. Two concurrent restore requests can interleave polygon mutations.
*Fix:* Per-project advisory lock around the restore transaction.

**BUG-A5-3-322** `src/app/api/ws/route.ts:24` MEDIUM
Two concurrent SSE connections for same `projectId` can overwrite each other in the clients Map, orphaning one connection.
*Fix:* Use `Map<string, Set<...>>` with append semantics rather than overwrite.

### 2.4 Input Validation Gaps (MEDIUM)

**BUG-A5-3-102** `src/app/api/image-search/route.ts:8` MEDIUM — `projectId` validated as `z.string()` not UUID. *Fix:* `z.string().uuid().optional()`

**BUG-A5-3-110** `src/app/api/perf/route.ts:11` MEDIUM — `MetricSchema` uses `.passthrough()`, injecting arbitrary fields into Supabase. *Fix:* Remove `.passthrough()`; strict schema.

**BUG-A5-3-122** `src/app/api/projects/[id]/route.ts:110` MEDIUM — PATCH accepts unlimited-length `thumbnail` string. *Fix:* `z.string().max(500_000)`.

**BUG-A5-3-123** `src/app/api/projects/[id]/route.ts:80` MEDIUM — `as 'm' | 'ft' | 'in' | 'mm'` cast bypasses runtime validation. *Fix:* `z.enum([...])` parse.

**BUG-A5-3-133** `src/app/api/projects/[id]/ai-takeoff/apply/route.ts:128` MEDIUM — `page` field has no integer or range validation. *Fix:* `z.number().int().min(1)`.

**BUG-A5-3-205** `src/app/api/projects/[id]/assemblies/route.ts:13` MEDIUM — `AssemblyBodySchema` uses `.passthrough()`. *Fix:* Remove; strict schema.

**BUG-A5-3-206/207** `src/app/api/projects/[id]/assemblies/[aid]/route.ts:13,33` MEDIUM — PATCH/PUT without `.catch()` on `req.json()`. *Fix:* Try/catch; return 400 on parse failure.

**BUG-A5-3-209** `src/app/api/projects/[id]/batch/route.ts:102` MEDIUM — Per-operation errors expose `err.message` to client. *Fix:* Return generic error; log server-side.

**BUG-A5-3-211** `src/app/api/projects/[id]/chat/route.ts:19` MEDIUM — `ChatBodySchema` defined but not used. *Fix:* Apply `ChatBodySchema.safeParse(body)`.

**BUG-A5-3-214** `src/app/api/projects/[id]/chat/route.ts:189` MEDIUM — No timeout on OpenAI fetch; route blocks indefinitely on upstream hang. *Fix:* `AbortController` with 30s timeout.

**BUG-A5-3-215** `src/app/api/projects/[id]/chat/route.ts:22` MEDIUM — No message content length limit. *Fix:* `z.string().max(32_768)` per message.

**BUG-A5-3-221** `src/app/api/projects/[id]/duplicate/route.ts:40` MEDIUM — Sequential await loops over thousands of polygons — DoS vector. *Fix:* Batch-insert in single bulk operations.

**BUG-A5-3-313** `src/app/api/projects/[id]/scale/route.ts:36` MEDIUM — Unit cast excludes `'cm'` but schema allows it. *Fix:* Update cast and switch to include `'cm'`.

**BUG-A5-3-314** `src/app/api/projects/[id]/quantities/route.ts:49` MEDIUM — Unit labels hardcoded as `'SF'`/`'FT'`/`'EA'` regardless of scale unit. Metric projects show imperial labels. *Fix:* Derive display unit from `scale.unit`.

**BUG-A5-3-315** `src/app/api/projects/[id]/polygons/[pid]/route.ts:13` MEDIUM — PUT `req.json()` without `.catch()`. Returns 500 instead of 400. *Fix:* Wrap; return 400.

**BUG-A5-3-317** `src/app/api/projects/[id]/scales/route.ts:35` MEDIUM — GET returns empty object when no `pages` param, despite claiming to return all scales. *Fix:* Return all scales when no param provided.

**BUG-A5-3-318** `src/app/api/projects/[id]/snapshots/route.ts:38` MEDIUM — POST returns snapshot directly; GET wraps in `{ snapshots }`. Inconsistent shapes. *Fix:* POST should return `{ snapshot: data }`.

**BUG-A5-3-321** `src/app/api/projects/[id]/search-text/route.ts:7` MEDIUM — `query` field has no max length. Multi-megabyte strings cause CPU-bound DoS. *Fix:* `z.string().max(512)`.

**BUG-A5-3-323** `src/app/api/projects/[id]/snapshots/[sid]/route.ts:42` MEDIUM — User-supplied `action` reflected verbatim in error JSON. XSS risk if rendered as HTML. *Fix:* Sanitize or enum-validate before echoing.

**BUG-A5-3-324** `src/app/api/projects/restore/route.ts:42` MEDIUM — Sequential creates without transaction. Partial restore leaves project in broken state. *Fix:* Wrap in DB transaction; rollback on failure.

### 2.5 Memory & Resource Leaks (MEDIUM)

**BUG-A5-3-016** `src/app/api/chat/route.ts:131` MEDIUM — `ReadableStream` no `cancel()` handler. Client disconnect mid-stream leaks connection. *Fix:* Register `cancel()` handler that aborts upstream reader.

**BUG-A5-3-406** `src/lib/rate-limit.ts:10` MEDIUM — `hits` Map never evicts stale entries. Unbounded memory under diverse-IP traffic. *Fix:* Add `setInterval` cleanup every 5 minutes.

**BUG-A5-3-407** `src/lib/rate-limit.ts:32` MEDIUM — Timestamp recorded before limit check. *Fix:* Record timestamp only after passing the check.

**BUG-A5-3-408** `src/lib/audit-log.ts:31` MEDIUM — `localStorage` access without `typeof window !== 'undefined'` guard. Throws in SSR. *Fix:* Add early-return guard.

**BUG-A5-3-409** `src/lib/sse-broadcast.ts:8` MEDIUM — Four `globalThis` Maps accumulate per-project entries without pruning. *Fix:* Add `cleanupProject(id)` and TTL sweep.

**BUG-A5-3-410** `src/lib/supabase.ts:19` MEDIUM — Supabase Proxy calls `getSupabase()` on every property access; throws if env vars missing. *Fix:* Initialize once at startup with clear startup error.

**BUG-A5-3-411** `src/lib/ws-client.ts:59` MEDIUM — `parsed` redeclared at line 59, shadowing outer variable. Downstream code reads wrong variable. *Fix:* Remove inner redeclaration.

**BUG-A5-3-111** `src/app/api/perf/route.ts:32` MEDIUM — Non-null assertions on env vars. `createClient(undefined, undefined)` called silently if missing. *Fix:* Add startup assertion.

### 2.6 LOW Severity — A5 (Selected Key Items)

**BUG-A5-LOW-001** No minimum vertex count check on polygon creation. 0-vertex or 1-vertex polygons can be saved. *Fix:* `.refine(pts => pts.length >= 2)`.

**BUG-A5-LOW-002** JSON export omits assemblies, costs, history. Not portable. *Fix:* Include in export payload.

**BUG-A5-LOW-003** Webhook delivery failures silently swallowed. No retry, no log entry. *Fix:* Log failures; add 3-attempt exponential backoff retry.

**BUG-A5-LOW-004** Re-upload with fewer pages leaves stale old page records beyond new page count. *Fix:* Delete page records with `page_number > newPageCount` on re-upload.

**BUG-A5-LOW-005** Rate limiter trusts `x-forwarded-for` header without validation; can be spoofed. *Fix:* Use verified last untrusted hop.

---

## SECTION 3 — A6: UI Components (MEDIUM/LOW Remaining)

### 3.1 Missing AbortController / Unmount Safety (MEDIUM)

**BUG-A6-3-004/005** `AIImageSearch.tsx:75,115` — `handleCroppedSearch` and `handleVisionSearch` both lack `AbortController`. State updates fire on unmounted component. *Fix:* Create abort controller per request; abort in cleanup.

**BUG-A6-3-012/013** `ComparePanel.tsx:48,67` — `useEffect` IIFE and `handleCompare` lack `AbortController`. *Fix:* Mounted-ref + abort controller pattern.

**BUG-A6-3-014** `ContextMenu.tsx:81` — `setTimeout(onClose, 600)` not tracked or cleared on unmount. *Fix:* Store in `useRef`; clear in cleanup.

**BUG-A6-3-108** `DrawingSetManager.tsx:159` — `setTimeout` in upload simulation not cleared on unmount. *Fix:* Store timer ref; clear in cleanup.

**BUG-A6-3-200** `MXChat.tsx:171` — `abortRef.current` never aborted on unmount. Streaming fetch continues after unmount. *Fix:* `abortRef.current?.abort()` in cleanup.

**BUG-A6-3-300** `PatternSearch.tsx:150` — Vision-search fetch has no `AbortController`. *Fix:* Add abort controller.

**BUG-A6-3-308** `QuantitiesPanel.tsx:881` — N+1 API calls in merge/cleanup handlers. No `AbortController`. Errors silently swallowed. *Fix:* Batch polygon fetches; add abort controller; user feedback on partial failure.

**BUG-A6-3-321** `SmartTools.tsx:103` — `showStatus` creates new `setTimeout(3000)` without clearing previous. Rapid calls cause premature clear. *Fix:* `clearTimeout(timerRef.current)` before each `setTimeout`.

**BUG-A6-3-400/402** `SnapshotPanel.tsx:37,53` — `fetchSnapshots` and mutation handlers lack `AbortController`. *Fix:* Mounted-ref and abort controllers on all async handlers.

**BUG-A6-3-406** `TakeoffProgressModal.tsx:212` — `setTimeout(setCancelled(false), 1500)` never cleared. Fires on unmounted modal. *Fix:* Store ref; clear in cleanup.

**BUG-A6-3-423** `TogalChat.tsx:102` — SSE streaming reader never released. Holds connection open after unmount. *Fix:* `reader.cancel(); reader.releaseLock()` in cleanup.

**BUG-A6-3-428** `VersionHistory.tsx:360` — `handleApiRestore` lacks `AbortController`. *Fix:* Add controller with mounted-ref guard.

### 3.2 Accessibility & ARIA (MEDIUM)

**BUG-A6-3-001** `AIActivityLog.tsx:158` — `div[role="button"]` wraps a nested `<button>`. Screen readers cannot distinguish two interactive targets. *Fix:* Flatten to single `<button>`.

**BUG-A6-3-015/016** `CollaborationPanel.tsx:256` — Dialog missing `aria-modal="true"` and Escape key handler. *Fix:* Add `role="dialog" aria-modal="true"` and global Escape handler.

**BUG-A6-3-103** `CustomFormulas.tsx:253` — Modal lacks `role="dialog"` and `aria-modal="true"`. *Fix:* Add semantics and focus trap.

**BUG-A6-3-107** `DrawingComparison.tsx:168` — Comparison dialog has no Escape key handler. *Fix:* Add window-level Escape handler.

**BUG-A6-3-204** `LeftToolbar.tsx:224` — Smart Tools panel declares `aria-modal="true"` but has no focus trap. *Fix:* Implement focus trap cycling.

**BUG-A6-3-210** `MergeSplitTool.tsx:86` — Escape handler only when tool's div has focus — not window-level. *Fix:* Register window-level `keydown` listener in `useEffect`.

**BUG-A6-3-213** `PDFViewer.tsx:770` — No error boundary around overlay children. Child crash takes down entire PDFViewer. *Fix:* Wrap `{children}` in React error boundary with "Reload overlay" fallback.

**BUG-A6-3-301/302** `PatternSearch.tsx:256,420` — Modal missing `role="dialog"`. Result items are click-only `div` elements. *Fix:* Add dialog semantics; convert result items to keyboard-accessible controls.

**BUG-A6-3-304** `PolygonGroupPanel.tsx:62` — `groups` state never resyncs when store updates. Stale data on project switch. *Fix:* Replace with `useStore` selector for live sync.

**BUG-A6-3-306** `QuantitiesPanel.tsx:1979` — Deduction list uses index-based React key. Deleting middle item shifts values to wrong rows. *Fix:* Use stable `deduction.id` as key.

**BUG-A6-3-314** `RecentProjects.tsx:88` — `article` with `onClick` lacks `role="button"`, `tabIndex={0}`, and `onKeyDown`. *Fix:* Add role, tabIndex, and Enter/Space handler.

**BUG-A6-3-407/410** `TakeoffProgressModal.tsx:70,283` — Both modal containers missing `role="dialog"` and `aria-modal="true"`. *Fix:* Add semantics and focus traps.

**BUG-A6-3-411/414** `TextSearch.tsx:169,138` — Result `li` elements not keyboard navigable. Custom toggle missing `role="switch"` and `aria-checked`. *Fix:* Add role/tabIndex/keyboard handlers; add `aria-checked` binding.

**BUG-A6-3-421** `Toast.tsx:87` — Toast items missing `role="alert"`. Screen readers do not announce notifications. *Fix:* Add `role="alert" aria-live="polite"`.

**BUG-A6-3-424/425** `TopNavBar.tsx:407,295` — Page badge `div` not keyboard-accessible. Enter triggers duplicate PATCH (save + blur). *Fix:* Convert to `<button>`; add blur-intent flag.

**BUG-A6-3-427** `VersionHistory.tsx:312` — `loadTakeoffRuns()` in `useState` initializer causes hydration mismatch. *Fix:* Initialize with `[]`; populate in `useEffect`.

**BUG-A6-3-429** `VersionHistory.tsx:353` — `handleRestore` calls `undo()` in synchronous for-loop, causing N sequential re-renders. *Fix:* Dispatch single `restoreToIndex` store action.

**BUG-A6-3-433** `WhatsNewModal.tsx:38` — Modal missing `role="dialog"` and `aria-modal="true"`. *Fix:* Add semantics and focus trap.

**BUG-A6-3-435** `WorkspaceSwitcher.tsx:16` — `useState` initializers call localStorage reads. SSR vs client hydration mismatch. *Fix:* Defer to `useEffect`.

### 3.3 Performance (MEDIUM)

**BUG-A6-3-119** `FloorAreaMesh.tsx:111` — `new Color()` and `pointsToVec3()` allocate fresh Three.js objects on every render. High GC pressure. *Fix:* `useMemo(() => new Color(color), [color])`.

**BUG-A6-3-211** `PageThumbnailSidebar.tsx:154` — `currentPage` in thumbnail-gen deps invalidates all thumbnails on every page navigation, causing visible flickering. *Fix:* Remove `currentPage` from thumbnail-gen deps.

**BUG-A6-3-309** `QuantitiesPanel.tsx:1293` — Grand totals recomputed via IIFE on every render without `useMemo`. *Fix:* Extract to `useMemo`.

**BUG-A6-3-310/311** `QuantitiesPanel.tsx:1791,1037` — Per-classification `polygons.filter()` during render for every row. O(groups × classificationIds × polygons) for group totals. *Fix:* Build `polygonsByClassificationId` Map once; use for O(1) lookup.

**BUG-A6-3-418/419** `ThreeDViewer.tsx:122,108` — `fallbackTexture` (CanvasTexture) never disposed. `TextureLoader.load` has no error callback. *Fix:* Dispose in cleanup; add error callback with user feedback.

### 3.4 LOW Severity — A6 (Selected Key Items)

- `BUG-A6-3-002` AIActivityLog.tsx:169 — clear-log button missing `aria-label`
- `BUG-A6-3-003` AIImageSearch.tsx:62 — missing exhaustive-deps on useEffect
- `BUG-A6-3-007` AssembliesPanel.tsx:194 — no AbortController on mount fetch despite cancelled flag
- `BUG-A6-3-010` AssemblyEditor.tsx:204 — remove-material button missing `aria-label`
- `BUG-A6-3-020` CanvasOverlay.tsx:807 — calibration points keyed by array index
- `BUG-A6-3-021-023` ClassificationGroups.tsx — rename/add inputs missing `aria-label`
- `BUG-A6-3-025` CanvasOverlay.tsx:726 — `calculateLinearFeet()` in render loop without useMemo
- `BUG-A6-3-105` CutTool.tsx:17 — pagePolygons filter each render without useMemo
- `BUG-A6-3-109` DrawingSetManager.tsx:509 — "Archive" button calls deleteDrawing() (permanently destroys; functionally identical to Delete)
- `BUG-A6-3-110` DrawingSetManager.tsx:469 — `window.prompt()` for rename; blocks main thread, inaccessible
- `BUG-A6-3-116` ExportPanel.tsx:248 — setTimeout in showToast not cleared on unmount
- `BUG-A6-3-117` ExportPanel.tsx:486 — JSON export anchor not appended to document.body; may fail in Safari
- `BUG-A6-3-120` ImportFromLibraryModal.tsx:51 — Supabase fetch error silently swallowed
- `BUG-A6-3-201/202` MXChat.tsx:131,133 — table rows/cells keyed by array index
- `BUG-A6-3-205/206` LeftToolbar.tsx — Smart Tools has no click-outside-to-close; "Open chat" button is non-functional dead code
- `BUG-A6-3-207` NotificationSettings.tsx:23 — localStorage in useState initializer causes hydration mismatch
- `BUG-A6-3-212` PWAInstallBanner.tsx:32 — handleInstall no try-catch; failed install silently ignored
- `BUG-A6-3-436` WorkspaceSwitcher.tsx:24 — `prompt()` used for new workspace name

---

## SECTION 4 — A7: Drawing Tools / Store / Hooks (MEDIUM/LOW Remaining)

### 4.1 Store Logic Bugs (MEDIUM)

**BUG-A7-3-003** `src/lib/store.ts:630` MEDIUM
`setScaleForPage` unconditionally overwrites the active `scale` field regardless of `currentPage`. Calibrating a non-current page silently corrupts current page's area calculations.
*Fix:* Only update the active `scale` field when `pageNum === currentPage`; always write to `scales[pageNum]`.

**BUG-A7-3-004/005/006** `src/lib/store.ts:822,766,781` MEDIUM
Group, assembly, and markup mutations do not push undo snapshots, even though all are included in `HistorySnapshot`. Mutations on these entities silently revert when unrelated polygon edits are undone.
*Fix:* Call `snapshot()` at the start of each group/assembly/markup mutation action.

**BUG-A7-3-007** `src/lib/store.ts:217` MEDIUM
`snapshot()` calls `structuredClone` on all data on every single mutation. With 1000+ polygons and 50 undo entries, O(n) deep copies per edit causes significant memory bloat and latency.
*Fix:* Implement incremental snapshot (only clone changed fields) or use persistent/immutable data structure.

**BUG-A7-3-008** `src/lib/store.ts:614` MEDIUM
`setScale`/`setScaleForPage` accept `0`, negative, or `NaN` `pixelsPerUnit`. Downstream division produces `Infinity`/`NaN` area calculations silently.
*Fix:* `if (!Number.isFinite(ppu) || ppu <= 0) return;` — validate before storing.

**BUG-A7-3-009** `src/lib/store.ts:276` MEDIUM
`addClassification` throws `Error` on empty name or invalid color while all other mutations silently return. Uncaught throw from a store action during render crashes the React tree.
*Fix:* Return early instead of throwing; optionally emit a console warning.

**BUG-A7-3-010** `src/hooks/use-feature-flag.ts:21` MEDIUM
`fetchFlags` catch handler returns `{}` and clears `fetchPromise` but not `cachedFlags`. Any transient network error disables every feature flag with no retry.
*Fix:* Keep `cachedFlags` on error (stale-while-revalidate); add exponential backoff retry.

**BUG-A7-3-011** `src/hooks/use-feature-flag.ts:42` MEDIUM
`useEffect` deps `[flag]` never re-run after cache expires. Mounted components display stale flag values indefinitely.
*Fix:* Add TTL check: when `Date.now() > cachedAt + TTL`, set `cachedFlags = null` to force re-fetch.

**BUG-A7-3-012** `src/hooks/useRealtimeSync.ts:15` MEDIUM
`connectedRef` guard prevents reconnection if SSE is externally closed. If `disconnectFromProject()` is called by another module, the hook permanently skips reconnection until `projectId` changes.
*Fix:* Reset `connectedRef` in the disconnect callback; expose and observe connection state.

### 4.2 Drawing/Geometry Bugs (MEDIUM)

**BUG-A7-3-051** `DrawingTool.tsx:38` MEDIUM — `snapPolygons` filter recreated every render without useMemo, defeating useCallback for getCoords/handleMouseMove/handleClick. *Fix:* `useMemo(() => polygons.filter(p => p.page === currentPage), [polygons, currentPage])`.

**BUG-A7-3-054** `CanvasOverlay.tsx:150` MEDIUM — `toSvgCoords` divides by rect dimensions without zero guard. Zero-dimension container during layout produces Infinity/NaN coords. *Fix:* `if (!rect.width || !rect.height) return null;`.

**BUG-A7-3-055** `CanvasOverlay.tsx:533` MEDIUM — `selectedPolygons.includes(poly.id)` O(s) scan inside render loop. 1000 polygons × 100 selections = 100k comparisons/render. *Fix:* `const selectedSet = useMemo(() => new Set(selectedPolygons), [selectedPolygons])`.

**BUG-A7-3-056** `CanvasOverlay.tsx:412` MEDIUM — Batch reclassify calls `updatePolygon` per polygon, each pushing separate undo snapshot. Ctrl+Z after reclassifying 20 polygons undoes only the last one. *Fix:* Batch into single store action with one undo snapshot.

**BUG-A7-3-057/058** `CanvasOverlay.tsx:982-986` MEDIUM — Floating toolbar IIFE forces synchronous layout reflow during render. Height=0 guard missing — produces Infinity positioning. *Fix:* Defer to `useLayoutEffect`; add `baseDims.height > 0` guard.

**BUG-A7-3-059** `CanvasOverlay.tsx:175` MEDIUM — Drag mousemove calls setState on every raw event without requestAnimationFrame coalescing. Excessive re-renders during drag. *Fix:* Coalesce with `requestAnimationFrame`.

**BUG-A7-3-064** `CanvasOverlay.tsx:182` MEDIUM — `screenToBase` divides by zero on zero-width wrapper. Produces Infinity snap threshold snapping to any vertex on page. *Fix:* Guard `rect.width > 0 && rect.height > 0`.

**BUG-A7-3-066** `DrawingTool.tsx:32,94` MEDIUM — `baseDims` defaults to `{width:1,height:1}` before page loads. Snap radius becomes ~0.015 base units — effectively disables snapping. *Fix:* Use `null` as sentinel; skip snap computation until baseDims populated.

**BUG-A7-3-068/069** `DrawingTool.tsx:274`, `CanvasOverlay.tsx:220` MEDIUM — Only mouse events handled. Touch events (touchstart/touchmove/touchend) not handled — rubber-band preview and vertex drag non-functional on mobile. *Fix:* Add touch event handlers with coordinate extraction from `touch.clientX/Y`.

**BUG-A7-3-100** `AnnotationTool.tsx:58` MEDIUM — `commit` can fire twice before React re-renders (rapid Enter or double-click). Creates duplicate annotation. *Fix:* Add `committing` ref guard.

**BUG-A7-3-103** `AnnotationTool.tsx:22` MEDIUM — `baseDims` fallback `{1,1}` maps screen coords to 0–1 range. Annotations placed at near-zero PDF coordinates with no error. *Fix:* Return early if baseDims is fallback; show "PDF still loading" message.

**BUG-A7-3-105** `CutTool.tsx:17` MEDIUM — `pagePolygons` filter in render body without useMemo. Defeats useCallback for findPolygonAt and onClick. *Fix:* `useMemo` for `pagePolygons`.

**BUG-A7-3-110** `CropOverlay.tsx:136` MEDIUM — Crop selection visual is inverted: selected region appears darker than surroundings (opposite of standard UX). *Fix:* Invert SVG mask logic so crop region is brighter.

**BUG-A7-3-113** `CropOverlay.tsx:105` MEDIUM — `onCropComplete` in effect deps causes re-run on every parent render, detaching/re-attaching mouse listeners mid-drag. *Fix:* Wrap `onCropComplete` in `useRef`; remove from deps.

**BUG-A7-3-115** `CropOverlay.tsx:49` MEDIUM — No touch event handlers. Crop drag completely non-functional on touch devices. *Fix:* Add touchstart/touchmove/touchend handlers.

**BUG-A7-3-150/152/153/155** `FloorAreaMesh.tsx` MEDIUM — Unnecessary Three.js object allocations every render: pointsToVec3 called twice, new Color() inline, normalizePoints returns fresh array. High GC pressure at scale. *Fix:* Memoize all with useMemo.

**BUG-A7-3-166** `ManualCalibration.tsx:7` MEDIUM — DPI hardcoded to 72. Calibration at non-100% zoom produces incorrect scale by the zoom factor. *Fix:* Accept and apply current PDF zoom level in pixelDistance calculation.

**BUG-A7-3-170/171** `AutoScalePopup.tsx:66,76` MEDIUM — Global keydown handler prevents native checkbox toggle on Enter. Also intercepts keypresses meant for other modals. *Fix:* Add `e.target` check; only intercept when target is inside the popup.

**BUG-A7-3-172** `AutoScalePopup.tsx:50` MEDIUM — Auto-dismiss interval recreated on every parent re-render. Progress bar stutters; timing drifts. *Fix:* Store `onDismiss` in a ref; exclude from deps.

**BUG-A7-3-200** `src/lib/polygon-utils.ts:108` MEDIUM — `Math.min(...xs)` spread throws RangeError for polygons with >~65k vertices. *Fix:* `xs.reduce((min, x) => x < min ? x : min, Infinity)`.

**BUG-A7-3-205/206** `ScaleCalibrationPanel.tsx:54,52` MEDIUM — setTimeout callbacks fire after unmount. `setScaleForPage` called without currentPage >= 1 guard. *Fix:* Store timer ref; clear in cleanup. Add page number validation.

**BUG-A7-3-207-209** `ScaleCalibration.tsx:50,22,29` MEDIUM — `parseFraction("1/0")`, ratio `DPI/0`, civil `DPI/0` all return Infinity as pixelsPerUnit. *Fix:* Guard denominator === 0 before computing scale.

**BUG-A7-3-210** `ScaleCalibration.tsx:188` MEDIUM — `handleManualSave` hardcodes `unit: 'ft'` for all label types. Metric scales get wrong unit. *Fix:* Resolve unit via same ARCH_RATIOS_FT lookup as handleSelectScale.

**BUG-A7-3-211/212** `MergeSplitTool.tsx:86,56` MEDIUM — Escape handler requires div focus (not window-level). Stale firstPolyId if polygon deleted between merge clicks. *Fix:* Window-level listener; validate firstPolyId still exists in store.

**BUG-A7-3-213/214** `ThreeDScene.tsx:51,80` MEDIUM — Duplicate Zustand subscription to same slice. `scale` in useMemo deps never read inside memo — re-runs unnecessarily. *Fix:* Remove duplicate selector; remove `scale` from memo deps.

**BUG-A7-3-217** `src/lib/polygon-utils.ts:75` MEDIUM — `mergePolygons` fallback concatenates vertex arrays into geometrically invalid self-intersecting polygon. *Fix:* Return null (failed merge) instead of concatenating.

**BUG-A7-3-218** `src/lib/polygon-utils.ts:38` MEDIUM — `calculateLinearFeet` doesn't guard against negative pixelsPerUnit. *Fix:* `if (!pixelsPerUnit || pixelsPerUnit <= 0) return 0;`

**BUG-A7-3-219** `src/lib/snap-utils.ts:104` MEDIUM — `getGridSnapPoints` can generate >40k candidates per cursor move (gridSize=1, snapRadius=100). Causes UI jank. *Fix:* `range = Math.min(Math.ceil(snapRadius / gridSize), 20)`.

**BUG-A7-3-220** `src/lib/snap-utils.ts:34` MEDIUM — `getPolygonSnapPoints` allocates O(total_vertices) SnapPoint objects on every mousemove. *Fix:* Pre-build and cache snap-point array per polygon; invalidate only when polygon points change.

**BUG-A7-3-221** `src/lib/snap-utils.ts:88` MEDIUM — `snapToGrid(x, y, 0)` computes `Math.round(x/0) * 0 = NaN`. *Fix:* `if (gridSize <= 0) return { x, y };`

**BUG-A7-3-222** `src/lib/auto-scale.ts:145` MEDIUM — `collectRatios` hardcodes `unit='ft'`. Metric ratio scales like `"1:100"` mislabeled. *Fix:* Use `'m'` for metric ratio scales.

**BUG-A7-3-223** `MeasurementTool.tsx:90` MEDIUM — `pxDistance` computed in screen-space pixels but divided by `scale.pixelsPerUnit` (PDF-space). Wrong measurement at any non-100% zoom. *Fix:* Convert screen-space distance to PDF-space before dividing by pixelsPerUnit.

### 4.3 LOW Severity — A7 (Key Items)

- `BUG-A7-3-013` store.ts:306 — `updateClassification` mutates incoming `patch` parameter
- `BUG-A7-3-014/015` store.ts:507,508 — `deleteSelectedPolygons` fires N individual DELETE requests; uses raw `fetch()` not `apiSync()`
- `BUG-A7-3-016` store.ts:888 — `setGridSize` accepts 0 or negative values
- `BUG-A7-3-017` store.ts:396 — `addPolygon` doesn't validate `classificationId` exists
- `BUG-A7-3-018` store.ts:367 — `mergeClassifications` doesn't update `repeatingGroups`
- `BUG-A7-3-019` use-feature-flag.ts:30 — useState initializer returns false before fetch; flash of disabled state
- `BUG-A7-3-020` use-feature-flag.ts:39 — useEffect missing cleanup; setEnabled can fire after unmount
- `BUG-A7-3-021` use-text-search.ts:36 — projectId URL-interpolated without encodeURIComponent
- `BUG-A7-3-022` use-text-search.ts:32 — isLoading not set immediately on query change
- `BUG-A7-3-023` useRealtimeSync.ts:18 — connectToProject not wrapped in try-catch
- `BUG-A7-3-024` useViewerPresence.ts:22 — viewer count allows 0; minimum should be 1
- `BUG-A7-3-060` CanvasOverlay.tsx:558 — 3000 new closure instances per render for 1000 polygons
- `BUG-A7-3-063` CanvasOverlay.tsx:464 — hardcoded +20 duplicate offset differs wildly at different zoom levels
- `BUG-A7-3-101` AnnotationTool.tsx:66 — annotation saved to wrong page if user navigates between pin and Enter
- `BUG-A7-3-106` CutTool.tsx:45 — rapid double-click pushes redundant undo snapshot
- `BUG-A7-3-109` CutTool.tsx:41 — no touch event handlers; 300ms delay on mobile
- `BUG-A7-3-156` FloorAreaMesh.tsx:60 — collinear points produce zero-area polygon / degenerate triangles
- `BUG-A7-3-158-165` ManualCalibration.tsx — 8 buttons missing `type="button"` attribute
- `BUG-A7-3-167` ManualCalibration.tsx:72 — no minimum pixel distance threshold; accidental double-click corrupts scale
- `BUG-A7-3-173` AutoScalePopup.tsx:52 — 50ms setInterval (not requestAnimationFrame) drains battery
- `BUG-A7-3-224` ThreeDScene.tsx:87 — visibilityHiddenIds is Array not Set; O(n) includes()
- `BUG-A7-3-225` ScaleCalibrationPanel.tsx:95 — unit select only offers ft/m/in; cm and mm not available
- `BUG-A7-3-226` ScalePanel.tsx:94 — currentPage prop accepted but never used; dead prop
- `BUG-A7-3-229` polygon-utils.ts:51 — pointInPolygon denominator guard is unreachable dead code

---

## SECTION 5 — A8: Pages + Infra + Migrations (MEDIUM/LOW Remaining)

### 5.1 Client-Side Security (MEDIUM)

**BUG-A8-3-005** `src/app/page.tsx:672` MEDIUM — printUrl embeds projectId without encodeURIComponent. *Fix:* Encode all dynamic URL params.

**BUG-A8-3-006/007** `src/app/page.tsx:383,444` MEDIUM — No UUID format validation before hydrateProject or API fetch. Path traversal chars in projectId could target unintended endpoints. *Fix:* Validate UUID format before use.

**BUG-A8-3-009/010** `src/app/page.tsx:719,811` MEDIUM — Raw error.message from API failures shown in UI. Leaks internal server details. *Fix:* Show generic "AI processing failed"; log full error internally.

**BUG-A8-3-025** `src/app/error.tsx:1` MEDIUM — File named `error.tsx` does not catch errors in root layout in Next.js App Router. Must be `global-error.tsx` with `<html><body>` wrappers. *Fix:* Rename and wrap.

**BUG-A8-3-027** `src/app/error.tsx:8` MEDIUM — `captureError` in useEffect: if error tracker throws, blank screen from within the error boundary. *Fix:* Wrap captureError in try-catch.

**BUG-A8-3-033** `src/app/projects/page.tsx:348` MEDIUM — `handlePageDrop` stale closure captures `handlePdfUpload` not in deps. *Fix:* Add handlePdfUpload to deps array.

**BUG-A8-3-036** `src/app/projects/page.tsx:232` MEDIUM — Duplicate name check only against client-side list. Server-side duplicates possible from concurrent tabs. *Fix:* Handle 409 response; server-side unique constraint.

**BUG-A8-3-038** `src/app/projects/page.tsx:437` MEDIUM — Context menu positioned at clientX/clientY without viewport boundary clamping. Renders off-screen on small displays. *Fix:* Clamp to `Math.min(x, window.innerWidth - menuWidth - 8)`.

**BUG-A8-3-044** `src/app/settings/page.tsx:60` MEDIUM — `defaultScale` and `applyToAll` states never persisted. Changes silently lost on reload. *Fix:* Persist to localStorage on change.

**BUG-A8-3-045** `src/app/settings/page.tsx:64` MEDIUM — If `loadMeasurementSettings()` returns null (first run), Measurements tab renders nothing with no fallback. *Fix:* Show default form with `DEFAULT_MEASUREMENT_SETTINGS` when null.

**BUG-A8-3-049** `src/app/settings/page.tsx:82` MEDIUM — `Math.random().toString(36).slice(2)` for API key IDs. Not cryptographically random; collision risk. *Fix:* `crypto.randomUUID()`.

**BUG-A8-3-052/053** `src/app/library/page.tsx:56,130` MEDIUM — Supabase-not-configured error gives no actionable guidance. handleDelete optimistic UI update has no rollback on error. *Fix:* Show docs link; rollback on delete failure.

**BUG-A8-3-054** `src/app/library/page.tsx:143` MEDIUM — `handleImportOpen` fetches projects on every modal open with no caching. Rapid open/close fires concurrent requests. *Fix:* Cache project list for 30s; deduplicate concurrent fetches.

**BUG-A8-3-060** `src/app/print/page.tsx:1` MEDIUM — No `@page size` orientation guard. Forces landscape for all prints regardless of drawing aspect ratio. *Fix:* Auto-detect portrait vs landscape from PDF aspect ratio.

**BUG-A8-3-065** `src/app/share/[token]/page.tsx:104` MEDIUM — `window.open()` for exports without rel="noopener noreferrer" semantics. Share token leaked to opened page via Referer header. *Fix:* Add anchor with `rel="noopener noreferrer"` before opening.

**BUG-A8-3-066** `src/app/share/[token]/page.tsx:116` MEDIUM — Link `/?project=${project.id}` exposes internal project UUID to any public share page viewer. *Fix:* Remove or gate behind auth check.

**BUG-A8-3-068** `src/app/share/[token]/page.tsx:104` MEDIUM — `handleExport` calls window.open() without checking res.ok or handling errors. Export failures silently swallowed. *Fix:* Check res.ok; show error toast on failure.

**BUG-A8-3-070** `src/app/share/[token]/page.tsx:40` MEDIUM — `project.state` fields used without defensive checks. Missing `polygons` array causes uncaught TypeError at runtime. *Fix:* Add optional chaining and default empty arrays.

**BUG-A8-3-075-078** `next.config.ts` MEDIUM — `connect-src` doesn't whitelist `cdn.jsdelivr.net` (used in other directives). `'unsafe-eval'` + `'unsafe-inline'` in `script-src` renders CSP effectively useless against XSS. No startup validation of critical env vars. *Fix:* Remove `unsafe-eval`; use nonces or hashes; validate env vars on startup.

**BUG-A8-3-084** `vercel.json:7` MEDIUM — `/api/projects/[id]/upload` has `memory: 1024` but no other routes have memory configured. Large PDF processing in ai-takeoff may silently OOM. *Fix:* Add explicit memory limits to ai-takeoff and vision-search routes.

**BUG-A8-3-085** `vercel.json:1` MEDIUM — Single region `iad1` with no failover. Regional outage = full outage. *Fix:* Configure multi-region deployment or document failover procedure.

**BUG-A8-3-093-096** `public/sw.js` MEDIUM — Auth route NetworkOnly has no offline fallback. Catch-all has no timeout. Duplicate/conflicting route registrations. NetworkFirst `/api/projects` has no networkTimeoutSeconds. *Fix:* Add offline fallbacks; deduplicate route registrations; add network timeouts.

**BUG-A8-3-108** `package.json` MEDIUM — Transitive dependency `hono < 4.12.7` has Prototype Pollution via `parseBody({dot:true})`. *Fix:* `npm audit fix` to update hono.

**BUG-A8-3-109** `package.json:32` MEDIUM — `"lint": "eslint"` has no target path or config flags. Running `npm run lint` errors or lints nothing. *Fix:* `"lint": "eslint . --ext .ts,.tsx"`.

**BUG-A8-3-110** `package.json` MEDIUM — No `"typecheck"` script for `tsc --noEmit` as CI gate. Type errors slip into builds silently. *Fix:* Add `"typecheck": "tsc --noEmit"` script.

**BUG-A8-3-111** `package.json:37` MEDIUM — `--experimental-strip-types` is unstable; produces CI warnings; may break on Node.js upgrades. *Fix:* Use `tsx` or `ts-node` instead.

**BUG-A8-3-112** `package.json:25` MEDIUM — `next` pinned to exact version `16.1.6` (no caret). `npm audit fix` will never auto-pull the patched `16.1.7+`. *Fix:* Change to `"^16.1.7"`.

### 5.2 Database Migrations (MEDIUM)

**BUG-A8-3-126** `001_mx_tables.sql:50` MEDIUM — `mx_set_updated_at()` trigger function created with no `SET search_path`. Vulnerable to search_path injection. *Fix:* Add `SET search_path = public, pg_temp` to trigger function.

**BUG-A8-3-127/128** `001_mx_tables.sql:57,62` MEDIUM — Triggers created without `DROP TRIGGER IF EXISTS` guard. Not idempotent; re-run fails. *Fix:* Add `DROP TRIGGER IF EXISTS` before each `CREATE TRIGGER`.

**BUG-A8-3-130** `002_mx_history.sql` MEDIUM — `mx_history.entity_id` has no foreign key constraint. Orphaned history rows possible. *Fix:* Add FK constraint with appropriate ON DELETE behavior.

**BUG-A8-3-132** `003_mx_assemblies.sql` MEDIUM — No `updated_at` trigger for `mx_assemblies` in this migration. If applied alone, column exists but never auto-updates. *Fix:* Add trigger in 003 or make 009 idempotent with `CREATE TRIGGER IF NOT EXISTS`.

**BUG-A8-3-133** `006_estimates.sql` MEDIUM — Duplicate migration prefix with `006_mx_formula_fields.sql`. Execution order between them is undefined. *Fix:* Renumber one to `006b_` or next available ordinal.

**BUG-A8-3-135** `006_estimates.sql:18` MEDIUM — `uq_mx_estimates_proj_class` UNIQUE constraint without `IF NOT EXISTS` guard. Fails if migration re-run. *Fix:* Wrap with `IF NOT EXISTS` or use `DO $$ BEGIN ... EXCEPTION WHEN duplicate_table THEN NULL; END $$;`.

**BUG-A8-3-137** `009_complete_schema.sql:87` MEDIUM — `mx_estimates` in 009 missing the UNIQUE constraint from 006. Fresh database without 006 allows duplicate estimate rows. *Fix:* Add `ALTER TABLE mx_estimates ADD CONSTRAINT uq_mx_estimates_proj_class UNIQUE (project_id, classification_id);` with IF NOT EXISTS.

**BUG-A8-3-138** `009_complete_schema.sql:105` MEDIUM — `mx_set_updated_at()` still has no `SET search_path`. Same vulnerability as 001. *Fix:* Add `SET search_path = public, pg_temp`.

**BUG-A8-3-139** `013_classification_library.sql` MEDIUM — Duplicate migration prefix with `013_mx_pages_text.sql`. Execution order undefined. *Fix:* Renumber one.

**BUG-A8-3-140** `013_classification_library.sql:25` MEDIUM — `GRANT SELECT ON mx_classification_library TO anon`. Unauthenticated users can read unit_cost pricing data. *Fix:* Revoke anon SELECT; add RLS policy for authenticated users only.

**BUG-A8-3-142** `013_classification_library.sql` MEDIUM — No update policy guard on `is_org` column. Any user can promote their own entry to org-visible. *Fix:* Restrict `is_org = true` updates to admin role only.

**BUG-A8-3-143** `013_mx_pages_text.sql:7` MEDIUM — `UPDATE mx_pages SET text = pdf_url WHERE pdf_url IS NOT NULL` — copies PDF URL strings into the text column. Corrupts text column with URLs. *Fix:* Either set text to empty string or null, not the URL value.

**BUG-A8-3-144** `015_pdf_storage_bucket.sql` MEDIUM — No storage RLS policies for the `pdfs` bucket. Any role may upload or download other users' PDFs. *Fix:* Add storage policies scoping access to `auth.uid() = owner_id`.

**BUG-A8-3-147** `016_assemblies_grants.sql` MEDIUM — No `_migrations` record inserted. Migration not tracked; idempotency checking impossible. *Fix:* Add migration tracking INSERT.

**BUG-A8-3-153** `017_mx_groups.sql` MEDIUM — No `updated_at` trigger for `mx_groups`. Column exists but never auto-updates. *Fix:* Add trigger.

**BUG-A8-3-155** `018_mx_groups_rls_fix.sql` MEDIUM — No idempotency guard for DROP POLICY statements. Re-run causes errors if policies already dropped. *Fix:* Add `DROP POLICY IF EXISTS` guards.

**BUG-A8-3-156** `019_assemblies_anon_grant_fix.sql` MEDIUM — `anon` still retains SELECT on `mx_assemblies` after revoke. Combined with USING(true) RLS policy, unauthenticated users can read all assembly/cost data. *Fix:* Also revoke SELECT for anon; update RLS policy to require `auth.role() = 'authenticated'`.

### 5.3 LOW Severity — A8 (Key Items)

- `BUG-A8-3-011` page.tsx:469 — `loadDemoProject()` return not null-checked before accessing `.state`
- `BUG-A8-3-012` page.tsx:415 — `Promise.all` with `.catch(() => null)` — null dereference possible after catch
- `BUG-A8-3-013` page.tsx:535 — `flushSave` silently swallows save errors; user may not notice data loss
- `BUG-A8-3-016` page.tsx:602 — Same file re-upload doesn't reset input value; re-select of same file no-ops
- `BUG-A8-3-017` page.tsx:689 — AI takeoff keyboard shortcut fires even when `aiLoading` is true
- `BUG-A8-3-018` page.tsx:543 — Pending autosave for old project can fire after projectId changes
- `BUG-A8-3-022` layout.tsx:28 — Missing Twitter card meta tags; no rich preview on Twitter/X shares
- `BUG-A8-3-023` layout.tsx:39 — `maximumScale: 1` prevents pinch-to-zoom on mobile (WCAG 1.4.4 violation)
- `BUG-A8-3-028` error.tsx:1 — Error UI not full-screen; looks broken as a root-level error boundary
- `BUG-A8-3-029` error.tsx:19 — error.digest not shown to user; impossible to report specific errors to support
- `BUG-A8-3-039` projects/page.tsx:437 — Context menu has no keyboard accessibility (role="menu", keyboard nav)
- `BUG-A8-3-046` settings/page.tsx:75 — `teamName` state never persisted; always lost on reload
- `BUG-A8-3-047/048` settings/page.tsx:160,188 — "Change Email", "Change Password", "Sign Out" buttons have no onClick handlers; non-functional placeholders
- `BUG-A8-3-056` learn/page.tsx:1 — No auth check on Learn page (low risk if static, but inconsistent)
- `BUG-A8-3-057/058` learn/page.tsx:209,228 — Tutorial cards, Video Guide play buttons, Help Center, Contact Support all non-functional dead UI
- `BUG-A8-3-067` share/[token]/page.tsx:148 — `formattedDate` uses `new Date()` at render time; SSR vs client hydration mismatch
- `BUG-A8-3-071` share/[token]/page.tsx:116 — Link with project UUID allows editor access attempt bypassing share-only intent
- `BUG-A8-3-072` share/[token]/page.tsx:375 — "Shared by Contractor" hardcoded; does not reflect actual sharer identity
- `BUG-A8-3-079` next.config.ts:33 — `worker-src` allows cdn.jsdelivr.net; supply-chain risk
- `BUG-A8-3-080` next.config.ts:35 — `script-src-elem` includes `'unsafe-inline'`; bypasses CSP nonce/hash protections
- `BUG-A8-3-081` next.config.ts:1 — No HSTS header; vulnerable to SSL stripping on first connection
- `BUG-A8-3-086` vercel.json:40 — Empty `rewrites: []` array; accidentally deleted rules would cause silent 404s
- `BUG-A8-3-090` share/[token]/page.tsx:104 — `URL.createObjectURL(blob)` revoked synchronously after click; download may fail in some browsers
- `BUG-A8-3-097` public/sw.js:1 — `skipWaiting:true` + `clientsClaim:true` activates SW immediately; may cause half-updated UI
- `BUG-A8-3-098` public/sw.js:1 — `navigationPreload:true` but no `handlerDidError` fallback; navigation throws offline
- `BUG-A8-3-100-104` public/manifest.json — Missing: orientation field, categories, lang, id, scope fields
- `BUG-A8-3-113` package.json — No prepare/postinstall for pre-commit hooks; unformatted code can be committed
- `BUG-A8-3-114` package.json — No `engines` field; incompatible Node/npm versions accepted silently
- `BUG-A8-3-115` package.json — `migrate` script uses `npx tsx` (network-fetched); supply-chain risk in production migrations
- `BUG-A8-3-141` 013_classification_library.sql — Seeded org templates use `created_by = null`; ownership ambiguous; policy logic fragile
- `BUG-A8-3-159/160` 012_share_token.sql, 011_add_formula_columns.sql — Redundant re-applications of earlier migrations inflate history without value

---

## SECTION 6 — PRIORITY ROADMAP

### Cycle 4 Recommended Fix Order

#### Tier 1 — Regressions (fix immediately)
1. **REG-003** — hydrateState data leak on project switch (HIGH regression, data integrity)
2. **REG-004** — Store mutation inside React updater causing double API calls (HIGH regression)
3. **REG-005** — MarkupTools still non-operational (HIGH regression, user-visible feature broken)
4. **REG-006** — mx_groups RLS fix migration references non-existent column (CRITICAL regression in DB)
5. **REG-008** — _exec_sql arbitrary SQL function still grantable to public (CRITICAL security regression)
6. **REG-007** — CM unit accepted by DB but not producible by API or UI (consistency regression)

#### Tier 2 — MEDIUM Security/Data Integrity (this sprint)
7. Race conditions: BUG-A5-3-008, -132, -210, -220, -316, -319, -320, -322
8. Rate limiter logic: BUG-A5-3-407, -406 (REG-001, REG-002)
9. Scale calculation Infinity/NaN: BUG-A7-3-207-209, -008, -218
10. Quantity unit display wrong for metric projects: BUG-A5-3-314
11. Inconsistent response shapes: BUG-A5-3-317, -318
12. Missing auth on metrics/flags/perf-summary: BUG-A5-3-021, -105, -112
13. DB migration fixes: BUG-A8-3-133, -139 (duplicate prefixes), -143 (data corruption), -147, -155

#### Tier 3 — MEDIUM UX/Accessibility (next sprint)
14. AbortController/unmount safety: BUG-A6-3-004/005, -012/013, -200, -300, -400/402, -423
15. ARIA/dialog semantics: BUG-A6-3-015/016, -103, -107, -204, -301/302, -407/410, -411/414, -421, -433
16. Store undo completeness: BUG-A7-3-004, -005, -006
17. React render performance: BUG-A7-3-055, -059, -219, -220, BUG-A6-3-309-311
18. Touch device support: BUG-A7-3-068/069, -115

#### Tier 4 — LOW (ongoing backlog)
- Aria-labels on inputs/buttons (A6, ~30 items)
- Button type="button" missing (A7, 8 items)
- Missing meta tags, manifest fields, PWA quality (A8)
- Code cleanup: dead props, dead code, unnecessary re-computations

---

## APPENDIX — BUG ID QUICK REFERENCE

| Bug ID Range | Sector | Count | Primary Category |
|---|---|---|---|
| BUG-A5-3-003..021 | API/Backend | 8 | Rate limiting + info disclosure |
| BUG-A5-3-102..133 | API/Backend | 14 | Input validation, races |
| BUG-A5-3-202..324 | API/Backend | 25 | Races, validation, leaks |
| BUG-A5-3-406..411 | Backend libs | 6 | Memory leaks, SSR guards |
| BUG-A6-3-001..438 | Components | 129 | Abort safety, ARIA, perf |
| BUG-A7-3-001..232 | Store/Drawing | 93 | Store logic, geometry, perf |
| BUG-A8-3-001..160 | Pages/Infra | 97 | Security, config, migrations |
| REG-001..008 | All sectors | 8 | Regression / incomplete fixes |
| **TOTAL** | | **380+** | |

---

*Audit complete — 2026-03-20 13:04 ET*
*Auditor: Admiral 5 (P.I.K.E.) — Cycle 4*
*Next action: Dispatch fix wave to engineering teams by severity tier*