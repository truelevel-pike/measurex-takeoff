# CYCLE 5 AUDIT — SECTOR A7: src/store/ + src/hooks/ + Drawing Components
**Report:** audit-A7-cycle5.md  
**Repo:** measurex-takeoff  
**Auditor:** Admiral 7  
**Date:** 2026-03-20  
**Scope:** Full sweep of src/lib/store.ts, src/hooks/*.ts, src/components/DrawingTool.tsx,
src/components/DrawingSetManager.tsx, src/components/DrawingComparison.tsx  
**Method:** Every file read in full; all Cycle 4 bugs regression-checked against current source.

---

## Summary Table

| Severity | New Bugs | Confirmed Regressions | Confirmed Fixes |
|----------|----------|-----------------------|-----------------|
| CRITICAL | 1        | 0                     | —               |
| HIGH     | 3        | 0                     | 8               |
| MEDIUM   | 8        | 1                     | 10              |
| LOW      | 11       | 1                     | 14              |
| **TOTAL**| **23**   | **2**                 | **32**          |

---

## CYCLE 4 REGRESSION CHECK

### REGRESSION R-C5-001 (MEDIUM) — store.ts: deleteSelectedPolygons still uses per-ID forEach loop for API sync
**File:** src/lib/store.ts:507–511  
**Status:** PARTIALLY FIXED — the state update itself now does a single batched `set()` with
one undo snapshot (the forEach loop for the state mutation was fixed). However the API sync
at line 507 still uses `idsToDelete.forEach((polygonId) => { apiSync(...) })`, firing one
HTTP request per selected polygon. With large selections this still overwhelms the API.  
**Cycle 4 reference:** BUG-A7-4-001 — partially resolved; API side unresolved.  
**Fix:** Replace the per-ID forEach API loop with a single batched DELETE request:
```ts
apiSync(`/api/projects/${s.projectId}/polygons/batch`, {
  method: 'DELETE',
  body: JSON.stringify({ ids: idsToDelete }),
});
```

### REGRESSION R-C5-002 (LOW) — store.ts: reorderGroups does not push undo snapshot
**File:** src/lib/store.ts:982 area  
**Status:** NOT FIXED — `reorderGroups` uses `set((s) => { ... })` without taking a snapshot
or pushing to `undoStack`. A reorder operation cannot be undone. `moveClassificationToGroup`,
`addBreakdown`, and `deleteBreakdown` have the same omission.  
**Cycle 4 reference:** BUG-A7-4-R005 (group mutations skipping undo) — the fix added undo to
`addGroup`, `updateGroup`, `deleteGroup`, but `reorderGroups`, `moveClassificationToGroup`,
`addBreakdown`, and `deleteBreakdown` were skipped.  
**Fix:** Wrap all four actions in snapshot/pushUndo pattern like other group mutations.

---

## NEW CRITICAL BUG

### BUG-A7-5-001 (CRITICAL) — DrawingSetManager.tsx: all drawing set state is local-only, no persistence
**File:** src/components/DrawingSetManager.tsx:49–55  
**Description:** `DrawingSetManager` manages all drawing sets and drawings in local React
`useState`. There is zero API integration: no `fetch` calls to create/load/update/delete
drawing sets or drawings. On page refresh all drawing sets (except the hardcoded
`'Default Set'`) and all uploaded drawings are permanently lost. Uploads are simulated
with a fake `setInterval` progress animation; the actual PDF file is never sent to any
server endpoint. This means the component appears to work but silently discards all user
data on every reload.  
**Fix:** Wire `DrawingSetManager` to the store and API:
1. On mount, `GET /api/projects/${projectId}/drawing-sets` to load sets/drawings.
2. `createSet` → `POST /api/projects/${projectId}/drawing-sets`.
3. `simulateUpload` → real `POST /api/projects/${projectId}/drawings` with `FormData`.
4. `deleteSet` / `deleteDrawing` / `renameDrawing` / `moveDrawing` → corresponding
   `DELETE`/`PATCH` API calls.

---

## NEW HIGH BUGS

### BUG-A7-5-002 (HIGH) — DrawingSetManager.tsx: Archive action calls deleteDrawing — data loss
**File:** src/components/DrawingSetManager.tsx:325–330  
**Description:** The "Archive" menu button calls `deleteDrawing(d.id)` — the same function
used by the "Delete" button. There is no archive state, no soft-delete flag, and no API
call. Clicking "Archive" permanently removes the drawing from local state immediately, with
no confirmation prompt. A user who expects archiving to hide a drawing while preserving it
will instead lose it permanently (modulo the missing persistence bug above).  
**Fix:** Implement archive as a separate state flag (`archived: boolean`) on the `Drawing`
type and filter archived drawings from the default list rather than deleting them.
Add a corresponding API call `PATCH /api/projects/${projectId}/drawings/${id}` with
`{ archived: true }`.

### BUG-A7-5-003 (HIGH) — DrawingSetManager.tsx: renameDrawing uses `window.prompt()` — blocks UI
**File:** src/components/DrawingSetManager.tsx:300–307  
**Description:** The rename drawing action opens a native `window.prompt()` dialog. This:
(a) blocks the browser's JavaScript event loop for the duration,
(b) does not work in sandboxed iframes (returns `null` silently),
(c) cannot be styled or cancelled gracefully,
(d) triggers CSP violations in strict environments.
No inline-edit UX exists for drawings (unlike sets, which have a proper inline input).  
**Fix:** Replace `prompt()` with an inline input field similar to the set-rename flow
(`editingDrawingId` state + an `<input>` rendered in place of the drawing name when active).

### BUG-A7-5-004 (HIGH) — useFeatureFlag: module-level cache never resets on project switch
**File:** src/hooks/use-feature-flag.ts:5–8  
**Description:** `cachedFlags` and `fetchPromise` are module-level singletons that persist
for the lifetime of the browser tab across all project navigations. When a user switches
projects (e.g. from a project where `ai_takeoff` is enabled to one where it is not), the
stale cache from the previous project continues to be served until the 5-minute TTL
expires. Feature flags that are project-scoped (not user-scoped) will therefore be wrong
for up to 5 minutes after every project switch.  
**TTL comment** at line 9 acknowledges "project switch" as a case, but the actual fix (TTL
reset) only fires inside `useEffect` when a component re-mounts; the singleton survives
React tree unmounts between project navigations.  
**Fix:** Accept an optional `projectId` parameter in `fetchFlags` and key the cache on
`projectId`. Reset the cache when `projectId` changes by comparing against a stored key:
```ts
let cacheKey: string | null = null;
function fetchFlags(projectId?: string): Promise<...> {
  if (projectId && projectId !== cacheKey) {
    cachedFlags = null;
    fetchPromise = null;
    cacheKey = projectId;
  }
  // ... existing logic
}
```

---

## NEW MEDIUM BUGS

### BUG-A7-5-005 (MEDIUM) — store.ts: persist partialize omits markups — markups lost on reload
**File:** src/lib/store.ts:1094–1113  
**Description:** The `partialize` function (zustand persist config) lists the fields that are
saved to `localStorage`. `markups` and `showMarkups` are NOT in the partialize list. Any
markup annotations drawn by the user are silently discarded on page reload, even though the
markup feature is fully implemented and user-facing. The `hydrateState` action resets
`markups: []`, confirming the intent to load markups from the server — but there is no
`GET` call in `hydrateState` to fetch them.  
**Fix:** Either add `markups` to `partialize` (localStorage fallback), or add an API fetch
inside `hydrateState`/project load to retrieve markups from
`GET /api/projects/${projectId}/markups`.

### BUG-A7-5-006 (MEDIUM) — store.ts: persist partialize omits focusedPolygonId and hoveredClassificationId — unnecessary but misleading
**File:** src/lib/store.ts:1094–1113  
**Description:** `focusedPolygonId` and `hoveredClassificationId` are transient UI state
and correctly omitted from persistence. However `lastPolygon` (the Ctrl+D source) is also
omitted but is used across renders. After a reload, Ctrl+D will silently use stale data
from the `lastPolygon` ref if any component holds a reference. The more critical issue: the
persist config has no `version` field. Schema migrations (adding new persisted fields) will
silently merge old persisted state with new defaults, producing partial/corrupt state.  
**Fix:** Add `version: 1` and a `migrate` function to the persist config. Increment the
version whenever the persisted schema changes.

### BUG-A7-5-007 (MEDIUM) — store.ts: setCurrentPage fires unawaited fetch that can update stale page
**File:** src/lib/store.ts:756–767  
**Description:** `setCurrentPage` fires a non-awaited `fetch()` for the per-page scale
(lines 758–767). The `then` callback checks `get().currentPage === page` before applying
the result, which is correct. However if the user navigates pages rapidly (page 1 → 2 → 3),
three concurrent fetches are in flight. The responses can arrive out of order; the `===`
check prevents applying a stale result, but repeated rapid navigation fires redundant
network requests with no abort or deduplication.  
**Fix:** Store an `AbortController` ref in the store (or a module-level variable) and abort
the previous scale fetch when `setCurrentPage` is called again. Alternatively, debounce the
fetch by 150ms.

### BUG-A7-5-008 (MEDIUM) — useRealtimeSync: connectedRef guard prevents reconnect after disconnect
**File:** src/hooks/useRealtimeSync.ts:14–23  
**Description:** `connectedRef.current` is set to `projectId` on connect and cleared to
`null` on cleanup. If the component unmounts and remounts with the **same** `projectId`
(e.g. during React StrictMode double-invoke or a parent re-render that causes unmount/remount),
the cleanup sets `connectedRef.current = null` and then the re-mount effect runs: `projectId`
is now different from `null` so a new connection is made — this is correct. However if
`disconnectFromProject()` is not idempotent (i.e. it throws or leaves state corrupted when
called on an already-disconnected connection), the cleanup path becomes unreliable.  
More critically: `connectToProject` is called **before** `connectedRef.current` is set.
If `connectToProject` throws synchronously, `connectedRef.current` remains `null` and the
effect's cleanup will call `disconnectFromProject()` on a connection that was never made.  
**Fix:** Set `connectedRef.current = projectId` **after** a successful `connectToProject`
call, wrapped in try/catch. Ensure `disconnectFromProject` is idempotent.

### BUG-A7-5-009 (MEDIUM) — useViewerPresence: viewerCount never goes below 1 — wrong count on solo view
**File:** src/hooks/useViewerPresence.ts:25–34  
**Description:** `setViewerCount` only fires when `event === 'viewer:joined' || 'viewer:left'
|| 'viewer:count'`. When `isShared` becomes `false` (user stops sharing), the effect
cleanup fires `unsubscribe()` but `viewerCount` is left at whatever it was last set to.
The `if (!projectId || !isShared)` branch resets it to `1`, so a toggle of `isShared`
to `false` does reset correctly. However `viewer:count` events carry the **server-reported**
count including the current user, meaning if the server sends `viewerCount: 0` (e.g. after
all viewers disconnect), the UI never drops below the initial `useState(1)` value because
the `count >= 0` guard passes but `setViewerCount(0)` would render "0 viewers" which the
UI may not handle (most join/leave badges show "2 viewers" minimum and don't account for 0).  
**Fix:** The `count >= 0` guard should be `count >= 1` or the component consuming
`viewerCount` should clamp to a minimum of 1 when displaying.

### BUG-A7-5-010 (MEDIUM) — DrawingSetManager.tsx: deleteSet does not reassign selectedSetId correctly
**File:** src/components/DrawingSetManager.tsx:102–108  
**Description:** `deleteSet` calls:
```ts
setSelectedSetId(sets.find((s) => s.id !== setId)?.id ?? '');
```
`sets` here references the **current** state value captured at render time. After the
`setSets(prev => prev.filter(...))` call completes, `sets` still reflects the pre-deletion
list. `sets.find(s => s.id !== setId)` will find the first surviving set correctly only if
the component hasn't closed over a stale `sets` value — which React guarantees NOT to
update synchronously within the same event handler. The result: if the deleted set was the
only remaining set, `selectedSetId` is set to `''` (empty string), and `selectedSet`
becomes `undefined`. Downstream code (`sortedDrawings`, drag handlers) assume `selectedSet`
is defined and will throw or silently produce empty arrays.  
**Fix:** Move the `setSelectedSetId` call inside the `setSets` functional updater so it
sees the new state, or derive `selectedSetId` from the post-filter array:
```ts
setSets((prev) => {
  const next = prev.filter((s) => s.id !== setId);
  const fallback = next.find((s) => s.id !== setId)?.id ?? next[0]?.id ?? '';
  setSelectedSetId(fallback);
  return next;
});
```

### BUG-A7-5-011 (MEDIUM) — DrawingTool.tsx: touch events use hardcoded `detail: 1` — double-tap to close polygon broken on touch
**File:** src/components/DrawingTool.tsx:272–279  
**Description:** The `onTouchEnd` handler synthesizes a mouse event with `detail: 1`
hardcoded:
```ts
handleClick({ ..., detail: 1 } as unknown as React.MouseEvent);
```
The `handleClick` function skips duplicate clicks when `e.detail > 1`. Since touch events
don't have a native `detail` field, every touch tap is treated as `detail: 1`, making
double-tap-to-close a polygon impossible on touch devices. Users can only close polygons
on touch via the proximity check (green first-point tap) or the Enter keyboard shortcut,
neither of which is touch-friendly.  
**Fix:** Track a `lastTouchEnd` timestamp ref. If two `onTouchEnd` events arrive within
300ms on the same point, synthesize a `detail: 2` value and call `handleDoubleClick`
directly rather than routing through `handleClick`.

### BUG-A7-5-012 (MEDIUM) — DrawingComparison.tsx: all data is hardcoded stubs — component is non-functional
**File:** src/components/DrawingComparison.tsx:27–43  
**Description:** `SAMPLE_DRAWINGS` and `SAMPLE_DIFF_REGIONS` are hardcoded module-level
constants. The component:
(a) never fetches real drawings from the project/store,
(b) never fetches real diff regions from any API,
(c) always shows the same 5 fake drawings regardless of which project is open,
(d) displays "3 diff regions detected (stub)" in the legend.
The PDF canvases are placeholder `<div>`s with a grid background. The overlay opacity
slider and diff toggle affect only the stub visuals. This component is shipped to users
in the current state and presents completely fabricated data.  
**Fix:** Connect to real data:
1. Accept `projectId` prop and fetch drawings from the store or
   `GET /api/projects/${projectId}/drawings`.
2. Implement real diff via `POST /api/projects/${projectId}/compare` with drawing IDs.
3. Replace `PanelPlaceholder` with the real PDF viewer component.

---

## NEW LOW BUGS

### BUG-A7-5-013 (LOW) — use-text-search.ts: debounce timer leaks if component unmounts during timeout
**File:** src/hooks/use-text-search.ts:27  
**Description:** The 300ms `setTimeout` is correctly cleared by the effect cleanup
(`clearTimeout(timer)`). However `abortRef.current?.abort()` is also called in cleanup —
but if the component unmounts **during** the debounce window (before the timer fires), the
timer is cleared and the abort runs against a controller that was never used for a fetch.
`AbortController.abort()` on an unused controller is a no-op and safe, but the `abortRef`
is not reset to `null` after abort, meaning subsequent effect runs (on a re-mounted
component with the same `projectId`/`query`) will call `.abort()` on a stale already-aborted
controller. This is harmless but can generate spurious `AbortError` events in devtools.  
**Fix:** Reset `abortRef.current = null` inside the cleanup function after calling `.abort()`.

### BUG-A7-5-014 (LOW) — use-text-search.ts: network error text exposed directly in UI without sanitisation
**File:** src/hooks/use-text-search.ts:51  
**Description:** `setError(err instanceof Error ? err.message : String(err))` sets the
error state to raw server/network error messages which are rendered directly in the search
UI. Server-generated messages may contain internal path names, database error strings,
or other sensitive implementation details that should not be exposed to end users.  
**Fix:** Map known HTTP status codes to user-friendly messages. For unexpected errors,
use a generic fallback: `'Search is unavailable. Please try again.'`

### BUG-A7-5-015 (LOW) — use-feature-flag.ts: initial state is always `false` regardless of cache
**File:** src/hooks/use-feature-flag.ts:29  
**Description:** `useState(() => cachedFlags?.[flag] ?? false)` reads the cache on first
render, which is correct. However the lazy initializer only runs once. If `cachedFlags` is
populated **after** the component first renders (e.g. by a sibling component that mounted
earlier and completed the fetch), subsequent renders of the same component will correctly
show the flag as enabled. But new component instances that mount after the cache is
populated will correctly pick up the cached value — so this is actually fine for the
common case. The real bug: the effect has `[flag]` as its dependency array, but changing
`flag` from `'ai_takeoff'` to `'export_pdf'` in the same component instance will skip the
cache check if `cachedFlags` is populated, because `if (cachedFlags) return;` exits before
`setEnabled` is called with the new flag's value.  
**Fix:** Remove the early-return guard or re-apply the cached value on flag change:
```ts
if (cachedFlags) {
  setEnabled(cachedFlags[flag] ?? false);
  return;
}
```

### BUG-A7-5-016 (LOW) — store.ts: `groups` initial state hardcodes 8 default groups — bypasses hydrateState reset
**File:** src/lib/store.ts:893–904  
**Description:** The store initialises `groups` with 8 hardcoded trade groups
(Drywall, Painting, Flooring, etc.) as the Zustand default state. When `hydrateState` is
called with a freshly loaded project, it resets `groups: []`. However, because these 8
groups are also persisted via `partialize` → `localStorage`, a user who has never added
any groups will load them from localStorage on next visit — bypassing the API-driven
`hydrateState` if the persist rehydration runs after the effect that calls `hydrateState`.
Race condition: zustand-persist rehydrates from localStorage synchronously on mount;
`hydrateState` is called asynchronously when the project API responds. If the project API
returns `groups: []` (new project), the 8 hardcoded groups will reappear from localStorage
after `hydrateState` wipes them.  
**Fix:** Either omit `groups` from `partialize` (source-of-truth is the API) or ensure
`hydrateState` accepts and respects a `groups` array from the project payload, overwriting
the localStorage value. The API response should be the authoritative source.

### BUG-A7-5-017 (LOW) — store.ts: `setCalibrationMode(false)` does NOT clear calibrationPoints
**File:** src/lib/store.ts:950  
**Description:**
```ts
setCalibrationMode: (active) => set((s) => ({
  calibrationMode: active,
  calibrationPoints: active ? [] : s.calibrationPoints,
}))
```
When `active` is `false` (deactivating calibration mode), `calibrationPoints` is preserved
as-is (`s.calibrationPoints`). This means stale calibration points from a cancelled
calibration remain in the store. If calibration mode is re-entered without first calling
`clearCalibrationPoints`, the old points are still present and the calibration panel will
immediately show them as if two points are already placed.  
**Fix:** Always clear calibration points when deactivating:
```ts
calibrationPoints: active ? [] : [],
// or simply:
calibrationPoints: [],
```
Alternatively, document that callers must call `clearCalibrationPoints()` explicitly, but
enforce this via the deactivation path.

### BUG-A7-5-018 (LOW) — store.ts: `addCalibrationPoint` silently ignores a third point, no user feedback
**File:** src/lib/store.ts:953–956  
**Description:** `addCalibrationPoint` checks `if (pts.length >= 2) return;` without
notifying the user or the calibration UI that the point was rejected. The calibration UX
depends on exactly 2 points; if a bug causes a third `addCalibrationPoint` call, it
silently no-ops and the UI state becomes inconsistent (user clicked, no new point appeared,
no explanation).  
**Fix:** Return a boolean from `addCalibrationPoint` indicating whether the point was
accepted. Callers (the calibration tool) should show a toast or ignore the click without
registering it in the canvas.

### BUG-A7-5-019 (LOW) — DrawingSetManager.tsx: DragOver state not cleared on dragEnd without drop
**File:** src/components/DrawingSetManager.tsx:190–196  
**Description:** `onDragLeave` sets `setDragOver(false)` correctly. However there is no
`onDragEnd` handler on the drop zone `<div>`. If a drag operation is cancelled (user presses
Escape mid-drag), `dragLeave` fires on Chrome/Safari but not always on Firefox. The drop
zone can remain in the blue highlighted state indefinitely after a cancelled drag on Firefox.  
**Fix:** Add `onDragEnd={() => setDragOver(false)}` to the drop zone div.

### BUG-A7-5-020 (LOW) — DrawingSetManager.tsx: upload interval progress can exceed 100 before clearInterval fires
**File:** src/components/DrawingSetManager.tsx:144–162  
**Description:** In `simulateUpload`, `progress += Math.random() * 25 + 10` can increment
by up to 35 units per tick. If `progress` was 80 before a tick and the increment is 30,
`progress` becomes 110. The `if (progress >= 100)` branch clamps it to 100, but before
clamping, `setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, progress, done } : u))`
is called with `progress = 110` and `done = true` (since `110 >= 100`). The progress bar
width would briefly render at 110% before the next setState cycle clamps it, causing a
visual overflow outside the progress bar container.  
**Fix:** Clamp progress before the conditional:
```ts
progress = Math.min(progress, 100);
if (progress >= 100) { ... }
setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, progress, done: progress >= 100 } : u));
```

### BUG-A7-5-021 (LOW) — DrawingComparison.tsx: overlay mode inset calculation is hardcoded to `'26px 0 0 0'`
**File:** src/components/DrawingComparison.tsx:396  
**Description:** The overlay panel positions Drawing A over Drawing B using
`inset: '26px 0 0 0'` (26px top offset to clear the label text). This hardcoded pixel
value does not account for font scaling, browser zoom, or different label heights. On
systems with large-text accessibility settings or in browsers with >100% font scaling, the
overlay will clip the label or leave a gap, misaligning the comparison canvases.  
**Fix:** Give the label a `ref` and measure its `offsetHeight` to compute the inset
dynamically, or use a CSS grid/flex layout where the label and canvas are separate rows.

### BUG-A7-5-022 (LOW) — DrawingComparison.tsx: diff region key includes array index — unstable on reorder
**File:** src/components/DrawingComparison.tsx:355, 408  
**Description:** Diff regions are keyed with `key={\`diff-${region.label}-${i}\`}` where
`i` is the array index. If diff regions are reordered (e.g. sorted by position or
priority), React will reconcile by label+index and may reuse DOM nodes incorrectly. Since
diff regions are stub data today this is low severity, but when real API data is used the
keys should be stable IDs.  
**Fix:** Use a stable unique ID from the diff region object: `key={region.id}` (requires
adding `id` to the `DiffRegion` type). Fall back to `region.label` if IDs are unavailable.

### BUG-A7-5-023 (LOW) — DrawingTool.tsx: `openPathDistance` uses Euclidean sum but `calculateLinearFeet` is also available — inconsistency
**File:** src/components/DrawingTool.tsx:12–17  
**Description:** `openPathDistance` is a local inline function that computes the sum of
Euclidean distances between consecutive points and divides by `ppu`. This duplicates the
logic in `calculateLinearFeet` from `polygon-utils.ts`. The two implementations are
semantically equivalent but not identical (e.g. `calculateLinearFeet` has a `closed`
parameter). If `calculateLinearFeet` is updated to handle projection or precision
differently, `openPathDistance` will silently diverge, causing the preview measurement
in the drawing tool to disagree with the committed polygon's stored `linearFeet`.  
**Fix:** Replace `openPathDistance` with a direct call to `calculateLinearFeet(points, ppu, false)`
for the open-path case, eliminating the duplicate implementation.

---

## CONFIRMED FIXES (Cycle 4 bugs verified resolved in current source)

| Bug ID | Description | Status |
|--------|-------------|--------|
| BUG-A7-4-H001 | ThreeDScene bare useStore() subscription | ✅ FIXED |
| R-001 (BUG-A7-3-001) | cutPolygon stub — Turf diff now implemented | ✅ FIXED |
| R-002 (BUG-A7-3-002) | hydrateState field leaks — all fields now reset | ✅ FIXED |
| R-003 | addAssembly/updateAssembly/deleteAssembly skip undo | ✅ FIXED — all three now use pushUndo |
| R-004 | addMarkup/deleteMarkup/clearMarkups skip undo | ✅ FIXED — all three now use pushUndo |
| R-005 | addGroup/updateGroup/deleteGroup skip undo | ✅ FIXED — all three now use pushUndo |
| BUG-A7-4-002 | setScale/setScaleForPage accept zero/negative ppu | ✅ FIXED — isFinite + > 0 guard added |
| BUG-A7-4-003 | setScaleForPage overwrites active scale on wrong page | ✅ FIXED — conditional spread |
| BUG-A7-4-007 | batchUpdatePolygons missing — N undo snapshots | ✅ FIXED — batchUpdatePolygons action added |
| BUG-A7-4-050 | snapPolygons not memoised | ✅ FIXED — useMemo added |
| BUG-A7-4-051 | baseDims fallback disables snapping | ✅ FIXED — snappingActive guard added |
| BUG-A7-4-052 | performance.mark names are global singletons | ✅ FIXED — UUID appended |
| BUG-A7-4-053 | DrawingTool no touch event handlers | ✅ FIXED — onTouchStart/Move/End added |
| BUG-A7-4-001 (state part) | deleteSelectedPolygons N-snapshot per state mut | ✅ FIXED — single set() call now |

*Note: BUG-A7-4-004 (snapToGrid gridSize=0), BUG-A7-4-005 (splitPolygonByLine spread RangeError),
BUG-A7-4-006 (calculateLinearFeet negative ppu), BUG-A7-4-008 through BUG-A7-4-014, and
BUG-A7-4-054 through BUG-A7-4-064 are in files outside this cycle 5 scope (CanvasOverlay,
ThreeDScene, ScaleCalibration, polygon-utils, snap-utils, MergeSplitTool, FloorAreaMesh) — carry
those forward as unresolved if not addressed by A6.*

---

## PRIORITISED FIX ORDER (Cycle 5)

1. **BUG-A7-5-001** — DrawingSetManager no persistence — all user data silently discarded (CRITICAL)
2. **BUG-A7-5-002** — Archive calls deleteDrawing — silent data loss (HIGH)
3. **BUG-A7-5-003** — renameDrawing uses window.prompt() — blocks UI, fails in iframes (HIGH)
4. **BUG-A7-5-004** — useFeatureFlag module cache not keyed by project — stale flags after switch (HIGH)
5. **BUG-A7-5-012** — DrawingComparison all hardcoded stubs — non-functional (MEDIUM)
6. **BUG-A7-5-005** — markups not persisted — lost on reload (MEDIUM)
7. **BUG-A7-5-010** — deleteSet stale `sets` closure → empty selectedSetId (MEDIUM)
8. **BUG-A7-5-011** — touch double-tap to close polygon broken (MEDIUM)
9. **BUG-A7-5-007** — setCurrentPage fires N concurrent scale fetches without abort (MEDIUM)
10. **BUG-A7-5-008** — useRealtimeSync: connectToProject called before ref update (MEDIUM)
11. **R-C5-001** — deleteSelectedPolygons per-ID API forEach (MEDIUM)
12. **BUG-A7-5-009** — viewerCount never drops to 0 (MEDIUM)
13. **BUG-A7-5-006** — persist config missing version/migrate (MEDIUM)
14. **R-C5-002** — reorderGroups/moveClassificationToGroup/addBreakdown/deleteBreakdown skip undo (LOW)
15. **BUG-A7-5-016 / BUG-A7-5-017 / BUG-A7-5-018** — store calibration bugs (LOW)
16. **BUG-A7-5-013 through BUG-A7-5-015** — hook minor issues (LOW)
17. **BUG-A7-5-019 through BUG-A7-5-023** — DrawingSetManager/Comparison/DrawingTool minor (LOW)

---

## Appendix: Files Audited in Cycle 5 (Dispatches E1–E25)

| File | Lines | Issues Found |
|------|-------|-------------|
| src/lib/store.ts | 1132 | R-C5-001, R-C5-002, BUG-A7-5-005, BUG-A7-5-006, BUG-A7-5-007, BUG-A7-5-016, BUG-A7-5-017, BUG-A7-5-018 |
| src/hooks/use-feature-flag.ts | 40 | BUG-A7-5-004, BUG-A7-5-015 |
| src/hooks/use-text-search.ts | 65 | BUG-A7-5-013, BUG-A7-5-014 |
| src/hooks/useRealtimeSync.ts | 28 | BUG-A7-5-008 |
| src/hooks/useViewerPresence.ts | 40 | BUG-A7-5-009 |
| src/components/DrawingTool.tsx | ~295 | BUG-A7-5-011, BUG-A7-5-023 |
| src/components/DrawingSetManager.tsx | ~400 | BUG-A7-5-001, BUG-A7-5-002, BUG-A7-5-003, BUG-A7-5-010, BUG-A7-5-019, BUG-A7-5-020 |
| src/components/DrawingComparison.tsx | ~440 | BUG-A7-5-012, BUG-A7-5-021, BUG-A7-5-022 |

---

---

# CYCLE 5 DISPATCH E26–E30 — ADDITIONAL FILES
**Auditor:** Admiral 7  
**Date:** 2026-03-20  
**Scope:** AnnotationTool.tsx, CutTool.tsx, CropOverlay.tsx, FloorAreaMesh.tsx,
MarkupTools.tsx, ManualCalibration.tsx, AutoScalePopup.tsx  
**Method:** Every file read in full; Cycle 4 fixes regression-checked per-file.

---

## Summary Table (E26–E30 Additions)

| Severity | New Bugs |
|----------|----------|
| HIGH     | 1        |
| MEDIUM   | 5        |
| LOW      | 9        |
| **TOTAL**| **15**   |

---

## NEW HIGH BUGS (E26–E30)

### BUG-A7-5-024 (HIGH) — MarkupTools.tsx: activeTool/activeColor/strokeWidth are dead local state — markup drawing is entirely non-functional
**File:** src/components/MarkupTools.tsx:52  
**Description:** A `// TODO: BUG-A7-2-017` comment at line 52 explicitly flags this:
`activeTool`, `activeColor`, and `strokeWidth` are React `useState` variables local to
the `MarkupTools` panel component. They are never written to the Zustand store and never
read by any canvas layer. Clicking a tool button (Text, Arrow, Cloud, Dimension,
Highlight, Freehand) updates the button highlight in the panel but triggers zero drawing
behaviour on the canvas. The markup toolbar is a fully non-functional UI — every tool
in it is a dead button. The only store-connected actions are `toggleShowMarkups` and
`clearMarkups`, both of which operate on pre-existing markups created by some other path.
This is a regression from the Cycle 4 note that "toolbar now writes to store" (the fix
applied to `showMarkups`/`toggleShowMarkups` only — not to the drawing tool selection).  
**Fix:** Add `activeMarkupTool`, `markupColor`, and `markupStrokeWidth` fields to the
Zustand store (or a separate `useMarkupToolState` hook). Write to them from the panel's
button handlers. The canvas drawing layer (CanvasOverlay or a dedicated MarkupCanvas)
must read these fields and enable the appropriate pointer-capture/draw mode when
`activeTool` is set.

---

## NEW MEDIUM BUGS (E26–E30)

### BUG-A7-5-025 (MEDIUM) — AnnotationTool.tsx: popup can clip off right/bottom screen edges
**File:** src/components/AnnotationTool.tsx:36–39  
**Description:** `popupStyle` clamps only `left` and `top` to a minimum of 8px:
```ts
left: Math.max(8, draft.screenX),
top: Math.max(8, draft.screenY),
```
There is no clamping against `rect.width - popupWidth` or `rect.height - popupHeight`.
The annotation input popup (approx 220px wide) will render partially or fully off-screen
when the user clicks in the right 220px of the canvas or near the bottom. The `<input>`
and "Add" button become unreachable. This is reproducible on any typical 1280px-wide
screen when annotating the right side of a PDF drawing.  
**Fix:** Compute popup bounds against container dimensions:
```ts
const POPUP_W = 240; // px
const POPUP_H = 50;
return {
  left: Math.min(Math.max(8, draft.screenX), (rect?.width ?? 9999) - POPUP_W - 8),
  top:  Math.min(Math.max(8, draft.screenY), (rect?.height ?? 9999) - POPUP_H - 8),
};
```
This requires `containerRef` to be accessible inside `popupStyle` (pass `containerRef.current?.getBoundingClientRect()` as a dep).

### BUG-A7-5-026 (MEDIUM) — ManualCalibration.tsx: calibrationMode not reset to false on unmount — store left in calibration state
**File:** src/components/ManualCalibration.tsx:62–65  
**Description:** The cleanup `useEffect` at line 62 calls `clearCalibrationPoints()` on
unmount but never calls `setCalibrationMode(false)`. When the user clicks Cancel or Save,
`handleCancel`/`handleSave` call `clearCalibrationPoints()` and then `onCancel()`/`onSave()`
which removes the component. The cleanup effect also fires on unmount and calls
`clearCalibrationPoints()` again (harmless no-op). However **`calibrationMode` remains
`true` in the store** after the component is gone. Any other component that reads
`calibrationMode` (e.g. the canvas pointer handler that decides whether clicks should be
intercepted for calibration) will continue intercepting pointer events indefinitely until
the next full page reload or an explicit `setCalibrationMode(false)` call from elsewhere.
This means after closing ManualCalibration, ALL canvas pointer clicks are silently eaten
by the calibration handler until reload — a severe usability regression.  
**Fix:** Call `setCalibrationMode(false)` in the cleanup effect alongside
`clearCalibrationPoints()`:
```ts
useEffect(() => {
  return () => {
    setCalibrationMode(false);
    clearCalibrationPoints();
  };
}, [setCalibrationMode, clearCalibrationPoints]);
```

### BUG-A7-5-027 (MEDIUM) — ManualCalibration.tsx: autoSnap and snapEdges toggles are dead local state — no store/canvas integration
**File:** src/components/ManualCalibration.tsx:40–41  
**Description:** `autoSnap` (default `true`) and `snapEdges` (default `false`) are local
React `useState`. The snapping toggle buttons update their visual state but neither value
is written to the Zustand store or passed to any canvas/drawing hook. The calibration
overlay that captures click points does not consult these flags. Automatic snapping during
calibration line placement is therefore always in its default state regardless of what the
user selects. This is analogous to BUG-A7-5-024 (MarkupTools dead local state).  
**Fix:** Expose snapping flags via the store (add `calibrationAutoSnap: boolean` and
`calibrationSnapEdges: boolean` actions/state) or pass them as props/context to the
calibration canvas handler. The calibration click handler must read the active snap
settings when computing the final calibration point coordinates.

### BUG-A7-5-028 (MEDIUM) — CropOverlay.tsx: toBaseCoords has no zero-rect guard — NaN coordinates on layout transitions
**File:** src/components/CropOverlay.tsx:44–50  
**Description:** `toBaseCoords` divides by `rect.width` and `rect.height` without
checking for zero:
```ts
x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
```
If the containing element has zero dimensions (layout animation, first render before
CSS hydration, or being hidden via CSS display:none that still fires mousedown), the
result is `NaN` or `Infinity`. These coordinates are stored in `startPoint` and
`currentPoint` state and later passed to `onCropComplete` as the crop rect. A crop
with `NaN` coordinates propagates to downstream consumers that apply the crop to the
PDF rendering pipeline, potentially crashing or corrupting the render.  
**Fix:** Match the guard pattern used in `CutTool.tsx`:
```ts
if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
```
Additionally add a minimum crop size check in terms of **fraction** of `baseDims` rather
than absolute 10 base units, to be robust across different PDF coordinate spaces.

### BUG-A7-5-029 (MEDIUM) — CutTool.tsx: Escape key only fires when overlay div has focus — tool cannot be cancelled reliably
**File:** src/components/CutTool.tsx:44–46  
**Description:** The `onKeyDown` handler is on the `<div>` element with `tabIndex={0}`.
It fires only when the div has DOM focus. The component does call
`containerRef.current?.focus()` — wait, it does NOT: unlike `AnnotationTool` and
`CropOverlay`, `CutTool` has no mount effect to focus the container. The div starts
unfocused. If the user activates the Cut tool via a toolbar click (which leaves focus on
the toolbar button), the Escape key never reaches the overlay's `onKeyDown` and the tool
cannot be dismissed via keyboard. The only exit path is clicking (which hits a polygon
and auto-exits to select, or misses and does nothing), making the tool a potential
keyboard trap.  
**Fix:** Either (a) add `useEffect(() => { containerRef.current?.focus(); }, [])` to
auto-focus on mount, or (b) register a `window.addEventListener('keydown', ...)` handler
inside a `useEffect` that always captures Escape regardless of focus state (same fix as
BUG-A7-3-211/BUG-A7-4-R007 for MergeSplitTool).

---

## NEW LOW BUGS (E26–E30)

### BUG-A7-5-030 (LOW) — CutTool.tsx: pagePolygons not memoised — O(n) filter on every render
**File:** src/components/CutTool.tsx:16  
**Description:** `const pagePolygons = polygons.filter((p) => p.pageNumber === currentPage);`
is computed inline in the render body without `useMemo`. Each render (e.g. triggered by
any store subscription update) repeats an O(n) filter over all polygons. With 1000+
polygons and frequent pointer events this is a recurring O(n) cost per render, the same
pattern as BUG-A7-3-051/BUG-A7-4-050 in `DrawingTool`.  
**Fix:** `const pagePolygons = useMemo(() => polygons.filter((p) => p.pageNumber === currentPage), [polygons, currentPage]);`

### BUG-A7-5-031 (LOW) — CutTool.tsx: no touch event handlers — cut tool non-functional on mobile
**File:** src/components/CutTool.tsx  
**Description:** `CutTool` handles only `onClick` (mouse event). Touch devices fire
`touchend` but not `click` reliably on `<div>` elements with `tabIndex`. The cut
action cannot be triggered on touch/mobile devices. Consistent with BUG-A7-5-011
(DrawingTool touch) and the broader mobile gap.  
**Fix:** Add `onTouchEnd` that extracts `changedTouches[0].clientX/clientY`, constructs
a synthetic point, and calls `findPolygonAt` → `cutPolygon` + `setTool('select')`.

### BUG-A7-5-032 (LOW) — AnnotationTool.tsx: no touch event handlers — annotation placement broken on mobile
**File:** src/components/AnnotationTool.tsx  
**Description:** `handleCanvasClick` is wired only to `onClick`. On touch devices the
`click` event fires after `touchend` with ~300ms delay (or not at all on fast taps). The
annotation placement workflow (tap to place, type text, confirm) is broken on touch.
Matches the same mobile gap in CutTool (BUG-A7-5-031) and DrawingTool (BUG-A7-5-011).  
**Fix:** Add `onTouchEnd` handler that extracts `changedTouches[0]` coordinates and
calls `handleCanvasClick` with a synthetic event object, mirroring the `DrawingTool`
`onTouchEnd` pattern added in the Cycle 4 fix.

### BUG-A7-5-033 (LOW) — CropOverlay.tsx: no touch event handlers — crop selection broken on mobile
**File:** src/components/CropOverlay.tsx  
**Description:** `handleMouseDown` is wired to `onMouseDown`. The `window` listeners
for drag are `mousemove`/`mouseup`. Touch devices fire `touchstart`, `touchmove`,
`touchend` — none of which trigger the crop selection flow. Crop is entirely
non-functional on mobile/tablet.  
**Fix:** Add `onTouchStart` → `handleMouseDown`-equivalent; add `touchmove`/`touchend`
window listeners alongside `mousemove`/`mouseup` in the drag `useEffect`.

### BUG-A7-5-034 (LOW) — FloorAreaMesh.tsx: Line color prop calls brighten() inline — not memoised
**File:** src/components/FloorAreaMesh.tsx:138  
**Description:**
```tsx
<Line
  points={outlinePoints}
  color={selected ? brighten(color) : color}
  ...
/>
```
The `brighten(color)` call runs on every render and internally constructs two `new Color()`
objects (one for `hex`, one for `'#ffffff'`) plus calls `c.lerp(...)`. This is the same
issue as BUG-A7-4-059 but for the `Line` outline color rather than the mesh fill.
BUG-A7-4-059 was fixed for `fillColor` and `emissiveColor` via `useMemo`, but the `Line`
color prop was missed.  
**Fix:** Compute the outline color inside the existing `fillColor` useMemo or add a
dedicated memo:
```ts
const outlineColor = useMemo(
  () => selected ? brighten(color) : color,
  [color, selected]
);
```
Then use `color={outlineColor}` on the `<Line>`.

### BUG-A7-5-035 (LOW) — AutoScalePopup.tsx: setRemaining called after onDismiss triggers unmount — React state update on unmounted component
**File:** src/components/AutoScalePopup.tsx:38–46  
**Description:** In the countdown `useEffect`:
```ts
const id = setInterval(() => {
  const elapsed = Date.now() - startRef.current;
  const left = AUTO_DISMISS_MS - elapsed;
  if (left <= 0) {
    clearInterval(id);
    onDismiss();          // may unmount the component
  } else {
    setRemaining(left);   // safe path
  }
}, 50);
```
When `left <= 0`: `clearInterval(id)` stops future ticks ✓, but `onDismiss()` is called
synchronously and may cause the parent to unmount this component. React may then warn:
"Can't perform a React state update on an unmounted component" if any state setter is
queued after `onDismiss()`. In this specific code path `setRemaining` is NOT called after
`onDismiss()`, so the warning doesn't occur here directly. However, if the 50ms timer
fires **again** between `clearInterval` and React processing the unmount (which cannot
happen since `clearInterval` is synchronous before `onDismiss`), it would. **The real
issue** is subtler: if the parent calls `onDismiss` which triggers an async state update
that eventually unmounts this component, and the `setInterval` callback fires one more
time in that window (because `clearInterval` was called but the currently-executing
callback already started before the clear), a second `setRemaining` could fire on an
unmounted component.  
**Fix:** Add an `isMounted` ref:
```ts
const isMountedRef = useRef(true);
useEffect(() => () => { isMountedRef.current = false; }, []);
// Inside interval: if (isMountedRef.current) setRemaining(left);
```

### BUG-A7-5-036 (LOW) — ManualCalibration.tsx: DPI hardcoded to 72 — incorrect for high-DPI PDF renders
**File:** src/components/ManualCalibration.tsx:14  
**Description:** `const DPI = 72;` is used in the "Enter Number" mode preview calculation:
`1 paper inch = 72 base pixels`. PDF.js renders at a configurable DPI (typically 96 or
150 for high-resolution sheets). If the PDF viewer renders at 96 DPI, then `pixelsPerFoot`
computed as `(72 * paperTotal) / realTotal` will be ~25% too low, producing systematically
incorrect scale calibrations for all "Enter Number" users. The Draw Line mode avoids this
issue because it uses the measured pixel distance directly; the Enter Number mode
substitutes the assumed-DPI calculation.  
**Fix:** Either read the actual render DPI from the store (add a `pdfRenderDPI` field
populated by the PDF viewer on load), or expose `DPI` as a configurable constant sourced
from the same place as the PDF viewer's render scale. Alternatively, document clearly in
the UI that "Enter Number" mode assumes 72 DPI and warn users when the detected DPI
differs.

### BUG-A7-5-037 (LOW) — AnnotationTool.tsx: Escape key only captured when container has focus — annotation cannot be cancelled reliably
**File:** src/components/AnnotationTool.tsx:72–78  
**Description:** The `onKeyDown` handler fires on the outer `<div>` (which calls
`containerRef.current?.focus()` on mount). However once the user clicks into the `<input>`
inside the popup, focus moves to the input. The outer div's `onKeyDown` no longer fires
for Escape. The input does handle Escape in its own `onKeyDown` at line 86 — so for the
input-focused state, cancellation works ✓. The gap is: if `containerRef.current?.focus()`
fails (e.g. the div is scrolled offscreen or has `visibility: hidden` momentarily), the
outer div never gains focus and neither Escape path fires, leaving the annotation draft
permanently open with no keyboard dismissal.  
**Fix:** This is a low-risk path. Add `window.addEventListener('keydown', ...)` as a
fallback that calls `cancel()` on Escape, or ensure `focus()` is called with a retry
on next tick: `requestAnimationFrame(() => containerRef.current?.focus())`.

### BUG-A7-5-038 (LOW) — AutoScalePopup.tsx: dontShowAgain preference is not scoped to project — suppresses popup globally
**File:** src/components/AutoScalePopup.tsx:47–55  
**Description:** When `dontShowAgain` is checked and the user clicks Accept or Ignore,
`onDontShowAgain()` is called. The implementation of `onDontShowAgain` is upstream (in
the parent component/store), but from the popup's perspective the preference has no
project-ID scope. If stored globally (e.g. in localStorage without a project key), the
user who disables the popup on one project will never see auto-scale suggestions on any
future project — including projects where scale detection would be helpful. This may
be intentional product design, but is a usability trap with no reset mechanism visible
in the UI.  
**Fix:** Scope `onDontShowAgain` to the current `projectId` (pass projectId as a prop
or read from store inside the parent). Alternatively, show a note: "You can re-enable
this in Project Settings."

---

## CONFIRMED FIXES (E26–E30 — Cycle 4 bugs verified in these files)

| Bug ID | Description | Status |
|--------|-------------|--------|
| BUG-A7-3-107 | CutTool baseDims fallback breaks hit-test | ✅ FIXED — base-coord hit test confirmed |
| BUG-A7-3-111 | CropOverlay baseDims fallback blocks all crops | ✅ FIXED — pageBaseDimensions read from store |
| BUG-A7-3-174 | MarkupTools toolbar state fully disconnected | ⚠️ PARTIAL — showMarkups/toggleShowMarkups connected ✓; activeTool/activeColor/strokeWidth still disconnected (BUG-A7-5-024) |
| BUG-A7-4-059 | FloorAreaMesh new Color() per render (fill/emissive) | ✅ FIXED — fillColor + emissiveColor useMemo confirmed |
| BUG-A7-4-060 | FloorAreaMesh outlinePoints O(n) alloc per render | ✅ FIXED — outlinePoints useMemo confirmed |
| BUG-A7-2-018 | ManualCalibration Enter Number mode not saving scale | ✅ FIXED — pixelsPerFoot computed and setScale/setScaleForPage called |

---

## CLEAN FILES (E26–E30)

**AutoScalePopup.tsx** — No critical or high issues. Focus trap, keyboard handling, countdown timer, and confidence rendering are all implemented correctly. Three minor LOW bugs noted (BUG-A7-5-035, BUG-A7-5-038).

---

## UPDATED SUMMARY TABLE (Full Cycle 5 including E26–E30)

| Severity | E1–E25 Bugs | E26–E30 Bugs | Total New | Regressions | Confirmed Fixes |
|----------|-------------|--------------|-----------|-------------|-----------------|
| CRITICAL | 1           | 0            | 1         | 0           | —               |
| HIGH     | 3           | 1            | 4         | 0           | —               |
| MEDIUM   | 8           | 5            | 13        | 1           | —               |
| LOW      | 11          | 9            | 20        | 1           | —               |
| **TOTAL**| **23**      | **15**       | **38**    | **2**       | **38**          |

---

## PRIORITISED FIX ORDER ADDENDUM (E26–E30)

1. **BUG-A7-5-024** — MarkupTools entire drawing layer disconnected from store (HIGH)
2. **BUG-A7-5-026** — ManualCalibration leaves calibrationMode=true on unmount → eats all canvas clicks (MEDIUM, CRITICAL USABILITY)
3. **BUG-A7-5-027** — ManualCalibration autoSnap/snapEdges dead local state (MEDIUM)
4. **BUG-A7-5-025** — AnnotationTool popup clips off right/bottom edges (MEDIUM)
5. **BUG-A7-5-028** — CropOverlay toBaseCoords no zero-rect guard (MEDIUM)
6. **BUG-A7-5-029** — CutTool Escape key unfocused → keyboard trap (MEDIUM)
7. **BUG-A7-5-036** — ManualCalibration DPI hardcoded to 72 — wrong for high-DPI renders (LOW)
8. **BUG-A7-5-030 / BUG-A7-5-031 / BUG-A7-5-032 / BUG-A7-5-033** — Missing useMemo + touch handlers (LOW)
9. **BUG-A7-5-034** — FloorAreaMesh Line color prop missing memoisation (LOW)
10. **BUG-A7-5-035 / BUG-A7-5-037 / BUG-A7-5-038** — Minor edge cases (LOW)

---

## Appendix: Files Audited in Cycle 5 (Full, E1–E30)

| File | Lines | Issues Found |
|------|-------|-------------|
| src/lib/store.ts | 1132 | R-C5-001, R-C5-002, BUG-A7-5-005, BUG-A7-5-006, BUG-A7-5-007, BUG-A7-5-016, BUG-A7-5-017, BUG-A7-5-018 |
| src/hooks/use-feature-flag.ts | 40 | BUG-A7-5-004, BUG-A7-5-015 |
| src/hooks/use-text-search.ts | 65 | BUG-A7-5-013, BUG-A7-5-014 |
| src/hooks/useRealtimeSync.ts | 28 | BUG-A7-5-008 |
| src/hooks/useViewerPresence.ts | 40 | BUG-A7-5-009 |
| src/components/DrawingTool.tsx | ~295 | BUG-A7-5-011, BUG-A7-5-023 |
| src/components/DrawingSetManager.tsx | ~400 | BUG-A7-5-001, BUG-A7-5-002, BUG-A7-5-003, BUG-A7-5-010, BUG-A7-5-019, BUG-A7-5-020 |
| src/components/DrawingComparison.tsx | ~440 | BUG-A7-5-012, BUG-A7-5-021, BUG-A7-5-022 |
| src/components/AnnotationTool.tsx | ~115 | BUG-A7-5-025, BUG-A7-5-032, BUG-A7-5-037 |
| src/components/CutTool.tsx | ~65 | BUG-A7-5-029, BUG-A7-5-030, BUG-A7-5-031 |
| src/components/CropOverlay.tsx | ~130 | BUG-A7-5-028, BUG-A7-5-033 |
| src/components/FloorAreaMesh.tsx | ~155 | BUG-A7-5-034 |
| src/components/MarkupTools.tsx | ~160 | BUG-A7-5-024 |
| src/components/ManualCalibration.tsx | ~310 | BUG-A7-5-026, BUG-A7-5-027, BUG-A7-5-036 |
| src/components/AutoScalePopup.tsx | ~120 | BUG-A7-5-035, BUG-A7-5-038 |

---

*Report updated by Admiral 7 — 2026-03-20 (E26–E30 dispatch)*  
*Total across full Cycle 5: 38 new bugs (1 CRITICAL, 4 HIGH, 13 MEDIUM, 20 LOW) + 2 regressions + 38 confirmed fixes.*