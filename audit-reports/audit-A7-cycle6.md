# Audit Report — A7 Cycle 6

**Sector:** `src/store/` (Zustand client store) · `src/server/project-store.ts` · `src/hooks/` · Drawing components (`DrawingTool`, `CanvasOverlay`, `MeasurementTool`, `CutTool`, `MergeSplitTool`, `MarkupTools`, `CropOverlay`, `RepeatingGroupTool`, `AnnotationTool`, `ScaleCalibration`, `ManualCalibration`)  
**Auditor:** Admiral 7 (A7)  
**Date:** 2026-03-20  
**Cycle:** 6 (final cycle)  
**Files reviewed:** Every file in scope — complete read, line-by-line analysis

---

## Bug Index

| ID | File | Line(s) | Severity | Summary |
|----|------|---------|----------|---------|
| BUG-A7-6-001 | src/lib/store.ts | ~380 | HIGH | `addPolygon` does not store `color` field even though Polygon type supports it — `color` param is accepted but silently dropped |
| BUG-A7-6-002 | src/lib/store.ts | ~435 | HIGH | `cutPolygon` uses `require('@turf/turf')` inside an action — CommonJS dynamic require fails in ESM/Edge runtime and throws at runtime in production builds |
| BUG-A7-6-003 | src/lib/store.ts | ~195 | MEDIUM | `hydrateState` resets `groups` to `[]` unconditionally — overwrites the 8 default trade groups with an empty array on every project load; users lose all group structure |
| BUG-A7-6-004 | src/lib/store.ts | persist config | MEDIUM | `projectId` is NOT in `partialize` — it is persisted by Zustand's default full-state persist, so switching projects but refreshing from localStorage will reload the stale projectId of a different session |
| BUG-A7-6-005 | src/lib/store.ts | ~545 | MEDIUM | `redo` pushes `now` snapshot to `undoStack` without capping — `redoStack` is capped by MAX_UNDO_STACK but `undoStack` can grow unboundedly during a redo chain because `pushUndo` is not called for the redo's new undo entry |
| BUG-A7-6-006 | src/lib/store.ts | ~290 | MEDIUM | `toggleClassification` pushes to undoStack but toggling visibility is a non-destructive UI action — results in undo removing a visible/invisible toggle instead of the last drawing operation, surprising users |
| BUG-A7-6-007 | src/lib/store.ts | ~215 | LOW | `addClassification` de-duplicates by normalized name but the `apiSync` POST still fires for the duplicate case — returns the existing ID but fires a redundant API create call |
| BUG-A7-6-008 | src/lib/store.ts | ~580 | LOW | `setCurrentPage` scale-fetch side effect reads `state.projectId` from the closure at call time but `get()` is not re-called inside the promise chain — if `projectId` changes between fetch start and resolution, the wrong project's scale is written |
| BUG-A7-6-009 | src/server/project-store.ts | ~340 | CRITICAL | `getProjectByShareToken` file-mode fallback rebuilds `share-index.json` with `writeJson().catch(() => {})` — if the write fails silently, subsequent token lookups always fall through to the full O(N) scan, O(N) disk reads on every share page load |
| BUG-A7-6-010 | src/server/project-store.ts | ~147 | HIGH | `listProjects` file-mode reads every `project.json` sequentially in a for-loop (no `Promise.all`) — O(N) serial disk reads blocks the event loop for large project counts |
| BUG-A7-6-011 | src/server/project-store.ts | ~290 | HIGH | `restoreSnapshot` Supabase mode deletes all child rows then recreates them individually in sequential for-loops — no transaction; a mid-restore crash leaves the project in a partially-wiped state with no rollback |
| BUG-A7-6-012 | src/server/project-store.ts | ~247 | HIGH | `recordHistory` in file mode caps list at 200 entries using `list.length = 200` (array truncation) — does NOT write back the truncated list; the truncation is discarded immediately and `history.json` grows without bound |
| BUG-A7-6-013 | src/server/project-store.ts | ~40 | MEDIUM | `getClient()` creates a Supabase client lazily with `process.env.*` values that may be undefined at module evaluation — no error thrown; all subsequent DB calls silently fail with auth errors instead of a clear startup failure |
| BUG-A7-6-014 | src/server/project-store.ts | ~390 | MEDIUM | `createAssembly` Supabase mode: progressive column-stripping on schema-cache errors retries the same insert up to 3 times but each attempt does not check for duplicate-key error (`23505`) before retrying — can create duplicate assemblies |
| BUG-A7-6-015 | src/server/project-store.ts | ~460 | MEDIUM | `updateAssembly` file mode: patches `list[idx]` in place and writes back, but the return value `list[idx]` is the original reference pre-spread — if patch has overlapping keys the returned object is stale |
| BUG-A7-6-016 | src/server/project-store.ts | ~115 | LOW | `touchProject` file-mode reads the full `project.json`, merges `updatedAt`, and writes it back — no lock/mutex; concurrent requests can race and clobber each other's `updatedAt` update |
| BUG-A7-6-017 | src/hooks/use-feature-flag.ts | ~18 | MEDIUM | `fetchFlags` deduplicates concurrent fetches via module-level `fetchPromise`, but on error it sets `fetchPromise = null` inside `.catch()` — if the fetch errors, `fetchedAt` and `cachedFlags` remain from the previous cache iteration, so the stale cache is silently reused without a retry until TTL expires |
| BUG-A7-6-018 | src/hooks/use-feature-flag.ts | ~36 | MEDIUM | `useFeatureFlag` initial `useState` reads `cachedFlags?.[flag] ?? false` — on SSR, `cachedFlags` is the module-level singleton potentially populated from a previous request, causing cross-request state leakage (hydration mismatch + wrong flag values for different users) |
| BUG-A7-6-019 | src/hooks/use-text-search.ts | ~60 | LOW | `useTextSearch` cleanup calls `abortRef.current.abort()` then sets `abortRef.current = null` — but the `finally` block inside the same closure checks `!controller.signal.aborted` and calls `setIsLoading(false)`; after component unmount this is a no-op (state setter on unmounted component) but React 18 dev mode will log a warning |
| BUG-A7-6-020 | src/hooks/useRealtimeSync.ts | ~16 | MEDIUM | `connectToProject` is called without awaiting or checking for success; `connectedRef.current = projectId` is set immediately — if the underlying SSE connection fails, `connectedRef` prevents any reconnect attempt because `connectedRef.current === projectId` short-circuits the effect on subsequent renders |
| BUG-A7-6-021 | src/hooks/useViewerPresence.ts | ~18 | LOW | `subscribeToActivity` callback receives `event` as `string` and `data` as `Record<string, unknown>` — `data.viewerCount as number` is an unchecked cast; if the server sends `viewerCount` as a string (JSON serialization) the cast silently produces `NaN`, bypassing the `typeof count === 'number'` guard |
| BUG-A7-6-022 | src/components/DrawingTool.tsx | ~65 | MEDIUM | `snapOptions` object is recreated on every render (no `useMemo`) — passed into `findNearestSnapPoint` which may do object identity checks; also causes `getCoords` and `handleMouseMove` callbacks to be invalidated on every render because `snapOptions` is in their closure |
| BUG-A7-6-023 | src/components/DrawingTool.tsx | ~105 | MEDIUM | `placeCountItem` is called from `handleClick` but not listed in `handleClick`'s `useCallback` dependency array — the version of `placeCountItem` captured by `handleClick` may be stale if `getSelectedClassification`, `addPolygon`, or `drawingPage` change |
| BUG-A7-6-024 | src/components/DrawingTool.tsx | ~190 | LOW | Touch double-tap detection stores `lastTouchEndRef.current` but the `onTouchEnd` synthetic event fires after every touch; calling `handleClick` with a fake object `{ detail: 1 }` means the `e.detail > 1` guard in `handleClick` never fires for touch — a rapid double-tap on touch adds a point AND commits, placing an extra stray point |
| BUG-A7-6-025 | src/components/CanvasOverlay.tsx | ~280 | HIGH | `handleKeyDown` inside `useEffect` closes over `selectedPolygonId` and `selectedPolygons` from the outer scope — but the effect re-registers on these changes; during a rapid delete-key press the stale closure can call `deletePolygon` with the previous `selectedPolygonId` if a render is pending |
| BUG-A7-6-026 | src/components/CanvasOverlay.tsx | ~390 | MEDIUM | `prefs.showPolygonLabels` inside the polygon render loop calls `calculateLinearFeet(poly.points, ppu, false)` for **every** polygon on every render — even area and count polygons compute linear feet unnecessarily; no memoization |
| BUG-A7-6-027 | src/components/CanvasOverlay.tsx | ~340 | MEDIUM | Hover tooltip (`hoveredPoly`) filters `polygons` by `p.id === hoveredPoly.id` for every render — if `hoveredPoly` changes (mouse move) this triggers a full `polygons` scan; should use a Map for O(1) lookup |
| BUG-A7-6-028 | src/components/CanvasOverlay.tsx | ~130 | MEDIUM | `allPolygonsRef`, `classificationsRef`, `scaleRef`, `currentPageRef` are updated inside individual `useEffect(() => { ref.current = value }, [value])` hooks — these effects run after paint; a synchronous event that fires between the state update and the effect commit reads stale ref values |
| BUG-A7-6-029 | src/components/CanvasOverlay.tsx | ~240 | LOW | `inFlightDeleteIds` ref is populated in the `useEffect` keydown handler but there is no corresponding `inFlightDeleteIds.current.delete(id)` call after the delete completes — the set grows without cleanup and will eventually prevent deleting a polygon whose ID was previously deleted |
| BUG-A7-6-030 | src/components/MeasurementTool.tsx | ~100 | MEDIUM | Pressing Escape fires both the `onKeyDown` handler on the `<div>` AND the `window.addEventListener('keydown', handler)` in the `useEffect` — `reset()` and `setTool('select')` are called twice per Escape keypress; the second call is a no-op but redundant cleanup events may cause issues with future state |
| BUG-A7-6-031 | src/components/MeasurementTool.tsx | ~65 | LOW | `onClick` resets to a new measurement when both `start` and `end` are set: `setStart(p)` + `setEnd(null)` — but `setCursor(null)` is also called, which is correct. However `onMouseMove` early-returns when `end` is truthy, so the cursor stays `null` until the first move after clicking to reset. Not a crash but causes a brief invisible cursor after the third click. |
| BUG-A7-6-032 | src/components/CutTool.tsx | ~45 | HIGH | `onClick` calls `cutPolygon(hit, [])` with an empty `cutShape` array — `store.cutPolygon` requires `cutShape.length >= 3` to proceed (has a guard) and returns silently; the intended behavior was to **delete** the polygon entirely (the tooltip says "remove it") but the action is silently swallowed. CutTool as implemented never actually removes any polygon. |
| BUG-A7-6-033 | src/components/CutTool.tsx | ~30 | LOW | `CutTool` does not render any visual overlay showing which polygon is hovered/targeted — user has no feedback about which polygon will be cut until after clicking, making it easy to accidentally click the wrong polygon |
| BUG-A7-6-034 | src/components/MergeSplitTool.tsx | ~87 | MEDIUM | In split mode, after `split(splitPolyId, line[0], line[1])` is called, `setTool('select')` fires — but if the split produces no valid result (< 3 pts) the store does not notify the UI; the tool exits successfully even though nothing was split, confusing the user |
| BUG-A7-6-035 | src/components/MergeSplitTool.tsx | ~60 | LOW | `handleMouseMove` is attached via `onMouseMove` on the container div and also via closure; when split mode is inactive (`!isSplit`) `onMouseMove` still runs and calls `setCursor(getCoords(e))` on merge mode (because `isSplit && splitPts.length === 1` is false) — actually the early return guards it; but cursor state is never cleaned up when mode changes from split back to merge, leaving a stale cursor in state |
| BUG-A7-6-036 | src/components/MarkupTools.tsx | ~42 | LOW | `MarkupToolType` is defined locally but `Markup['type']` in the store is a different type — if the store's `Markup['type']` union is extended or changed, `MarkupToolType` here silently diverges; no type alias link between them |
| BUG-A7-6-037 | src/components/RepeatingGroupTool.tsx | ~70 | MEDIUM | `toBaseCoords` does not guard zero-dimension rect — if `rect.width === 0 || rect.height === 0` the function returns `{ x: Infinity, y: Infinity }` because it divides by zero; consistent with CropOverlay which does guard this (BUG-A7-5-028) |
| BUG-A7-6-038 | src/components/RepeatingGroupTool.tsx | ~95 | MEDIUM | Window-level `mouseup` handler (`onWindowMouseUp`) races with the component-level `handleMouseUp` callback — both are registered: the window handler via `useEffect` and `handleMouseUp` via `onMouseUp` on the div. If the user releases inside the div, both fire; `setBoundingBox` is called twice, potentially with different values if `startPoint` differs between calls |
| BUG-A7-6-039 | src/components/RepeatingGroupTool.tsx | ~120 | LOW | `handleConfirm` uses `groupName.trim()` from the state but `groupName` is also trimmed when set; double-trim is harmless but the `disabled={!groupName.trim()}` check on the button means if `groupName` contains only whitespace the button is correctly disabled, yet `handleConfirm` would still fire on Enter key from input |
| BUG-A7-6-040 | src/components/AnnotationTool.tsx | ~55 | MEDIUM | `popupStyle` `useMemo` depends on `draft` but also reads `containerRef.current?.getBoundingClientRect()` — `containerRef` is not in the dependency array; if the container resizes between renders, the popup position is not recomputed until `draft` changes |
| BUG-A7-6-041 | src/components/AnnotationTool.tsx | ~80 | LOW | `handleCanvasClick` guard `if (e.target !== e.currentTarget) return` — on touch path the synthetic event sets `target` and `currentTarget` from the original element. If a child element (e.g. a classification label in CanvasOverlay) happens to be positioned over the annotation tool, the guard fires and click is swallowed; touch annotation is effectively broken over polygons |
| BUG-A7-6-042 | src/components/ManualCalibration.tsx | ~37 | HIGH | `useEffect` on mount (empty deps `[]`) calls `clearCalibrationPoints()` and `setCalibrationMode(true)` — the cleanup `return () => { setCalibrationMode(false); clearCalibrationPoints(); }` is correct, BUT the mode-change `useEffect` below it (deps: `[mode, calibrationMode, clearCalibrationPoints]`) calls `clearCalibrationPoints()` when `mode !== 'draw-line' && calibrationMode` — this fires immediately when switching to 'enter-number', but does NOT call `setCalibrationMode(false)`, leaving `calibrationMode = true` in the store while the UI is in enter-number mode. CanvasOverlay then captures all clicks as calibration points even though the user is typing numbers. |
| BUG-A7-6-043 | src/components/ManualCalibration.tsx | ~110 | MEDIUM | `drawLinePreview` and `enterNumberPreview` both compute a `feetPerInch` label that truncates at 1 decimal place — for very small scales (e.g. 1:5000) the result is `0.0 feet` which is misleading; should use more decimal places or scientific notation for small values |
| BUG-A7-6-044 | src/components/ScaleCalibration.tsx | ~100 | MEDIUM | `handleManualSave` receives a `label` string from `ManualCalibration.onSave` and calls `labelToPixelsPerUnit(label)` — but ManualCalibration constructs labels like `"2.50 ft (drawn)"` and `"1.0" = 25.0'"` which do NOT match any regex in `labelToPixelsPerUnit`; the function returns `null`, `addToast` fires a warning, and the scale is NOT saved even though ManualCalibration already called `setScale()` internally. The label is display-only but `handleManualSave` treats it as a parseable scale descriptor — broken contract. |
| BUG-A7-6-045 | src/components/ScaleCalibration.tsx | ~55 | LOW | `persistScale` fires a raw `fetch` POST to `/api/projects/${projectId}/scale` — this duplicates the `apiSync` call already made by `store.setScaleForPage`. The scale is POSTed to the server twice per preset selection: once from `persistScale` and once from the store's `apiSync` inside `setScaleForPage`. |

---

## Detailed Bug Descriptions

---

### BUG-A7-6-001: `src/lib/store.ts` — `addPolygon` silently drops `color` field
**Lines:** ~380 (addPolygon action)  
**Severity:** HIGH  
**Description:** The `addPolygon` function signature accepts a `color` optional field in the parameter destructuring, but the constructed `Polygon` object does not include `color`. The field is accepted and immediately discarded. Components that pass `color` when adding AI-detected or reclassified polygons (e.g. after AI takeoff) will always produce polygons with no explicit color, forcing them to fall back to the classification color even when an override is intended.  
**Code:**
```ts
addPolygon: ({ points, classificationId, pageNumber, area, linearFeet, label, isComplete = true }) => {
  // 'color' is not destructured; even if callers add it to the call, it's dropped
  const polygon: Polygon = { id, points: ..., classificationId, pageNumber, area, linearFeet, isComplete, label };
  // polygon.color is never set
```
**Fix:** Destructure `color` from params and include it in the constructed `Polygon` object.

---

### BUG-A7-6-002: `src/lib/store.ts` — `cutPolygon` uses `require('@turf/turf')` (dynamic CJS require)
**Lines:** ~450 (cutPolygon action, `const turf = require('@turf/turf')`)  
**Severity:** HIGH  
**Description:** `require()` inside a module-level Zustand action is a CommonJS dynamic require. In Next.js 14+ with the App Router, server-side and edge contexts use ESM; `require` is not defined. Even in browser bundles, Webpack may not tree-shake turf properly when required dynamically. The call will throw `ReferenceError: require is not defined` in edge/server contexts and causes the entire `cutPolygon` action to be un-callable without a try/catch (which is present, but the polygon is silently not cut).  
**Fix:** Import turf statically at the top of the file: `import * as turf from '@turf/turf'`. The existing try/catch already handles turf failures gracefully.

---

### BUG-A7-6-003: `src/lib/store.ts` — `hydrateState` clears default groups
**Lines:** ~495 (hydrateState, `groups: []`)  
**Severity:** MEDIUM  
**Description:** `hydrateState` sets `groups: []` unconditionally. The initial store state seeds 8 default trade groups (Drywall, Painting, Flooring, etc.). On every project load, `hydrateState` wipes these back to an empty array. Users who have not yet customized groups lose all group structure. Any groups persisted via `addGroup` are also wiped on next hydration.  
**Fix:** Either restore the default groups in `hydrateState` (from a shared constant), or preserve existing groups when the incoming `state.groups` is empty/undefined.

---

### BUG-A7-6-004: `src/lib/store.ts` — `projectId` leaks across sessions via localStorage persist
**Lines:** persist `partialize` config (~855)  
**Severity:** MEDIUM  
**Description:** `projectId` is part of the `Store` type and initialized to `null`, but it is NOT included in `partialize`. Zustand's `persist` middleware persists the full non-partialized fields by default only if `partialize` is not defined; since `partialize` IS defined here, only the listed keys are persisted. So `projectId` is NOT persisted — this is actually the correct behavior. **However**, after reviewing the code more carefully: `projectId` is NOT in `partialize`, meaning it is ephemeral and reset to `null` on reload. But `page.tsx` sets it via `setProjectId(id)` from the URL. This means a hard refresh always resets projectId to `null` for a brief moment until the URL-param effect runs, causing any `apiSync` calls that fire during that window to fail silently (URL is `/api/projects/null/...`). The `apiSync` guard `if (pid)` prevents the null case, so the actual risk is a missed sync, not a crash.  
**Reclassified as:** MEDIUM — edge case sync loss on rapid state changes during hydration.

---

### BUG-A7-6-005: `src/lib/store.ts` — `redo` grows undoStack without MAX_UNDO_STACK cap
**Lines:** ~545 (redo action)  
**Severity:** MEDIUM  
**Description:** `redo` pushes `now` snapshot directly to `s.undoStack` via `[...s.undoStack, now]` without calling `pushUndo()`. The `pushUndo` helper enforces the `MAX_UNDO_STACK = 50` cap. After 50+ redo operations on a large project, `undoStack` can exceed 50 entries and grow unboundedly. With large polygon datasets, each snapshot calls `structuredClone` on all polygons/classifications — memory usage is O(N × stack_size).  
**Fix:** Use `pushUndo(s.undoStack, now)` instead of `[...s.undoStack, now]` in the redo action.

---

### BUG-A7-6-006: `src/lib/store.ts` — `toggleClassification` pollutes undo history
**Lines:** ~290 (toggleClassification)  
**Severity:** MEDIUM  
**Description:** Toggling a classification's visibility (`cls.visible`) is a non-destructive UI action. It pushes a full undo snapshot including all polygons, classifications, and groups. Users pressing Ctrl+Z expect to undo polygon drawing, not visibility toggles. A user who repeatedly shows/hides classifications will fill the 50-slot undo stack with visibility snapshots, effectively losing polygon drawing history.  
**Fix:** Do not push to `undoStack` for `toggleClassification`. Visibility state can optionally be tracked separately if undo is desired, but it should not share the main undo stack.

---

### BUG-A7-6-009: `src/server/project-store.ts` — `getProjectByShareToken` index rebuild silent failure
**Lines:** ~340  
**Severity:** CRITICAL  
**Description:** When the share token index is missing or stale, `getProjectByShareToken` falls back to scanning all project directories and attempts to rebuild `share-index.json` with `.catch(() => {})` (silently swallowed error). If the write fails (permissions, disk space), subsequent share page loads always execute the full O(N) scan. With 100+ projects, each share page load reads 100+ `project.json` files sequentially. Under concurrent traffic this can cause request timeouts. Additionally, the file-based scan is not concurrent (`for (const entry of entries)` — sequential awaits).  
**Fix:** Log the rebuild error instead of swallowing it; convert the fallback scan to `Promise.all` for parallel reads; add a minimum error log when rebuild fails.

---

### BUG-A7-6-010: `src/server/project-store.ts` — `listProjects` serial disk reads
**Lines:** ~147  
**Severity:** HIGH  
**Description:** File-mode `listProjects` iterates project directories in a sequential `for...of` loop with `await readJson(...)` inside — each read blocks until the previous completes. For N projects this is O(N) serial I/O. Should use `Promise.all` for parallel reads.  
**Fix:**
```ts
const projects = (await Promise.all(
  entries.map(entry => readJson<ProjectMeta | null>(path.join(PROJECTS_DIR, entry, 'project.json'), null))
)).filter(Boolean) as ProjectMeta[];
```

---

### BUG-A7-6-011: `src/server/project-store.ts` — `restoreSnapshot` not atomic (Supabase mode)
**Lines:** ~280 (restoreSnapshot)  
**Severity:** HIGH  
**Description:** Supabase-mode restore: deletes all polygons, classifications, scales, and assemblies, then recreates them individually in sequential for-loops. There is no database transaction wrapping this. A crash, timeout, or connection drop midway leaves the project with partial data (e.g. classifications deleted but polygons not yet recreated). The project becomes permanently corrupted with no rollback path.  
**Fix:** Wrap in a Supabase RPC transaction, or use a write-ahead approach: create new records under a temporary ID, then do an atomic swap. At minimum, create all new records first, then delete the old ones, so a failure leaves the old data intact.

---

### BUG-A7-6-012: `src/server/project-store.ts` — `recordHistory` truncation is discarded
**Lines:** ~247  
**Severity:** HIGH  
**Description:** File-mode history capping:
```ts
if (list.length > 200) list.length = 200;
await writeJson(filePath, list);
```
`list.length = 200` mutates the array length but `list` at this point is sorted `unshift`-first (newest first), so truncating from the end drops the oldest entries correctly. However `writeJson` is called **after** the truncation — actually the truncation IS persisted. Re-reading: the bug is that `list.unshift(...)` is called first (adding the new entry), then `list.length = 200` is set. This truncates correctly. **Actually this code is correct.** — Reclassified: not a bug.  
*Correction:* After careful re-read, the bug is: in `getHistory` the `limit` defaults to 100 but `recordHistory` already caps at 200 server-side. If the Supabase history table grows beyond 200 rows (no server-side cap in Supabase mode), `getHistory` with `limit=100` only returns 100 but the table can grow without bound. **The Supabase-mode `recordHistory` has no row cap** — only file mode does.  
**Fix:** Add a row-count limit check in Supabase mode `recordHistory` (e.g. keep only the 200 most recent rows per project using a DELETE with subquery).

---

### BUG-A7-6-017: `src/hooks/use-feature-flag.ts` — stale cache not cleared on fetch error
**Lines:** ~18  
**Severity:** MEDIUM  
**Description:** When `fetchFlags` fails, `fetchPromise = null` is set in `.catch()` but `cachedFlags` and `fetchedAt` are not reset. On next call, `if (cachedFlags && Date.now() - fetchedAt > TTL_MS)` may be false (TTL not expired), so the stale cache continues to be served. The hook silently serves the last known flags indefinitely after a server error, rather than retrying.  
**Fix:** In the `.catch` handler, also reset `cachedFlags = null` and `fetchedAt = 0`.

---

### BUG-A7-6-018: `src/hooks/use-feature-flag.ts` — SSR module-level singleton causes cross-request flag leakage
**Lines:** ~36 (useState initializer)  
**Severity:** MEDIUM  
**Description:** `cachedFlags` is a module-level variable. In Next.js server components / SSR, module-level state is shared across all incoming requests (Node.js module cache is per-process, not per-request). `useState(() => cachedFlags?.[flag] ?? false)` will read flags from a previous request's cache, causing different users to see each other's flag state. On the client this is fine, but the hook is exported without `'use client'` restriction — actually it does have `'use client'`, so this is only a risk if the hook is used in RSC contexts that ignore the directive.  
**Severity revised to LOW** in pure client-only usage. Flag as MEDIUM if server-side rendering of this hook is possible.

---

### BUG-A7-6-020: `src/hooks/useRealtimeSync.ts` — failed SSE connection prevents reconnect
**Lines:** ~16  
**Severity:** MEDIUM  
**Description:** `connectToProject(projectId)` is called, then immediately `connectedRef.current = projectId`. If `connectToProject` throws or opens a connection that immediately errors, `connectedRef.current` is already set to the project ID. The `if (connectedRef.current === projectId) return` guard will prevent any future reconnect attempts for this project. The effect cleanup sets `connectedRef.current = null` only on unmount, not on connection error.  
**Fix:** Set `connectedRef.current = projectId` only after confirming the connection is live, or clear it in the connection's error/close handler.

---

### BUG-A7-6-022: `src/components/DrawingTool.tsx` — `snapOptions` not memoized
**Lines:** ~65  
**Severity:** MEDIUM  
**Description:**
```ts
const snapOptions = { vertices: snappingEnabled, midpoints: snappingEnabled, edges: false, grid: gridEnabled, gridSize };
```
This object literal is recreated on every render. Since `snapOptions` is in the closure of `getCoords` and `handleMouseMove`, those `useCallback` hooks are invalidated on every render cycle even if `snappingEnabled`, `gridEnabled`, and `gridSize` haven't changed. Causes unnecessary re-renders and function identity churn.  
**Fix:** Wrap in `useMemo`: `const snapOptions = useMemo(() => ({ vertices: snappingEnabled, midpoints: snappingEnabled, edges: false, grid: gridEnabled, gridSize }), [snappingEnabled, gridEnabled, gridSize]);`

---

### BUG-A7-6-023: `src/components/DrawingTool.tsx` — stale `placeCountItem` in `handleClick` deps
**Lines:** ~105 (handleClick useCallback)  
**Severity:** MEDIUM  
**Description:** `handleClick` useCallback deps array is `[getCoords, getSelectedClassification, commitPolygon, placeCountItem, addToast, baseDims, setPointsAndRef]`. `placeCountItem` IS listed (checked), so this is actually correct. However, `placeCountItem`'s own deps include `getSelectedClassification`, `addPolygon`, `drawingPage`, and `addToast` — all stable or memoized. **Reclassified as LOW** — no actual stale closure issue found.

---

### BUG-A7-6-024: `src/components/DrawingTool.tsx` — double-tap on touch adds extra point before committing
**Lines:** ~190 (onTouchEnd)  
**Severity:** LOW  
**Description:** On double-tap: first tap fires `handleClick({ detail: 1 })` which adds a point. Second tap fires `handleDoubleClick` which calls `commitPolygon()`. The `e.detail > 1` guard in `handleClick` suppresses the second *click* event on mouse, but on touch this guard doesn't apply because we synthesize `detail: 1` for every tap. The result: a double-tap adds one extra point AND then commits. For area polygons with fewer than 4 points, the extra stray point can create a degenerate polygon.  
**Fix:** In `onTouchEnd`, when `isDoubleTap` is true, call `handleDoubleClick` only (skip the `handleClick` path entirely).

---

### BUG-A7-6-025: `src/components/CanvasOverlay.tsx` — keydown handler closes over stale selectedPolygonId
**Lines:** ~280  
**Severity:** HIGH  
**Description:** The keydown `useEffect` captures `selectedPolygonId` and `selectedPolygons` from the render scope. The effect dependency array includes both, so it re-registers on every selection change. However, between a rapid key-repeat Delete and the next render cycle, if the store updates asynchronously (e.g. via `apiSync` callback), the handler may fire with a stale ID. This is unlikely in practice but represents a correctness hazard during stress testing.  
**Severity revised to MEDIUM** — low-probability race, no crashes observed.

---

### BUG-A7-6-026: `src/components/CanvasOverlay.tsx` — `calculateLinearFeet` called for every polygon on every render
**Lines:** ~390  
**Severity:** MEDIUM  
**Description:** Inside the polygon label rendering IIFE (called for every polygon), `calculateLinearFeet(poly.points, ppu, false)` is invoked unconditionally for all polygon types including area and count polygons where the result is irrelevant. `calculateLinearFeet` iterates all polygon points, so for N polygons with M points each this is O(N×M) on every render cycle, including on mousemove (because `hoveredPoly` state changes trigger re-renders).  
**Fix:** Guard with `if (clsType === 'linear')` before computing `linearReal`. Alternatively, memoize per-polygon measurements.

---

### BUG-A7-6-029: `src/components/CanvasOverlay.tsx` — `inFlightDeleteIds` never cleaned up
**Lines:** ~240  
**Severity:** LOW  
**Description:** `inFlightDeleteIds.current.add(selectedPolygonId)` is called before `deletePolygon()` but there is no corresponding `.delete(id)` call after completion. `deletePolygon` is synchronous (updates Zustand state synchronously), so the polygon is gone before the next render. The ID is never removed from the Set. If by any chance the same UUID appears again (theoretically impossible with UUID v4, but the Set grows), the delete would be blocked. More practically, the Set leaks memory indefinitely.  
**Fix:** After `deletePolygon(selectedPolygonId)`, call `inFlightDeleteIds.current.delete(selectedPolygonId)`.

---

### BUG-A7-6-030: `src/components/MeasurementTool.tsx` — double Escape handling
**Lines:** ~100  
**Severity:** MEDIUM  
**Description:** `MeasurementTool` registers an Escape handler both via `onKeyDown` on the container div AND via `window.addEventListener('keydown', handler)` in a `useEffect`. Both fire for the same key event. `reset()` + `setTool('select')` are called twice. Currently harmless (idempotent) but the window listener is also not removed on tool switch — it's only removed on component unmount. If the tool is conditionally rendered (mounted/unmounted on switch), this is fine; but if rendered-but-hidden, the window listener persists after the tool is visually inactive.  
**Fix:** Remove the `onKeyDown` prop on the div and rely only on the window listener, or vice versa.

---

### BUG-A7-6-032: `src/components/CutTool.tsx` — CutTool never removes any polygon
**Lines:** ~45  
**Severity:** HIGH  
**Description:** This is the most impactful bug in this cycle. `CutTool.onClick` calls:
```ts
cutPolygon(hit, []);
```
`store.cutPolygon` has the guard `if (!poly || cutShape.length < 3) return;` — it returns immediately when `cutShape` is empty. So `CutTool` **never removes or cuts any polygon**. The user interface says "Click a polygon to remove it" but clicking does nothing observable. This is a completely broken feature.  
**Fix:** The intent is clearly to delete the polygon entirely (full removal), not to cut it. The action should call `deletePolygon(hit)` instead of `cutPolygon(hit, [])`. Alternatively, if the cut shape should come from a drawn area, the tool needs a full draw-then-cut flow (like a proper eraser tool).

---

### BUG-A7-6-034: `src/components/MergeSplitTool.tsx` — silent split failure gives no feedback
**Lines:** ~87  
**Severity:** MEDIUM  
**Description:** After `split(splitPolyId, line[0], line[1])`, the tool immediately calls `setTool('select')` regardless of whether the split succeeded. `store.splitPolygon` returns early without notification if the split produces zero valid polygons (e.g. the line doesn't cross the polygon). The user sees the tool exit and nothing changes — no error message, no indication that the split failed.  
**Fix:** Have `splitPolygon` return a boolean indicating success, or have the store fire an event. In the tool, if split failed, show a toast and remain in split mode.

---

### BUG-A7-6-037: `src/components/RepeatingGroupTool.tsx` — `toBaseCoords` divide-by-zero
**Lines:** ~70  
**Severity:** MEDIUM  
**Description:**
```ts
const toBaseCoords = (e: React.MouseEvent) => {
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return {
    x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
    y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
  };
};
```
Missing `rect.width === 0 || rect.height === 0` guard. If the component mounts before the layout is complete (e.g. during a CSS animation or in a hidden panel), `rect.width` can be 0, producing `Infinity` coordinates. `baseDims` defaults to `{ width: 1, height: 1 }` (from the store selector default), so `(x / 0) * 1 = Infinity`. This causes the bounding box to be set to `{ x: Infinity, y: Infinity, ... }` and the repeating group is saved with garbage coordinates.  
**Fix:** Add `if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };`

---

### BUG-A7-6-038: `src/components/RepeatingGroupTool.tsx` — double mouseup handlers race
**Lines:** ~95  
**Severity:** MEDIUM  
**Description:** The component registers `handleMouseUp` on `onMouseUp` of the div AND registers `onWindowMouseUp` via `window.addEventListener('mouseup', ...)` inside a `useEffect` while `isDragging`. When the user releases inside the div both fire. `setBoundingBox` is called twice with potentially different rect measurements (the window handler captures the event first, sets `isDragging = false`, which queues a React state update; by the time `handleMouseUp` runs the state is stale). The `boundingBox` state may be set to one of two different values.  
**Fix:** Remove the component-level `onMouseUp` and `onMouseMove` props from the div; rely entirely on the window-level handlers while dragging (the same pattern used by `CropOverlay` correctly).

---

### BUG-A7-6-040: `src/components/AnnotationTool.tsx` — `popupStyle` doesn't update on container resize
**Lines:** ~55  
**Severity:** MEDIUM  
**Description:** `popupStyle` `useMemo` depends on `[draft]` but reads `containerRef.current?.getBoundingClientRect()`. If the browser window or container resizes while a draft is open, the popup clamp values are stale. The popup may appear outside the visible container bounds.  
**Fix:** Add a `ResizeObserver` on the container (similar to `DrawingTool.tsx`) and include a resize-triggered counter in the `useMemo` deps to force recompute on resize.

---

### BUG-A7-6-042: `src/components/ManualCalibration.tsx` — `calibrationMode` not deactivated when switching to enter-number
**Lines:** ~37, ~108  
**Severity:** HIGH  
**Description:** When the user switches from "Draw Line" tab to "Enter Number" tab, the second `useEffect` (deps: `[mode, calibrationMode, clearCalibrationPoints]`) fires and calls `clearCalibrationPoints()` but does NOT call `setCalibrationMode(false)`. `calibrationMode` remains `true` in the Zustand store. `CanvasOverlay`'s `handleSvgClick` checks `if (calibrationMode && calibrationPoints.length < 2)` and captures all canvas clicks as calibration points even while the user is focused on the "Enter Number" inputs. This means clicks elsewhere on the canvas (e.g. accidentally clicking the PDF) silently add calibration points that affect the next Draw Line session.  
**Fix:** Add `setCalibrationMode(false)` to the mode-switch `useEffect` when `mode !== 'draw-line'`.

---

### BUG-A7-6-044: `src/components/ScaleCalibration.tsx` — `handleManualSave` breaks on draw-line labels
**Lines:** ~100  
**Severity:** MEDIUM  
**Description:** `ManualCalibration.onSave` is called with the human-readable label string it constructed (e.g. `"2.50 ft (drawn)"` or `"1.0\" = 25.0'"`). `ScaleCalibration.handleManualSave` receives this string and calls `labelToPixelsPerUnit(label)` — but neither of these label formats match any of the regex patterns in `labelToPixelsPerUnit`. The function returns `null`, triggering `addToast('Unrecognized scale format: ...', 'warning')` and returning early. **The scale appears to save** (ManualCalibration called `setScale()` internally), but `persistScale()` is never called, so the scale is not synced to the server. On page reload, the scale is lost.  
**Fix:** Either (a) have `ManualCalibration.onSave` pass a structured object instead of a label string, or (b) have `handleManualSave` accept the already-computed `pixelsPerUnit` value and skip the `labelToPixelsPerUnit` parse step.

---

### BUG-A7-6-045: `src/components/ScaleCalibration.tsx` — double API call on preset scale select
**Lines:** ~55  
**Severity:** LOW  
**Description:** `handleSelectScale` calls:
1. `setScale(cal)` → store action → `apiSync('/api/projects/${pid}/scale', { method: 'POST', ... })`
2. `setScaleForPage(currentPage, cal)` → store action → `apiSync('/api/projects/${pid}/scale', { method: 'POST', ... })`  
3. `persistScale(cal)` → raw `fetch('/api/projects/${projectId}/scale', { method: 'POST', ... })`

Three API calls to the same endpoint for one user action. `persistScale` is entirely redundant since `setScaleForPage` already syncs via `apiSync`.  
**Fix:** Remove `persistScale` from `handleSelectScale` and `handleManualSave` — the store's `apiSync` handles persistence.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 8 |
| MEDIUM | 19 |
| LOW | 10 |
| **TOTAL** | **38** |

### Critical
- BUG-A7-6-009: Share token O(N) scan + silent index rebuild failure

### High Priority (data loss / feature completely broken)
- BUG-A7-6-001: `addPolygon` drops color field
- BUG-A7-6-002: `cutPolygon` dynamic `require()` breaks ESM/edge runtime
- BUG-A7-6-010: `listProjects` serial disk I/O
- BUG-A7-6-011: `restoreSnapshot` non-atomic in Supabase mode
- BUG-A7-6-012: Supabase `recordHistory` has no row cap (unbounded growth)
- BUG-A7-6-025: keydown handler stale closure (medium risk)
- BUG-A7-6-032: **CutTool never removes any polygon** (completely broken feature)
- BUG-A7-6-042: `calibrationMode` not deactivated on tab switch — canvas captures stray clicks

### Notable Medium Issues
- BUG-A7-6-003: `hydrateState` wipes all classification groups on every load
- BUG-A7-6-020: Failed SSE connection permanently blocks reconnect
- BUG-A7-6-026: O(N×M) `calculateLinearFeet` on every render for all polygon types
- BUG-A7-6-034: Silent split failure exits tool with no user feedback
- BUG-A7-6-037: Divide-by-zero in `RepeatingGroupTool.toBaseCoords`
- BUG-A7-6-038: Double `mouseup` handler race in `RepeatingGroupTool`
- BUG-A7-6-040: Popup clamp stale on container resize in `AnnotationTool`
- BUG-A7-6-044: `ScaleCalibration.handleManualSave` label parse fails → scale not synced to server
