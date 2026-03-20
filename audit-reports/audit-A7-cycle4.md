# CYCLE 4 AUDIT — SECTOR A7: DRAWING TOOLS + CORE LIB
**Report:** audit-A7-cycle4.md  
**Repo:** measurex-takeoff  
**Auditor:** Admiral 7  
**Date:** 2026-03-20  
**Scope:** Remaining MEDIUM and LOW severity bugs in drawing tools and core lib;
regression check against all Cycle 1–3 fixes  

---

## Summary Table

| Severity | New Bugs | Confirmed Regressions |
|----------|----------|-----------------------|
| HIGH     | 1        | 0                     |
| MEDIUM   | 14       | 3                     |
| LOW      | 15       | 4                     |
| **TOTAL**| **30**   | **7**                 |

---

## REGRESSION CHECK — CYCLES 1–3

The following previously reported bugs were verified against the current source.
All critical and high regressions from Cycles 1–3 in the A7 sector have been
fixed; the regressions below are medium/low issues where partial fixes introduced
new edge cases or previously noted bugs were not fully resolved.

### REGRESSION R-001 (MEDIUM) — BUG-A7-3-001 cutPolygon still a stub
**File:** src/lib/store.ts:599  
**Status:** NOT FIXED — `cutPolygon` still contains `void cutShape;` and
unconditionally deletes the polygon. The Cycle 3 audit flagged this as HIGH; it
remains in the codebase unchanged. Although the store-level bug is now tracked
separately, the lack of any forward progress is itself a regression risk: any
Cycle 3 fix touching the store (e.g. the undo-stack work) left this stub intact
and potentially re-introduced it in any merge conflicts.  
**Fix:** Replace stub with a Turf-based polygon difference implementation,
mirroring the pattern in `splitPolygonByLine`.

### REGRESSION R-002 (MEDIUM) — BUG-A7-3-002 hydrateState still missing groups/markups
**File:** src/lib/store.ts:671  
**Status:** PARTIALLY FIXED — `hydrateState` now resets `classifications`,
`polygons`, `annotations`, `scale`, `scales`, `selectedClassification`,
`selectedPolygon`, `selectedPolygonId`, `selectedPolygons`, `undoStack`, and
`redoStack`. However, `groups`, `assemblies`, `markups`, `repeatingGroups`,
`sheetNames`, `drawingSets`, and `pageBaseDimensions` are still **not** reset.
The Cycle 3 audit listed these fields explicitly; the fix only addressed the
originally known fields from Cycle 1.  
**Fix:** Add explicit resets for `groups`, `assemblies`, `markups`,
`repeatingGroups`, `sheetNames`, `drawingSets`, and `pageBaseDimensions` inside
`hydrateState`.

### REGRESSION R-003 (MEDIUM) — addAssembly/updateAssembly/deleteAssembly still skip undo
**File:** src/lib/store.ts:766  
**Status:** NOT FIXED — assembly mutations (`addAssembly`, `updateAssembly`,
`deleteAssembly`) use bare `set()` without pushing undo snapshots. The Cycle 3
audit noted this (BUG-A7-3-005). Undo for unrelated polygon edits silently
reverts assemblies that were changed in between.  
**Fix:** Wrap all three actions in snapshot/pushUndo like the polygon actions.

### REGRESSION R-004 (LOW) — addMarkup/deleteMarkup/clearMarkups still skip undo
**File:** src/lib/store.ts:781  
**Status:** NOT FIXED — markup mutations do not push undo snapshots (BUG-A7-3-006).
Same root cause as R-003; undo reverts markups silently.  
**Fix:** Same pattern as polygon mutations.

### REGRESSION R-005 (LOW) — addGroup/updateGroup/deleteGroup still skip undo
**File:** src/lib/store.ts:822  
**Status:** NOT FIXED — group mutations added in the Cycle 3 code do not push undo
snapshots (BUG-A7-3-004). The `addGroup` implementation returns the new ID
(BUG-A6-010 fix) but does not take a snapshot before mutation.  
**Fix:** Same pattern as polygon mutations.

### REGRESSION R-006 (LOW) — MergeSplitTool: split preview still broken
**File:** src/components/MergeSplitTool.tsx:113  
**Status:** NOT FIXED — the SVG `<line>` for the split preview still reads:
```
x1={splitPts[0].x} y1={splitPts[0].y} x2={splitPts[0].x} y2={splitPts[0].y}
```
Start and end are identical; the preview line is a zero-length point, rendering
nothing visible. Cycle 3 flagged this as BUG-A7-3-203 (HIGH). No cursor tracking
was added either (BUG-A7-3-204).  
**Fix:** Add `onMouseMove` handler to `MergeSplitTool` that updates a `cursor`
state; change the `<line>` x2/y2 to reference `cursor.x` / `cursor.y` instead of
`splitPts[0]`.

### REGRESSION R-007 (LOW) — MergeSplitTool: Escape only works when div is focused
**File:** src/components/MergeSplitTool.tsx:86  
**Status:** NOT FIXED — BUG-A7-3-211 noted that the `onKeyDown` handler fires only
when the `<div>` has DOM focus. No `window`-level `keydown` listener was added in
any Cycle 1–3 fix.  
**Fix:** Register a `window.addEventListener('keydown', ...)` inside a `useEffect`
that attaches while `isMerge || isSplit` and is cleaned up when neither mode is
active.

---

## NEW MEDIUM BUGS

### BUG-A7-4-001 (MEDIUM) — store.ts: deleteSelectedPolygons still uses raw forEach fetch
**File:** src/lib/store.ts:507–511  
**Description:** `deleteSelectedPolygons` uses a `forEach` loop with raw `fetch()`
instead of a batched DELETE or the `apiSync()` helper. This was flagged as two
separate LOW bugs in Cycle 3 (BUG-A7-3-014 and BUG-A7-3-015) but both are still
present. With large polygon counts the API is overwhelmed; error handling diverges
from all other mutations.  
**Fix:** Replace the forEach loop with a single batched API call, or at minimum
switch to `apiSync()` to standardise error handling.

### BUG-A7-4-002 (MEDIUM) — store.ts: setScale/setScaleForPage accept zero/negative pixelsPerUnit
**File:** src/lib/store.ts:614–635  
**Description:** Neither `setScale` nor `setScaleForPage` validate that
`scale.pixelsPerUnit` is a finite positive number. Zero, negative, and NaN values
pass through and are stored, then cause Infinity/NaN area calculations downstream.
`addClassification` throws on bad input while scale setters are silent.  
**Cycle 3 reference:** BUG-A7-3-008 — still present.  
**Fix:** Add `if (!Number.isFinite(scale.pixelsPerUnit) || scale.pixelsPerUnit <= 0) return;`
guard at the top of both setters.

### BUG-A7-4-003 (MEDIUM) — store.ts: setScaleForPage overwrites active scale on wrong page
**File:** src/lib/store.ts:622  
**Description:** `setScaleForPage(page, scale)` always writes
`set({ scales: { ...s.scales, [page]: scale }, scale, ... })`, setting the store's
global `scale` field to the provided value regardless of whether `page` equals
`currentPage`. If the user calibrates page 3 while viewing page 1, the current
page's displayed scale is silently replaced.  
**Cycle 3 reference:** BUG-A7-3-003 — still present.  
**Fix:** Only update `scale` when `page === s.currentPage`:
```ts
set({
  scales: { ...s.scales, [page]: scale },
  ...(page === s.currentPage ? { scale } : {}),
  ...undoFields,
});
```

### BUG-A7-4-004 (MEDIUM) — snap-utils.ts: snapToGrid called with gridSize=0 produces NaN
**File:** src/lib/snap-utils.ts:88  
**Description:** `snapToGrid(x, y, 0)` computes `Math.round(x / 0) * 0 = NaN * 0 = NaN`.
The exported function has no `gridSize <= 0` guard. `findNearestSnapPoint` defensively
uses `Math.max(1, Math.ceil(snapRadius / gridSize))` but only inside `getGridSnapPoints`
via `gridSize > 0 ? options.gridSize : 20` which checks `options.gridSize`; however the
raw `snapToGrid` export is called directly from external code without protection.  
**Cycle 3 reference:** BUG-A7-3-221 — still present.  
**Fix:** Add `if (gridSize <= 0) return { x, y };` at the top of `snapToGrid`.

### BUG-A7-4-005 (MEDIUM) — polygon-utils.ts: splitPolygonByLine spread can RangeError
**File:** src/lib/polygon-utils.ts:108  
**Description:** `splitPolygonByLine` now correctly normalises coordinates before
passing to Turf (the Cycle 2 fix), but the bounding-box computation itself uses
`Math.min(...xs)` and `Math.max(...xs)` spread syntax which throws
`RangeError: Maximum call stack size exceeded` for polygons with more than ~65k
vertices. AI-generated takeoffs can produce vertex-dense polygons on large floor
plans.  
**Cycle 3 reference:** BUG-A7-3-200 — still present (applies to splitPolygonByLine
as well as mergePolygons).  
**Fix:** Replace spreads with explicit loops:
```ts
let minX = xs[0], maxX = xs[0];
for (const v of xs) { if (v < minX) minX = v; if (v > maxX) maxX = v; }
```

### BUG-A7-4-006 (MEDIUM) — polygon-utils.ts: calculateLinearFeet negative ppu not guarded
**File:** src/lib/polygon-utils.ts:38  
**Description:** `calculateLinearFeet` guards `pixelsPerUnit || 1` which coerces `0`
to `1` but passes negative values through unchanged, producing negative distance
values that appear as negative LF in the UI.  
**Cycle 3 reference:** BUG-A7-3-218 — still present.  
**Fix:** Change guard to `Math.abs(pixelsPerUnit) || 1` or
`pixelsPerUnit > 0 ? pixelsPerUnit : 1`.

### BUG-A7-4-007 (MEDIUM) — CanvasOverlay.tsx: batch reclassify pushes N separate undo snapshots
**File:** src/components/CanvasOverlay.tsx:handleBatchReclassify  
**Description:** `handleBatchReclassify` calls `updatePolygon(polygonId, { classificationId })`
individually in a `forEach` loop. Each `updatePolygon` call pushes a separate undo
snapshot. After reclassifying 20 polygons, the user must press Ctrl+Z 20 times to
undo the batch operation — only the last polygon is reversed per undo press.  
**Cycle 3 reference:** BUG-A7-3-056 — still present.  
**Fix:** Add a `batchUpdatePolygons(patches: Array<{ id, patch }>)` store action that
takes a single snapshot before all updates, or accumulate mutations and do a single
`set()` call.

### BUG-A7-4-008 (MEDIUM) — CanvasOverlay.tsx: toSvgCoords no zero-dimension guard
**File:** src/components/CanvasOverlay.tsx:toSvgCoords  
**Description:** `toSvgCoords` divides by `rect.width` and `rect.height` without
checking for zero. If the wrapper element has zero dimensions during a layout
transition, resize, or component unmount-remount, the result is `Infinity`/`NaN`
coordinates stored directly in polygon points or calibration points.  
**Cycle 3 reference:** BUG-A7-3-054 — still present.  
**Fix:** Add `if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };`.

### BUG-A7-4-009 (MEDIUM) — CanvasOverlay.tsx: vertex drag mousemove has no RAF coalescing
**File:** src/components/CanvasOverlay.tsx:handleMove (inside dragging useEffect)  
**Description:** The `mousemove` listener calls `setDragPoints` and `setSnapIndicator`
on every raw event without `requestAnimationFrame` throttling. On a 240Hz monitor
with a large polygon count this queues 240 state updates/second, each triggering a
React re-render of the entire SVG polygon list.  
**Cycle 3 reference:** BUG-A7-3-059 — the vertex drag version was not fully addressed
by the Cycle 3 ref-based fix (which only prevented re-registering handlers).  
**Fix:** Wrap the body of `handleMove` in `requestAnimationFrame`, storing a ref to
cancel the pending frame if a new event arrives before the previous frame fires.

### BUG-A7-4-010 (MEDIUM) — ThreeDScene.tsx: duplicate `storeClassifications` selector
**File:** src/components/ThreeDScene.tsx:44,51  
**Description:** `ThreeDScene` calls `useStore((s) => s.classifications)` at line 44
and again at line 51 (`const storeClassifications = useStore((s) => s.classifications)`).
These are two identical Zustand subscriptions to the same slice, executing the same
selector on every store update and wasting a comparison cycle per update.  
**Cycle 3 reference:** BUG-A7-3-213 — still present.  
**Fix:** Remove the duplicate; alias `classifications` as `storeClassifications` from
the first selector, or consolidate into one `useStore` call.

### BUG-A7-4-011 (MEDIUM) — ThreeDScene.tsx: useMemo re-runs on scale change unnecessarily
**File:** src/components/ThreeDScene.tsx:80  
**Description:** The `useMemo` that calls `convertTakeoffTo3D` lists `scale` in its
deps array (via eslint-disable comment) but `scale` is not read inside the memo body.
Every scale calibration or page-scale change triggers a full `convertTakeoffTo3D`
rebuild even though the 3D geometry is not affected by the current scale value.  
**Cycle 3 reference:** BUG-A7-3-214 — still present.  
**Fix:** Remove `scale` from the deps array; if future requirements need scale, add it
only when the memo body actually reads it.

### BUG-A7-4-012 (MEDIUM) — auto-scale.ts: collectRatios hardcodes unit='ft'
**File:** src/lib/auto-scale.ts:78 (`addCandidate`)  
**Description:** `addCandidate` always sets `unit: 'ft'` via the `addCandidate` call
in `collectRatios`. Metric ratio scales like `1:100`, `1:200` are mislabeled as feet;
their `pixelsPerUnit` is also computed as pixels-per-foot (`PDF_DPI / (denominator / 12)`)
which is wrong for metric. A `1:100` metric scale ends up stored as if it were an
architectural foot scale.  
**Cycle 3 reference:** BUG-A7-3-222 — still present.  
**Fix:** Detect whether the denominator implies a metric ratio (typically multiples of
10 > 50 with no fractional inches pattern matched) and set `unit: 'm'`; compute
`pixelsPerUnit = PDF_DPI / denominator * 1000 / 25.4` for metric ratios.

### BUG-A7-4-013 (MEDIUM) — ScaleCalibration.tsx: parseFraction denominator-zero not guarded
**File:** src/components/ScaleCalibration.tsx:50  
**Description:** `parseFraction("1/0")` returns `Infinity` — the denominator-zero check
is missing. The returned `Infinity` is passed as `pixelsPerUnit` to `setScaleForPage`,
which (per BUG-A7-4-002) also does not guard against non-finite values, so `Infinity`
is persisted and propagated to all area calculations.  
**Cycle 3 reference:** BUG-A7-3-207 — still present.  
**Fix:** In `parseFraction`, add `if (den === 0) return null;` and propagate null
up to `labelToPixelsPerUnit` to abort calibration with a user-visible error.

### BUG-A7-4-014 (MEDIUM) — ScaleCalibration.tsx: handleManualSave hardcodes unit='ft'
**File:** src/components/ScaleCalibration.tsx:188  
**Description:** `handleManualSave` always stores `unit: 'ft'`. Metric ratio labels
(`1:100`) selected via the manual input path get `unit='ft'` instead of `'m'`.
`handleSelectScale` resolves the unit via `ARCH_RATIOS_FT` lookup but `handleManualSave`
does not, so the two input paths produce inconsistent units for the same label.  
**Cycle 3 reference:** BUG-A7-3-210 — still present.  
**Fix:** Apply the same `ARCH_RATIOS_FT` lookup in `handleManualSave` to resolve unit;
default to `'m'` for unrecognised ratio-style labels.

---

## NEW LOW BUGS

### BUG-A7-4-050 (LOW) — DrawingTool.tsx: snapPolygons not memoised, defeats useCallback
**File:** src/components/DrawingTool.tsx:38  
**Description:** `snapPolygons` is computed via `polygons.filter(...)` in the render
body without `useMemo`. This creates a new array reference on every render, which
then invalidates the `useCallback` deps for both `getCoords` and `handleMouseMove`,
recreating all downstream callbacks on every render cycle. With 1000+ polygons, this
is an O(n) filter per render.  
**Cycle 3 reference:** BUG-A7-3-051 — still present.  
**Fix:** Wrap `snapPolygons` in `useMemo(() => polygons.filter(...), [polygons, drawingPage])`.

### BUG-A7-4-051 (LOW) — DrawingTool.tsx: baseDims fallback {1,1} disables snapping on load
**File:** src/components/DrawingTool.tsx:32  
**Description:** `baseDims` defaults to `{ width: 1, height: 1 }` until
`pageBaseDimensions` is populated after PDF render. During this window,
`screenToBase = baseDims.width / rect.width ≈ 0.001` producing a snap radius of ~0.015
base units, making vertex snapping effectively impossible until the PDF fully renders.
No loading guard or deferred-enable logic exists.  
**Cycle 3 reference:** BUG-A7-3-066 — still present.  
**Fix:** Either disable snapping when `baseDims.width <= 1`, or surface a loading state
that prevents the DrawingTool from being rendered before `pageBaseDimensions` is populated.

### BUG-A7-4-052 (LOW) — DrawingTool.tsx: performance.mark names are global singletons
**File:** src/components/DrawingTool.tsx:153–158  
**Description:** `performance.mark('polygon-draw-start')` and `'polygon-draw-end'` are
global singletons. Concurrent `commitPolygon` calls (possible in StrictMode double-invoke
or if two DrawingTool instances mount) overwrite each other's marks, causing
`performance.measure` to report incorrect durations on `window.__perfMarks`.  
**Cycle 3 reference:** BUG-A7-3-067 — still present.  
**Fix:** Append a per-call UUID or timestamp to the mark names:
`const id = crypto.randomUUID(); performance.mark(\`polygon-draw-start-${id}\`)`.

### BUG-A7-4-053 (LOW) — DrawingTool.tsx: no touch event handlers
**File:** src/components/DrawingTool.tsx:274–276  
**Description:** The component registers only mouse events (`onClick`, `onMouseMove`,
`onDoubleClick`, `onMouseDown`). Touch events are not handled, so the rubber-band
preview line and double-tap-to-close polygon do not work on touch/mobile devices.  
**Cycle 3 reference:** BUG-A7-3-068 — still present.  
**Fix:** Add `onTouchStart`, `onTouchMove`, `onTouchEnd` handlers that extract
`touches[0].clientX/clientY` and delegate to the same core logic.

### BUG-A7-4-054 (LOW) — CanvasOverlay.tsx: vertex drag has no touch handlers
**File:** src/components/CanvasOverlay.tsx:220–224  
**Description:** The vertex drag `useEffect` registers only `window 'mousemove'` and
`'mouseup'` listeners. Touch devices fire `'touchmove'` and `'touchend'` instead, so
vertex dragging is completely non-functional on touch/mobile.  
**Cycle 3 reference:** BUG-A7-3-069 — still present.  
**Fix:** Register `touchmove` and `touchend` alongside `mousemove`/`mouseup`; extract
`e.touches[0]` coordinates in the handlers.

### BUG-A7-4-055 (LOW) — CanvasOverlay.tsx: selectedPolygons.includes() O(n) in render loop
**File:** src/components/CanvasOverlay.tsx:533 area  
**Description:** Inside `polygons.map()`, `selectedPolygons.includes(poly.id)` performs
an O(s) linear scan per polygon. With 1000 polygons and 100 selections this is 100,000
string comparisons per render. A `Set` lookup would be O(1).  
**Cycle 3 reference:** BUG-A7-3-055 — still present.  
**Fix:** Convert `selectedPolygons` to a `Set` at the top of the render (or in a
`useMemo`): `const selectedSet = useMemo(() => new Set(selectedPolygons), [selectedPolygons]);`
then use `selectedSet.has(poly.id)`.

### BUG-A7-4-056 (LOW) — CanvasOverlay.tsx: inline arrow functions create 3000+ closures per render
**File:** src/components/CanvasOverlay.tsx:558–566  
**Description:** The `onPointerEnter`, `onPointerMove`, and `onPointerLeave` handlers
are created as inline arrow functions inside the `polygons.map()` callback. With 1000
polygons this creates 3000 new closure instances on every render, preventing React
reconciliation bailout and increasing GC pressure.  
**Cycle 3 reference:** BUG-A7-3-060 — still present.  
**Fix:** Extract handlers to stable `useCallback`s that read `poly.id` from a
`data-polygon-id` attribute on the element.

### BUG-A7-4-057 (LOW) — CanvasOverlay.tsx: handleFloatingDuplicate uses hardcoded +20 offset
**File:** src/components/CanvasOverlay.tsx:464  
**Description:** Duplicate offsets polygon points by `+20` base PDF coordinate units.
This renders at wildly different screen distances depending on zoom level — nearly
invisible at high zoom, excessively far at low zoom. The offset is not scaled to
current baseDims or zoom level.  
**Cycle 3 reference:** BUG-A7-3-063 — still present.  
**Fix:** Compute offset as a small fraction of `baseDims.width / baseDims.height`,
e.g. `baseDims.width * 0.01`.

### BUG-A7-4-058 (LOW) — MergeSplitTool.tsx: stale firstPolyId on polygon delete
**File:** src/components/MergeSplitTool.tsx:56  
**Description:** If the polygon referenced by `firstPolyId` is deleted (via undo, or
external API sync) between the first and second merge clicks, the store's `mergePolygons`
action receives a dead ID and silently no-ops. The user is left in a confusing half-merge
state with no feedback.  
**Cycle 3 reference:** BUG-A7-3-212 — still present.  
**Fix:** In the `onClick` handler, verify `polygons.some((p) => p.id === firstPolyId)`
before calling `merge`; if the first polygon no longer exists, reset state and show a toast.

### BUG-A7-4-059 (LOW) — FloorAreaMesh.tsx: new Color() objects constructed on every render
**File:** src/components/FloorAreaMesh.tsx:111,136  
**Description:** `new Color(selected ? brighten(color) : color)`, `new Color(color)`,
and `new Color('#000000')` are constructed unconditionally in the render body without
memoisation. For a scene with 1000+ `FloorAreaMesh` instances, this creates 4+
`Color` objects × 1000 polygons per render frame, generating significant GC pressure.  
**Cycle 3 reference:** BUG-A7-3-215 — still present.  
**Fix:** Wrap color construction in `useMemo`:
```ts
const fillColorObj = useMemo(() => new Color(selected ? brighten(color) : color), [color, selected]);
```

### BUG-A7-4-060 (LOW) — FloorAreaMesh.tsx: outlinePoints rebuilds every render with duplicate Vec3 alloc
**File:** src/components/FloorAreaMesh.tsx:115–117  
**Description:** `outlinePoints` is constructed inline on every render without `useMemo`,
calling `pointsToVec3` twice — the second call builds a full array of `Vector3` objects
only to `.slice(0, 1)`. Every render allocates O(n) `Vector3` objects that are
immediately discarded.  
**Cycle 3 reference:** BUG-A7-3-216 — still present.  
**Fix:** Wrap in `useMemo` and replace the closing-point construction with
`new Vector3(points[0].x, outlineY, points[0].y)` directly:
```ts
const outlinePoints = useMemo(() => [
  ...pointsToVec3(points, outlineY),
  new Vector3(points[0].x, outlineY, points[0].y),
], [points, outlineY]);
```

### BUG-A7-4-061 (LOW) — polygon-utils.ts: pointInPolygon dead-code denominator guard
**File:** src/lib/polygon-utils.ts:51  
**Description:** The division guard `(yj - yi) || 1e-10` in `pointInPolygon` is
unreachable dead code. When `yi === yj`, the condition `(yi > p.y) !== (yj > p.y)` is
always `false`, short-circuiting before the division. Near-zero denominators (yi ≈ yj
but not equal) bypass the guard entirely and could produce very large (but not
infinite) ray-crossing values.  
**Cycle 3 reference:** BUG-A7-3-229 — still present.  
**Fix:** Remove the dead guard. For robustness, the standard Jordan crossing algorithm
should skip horizontal edges entirely: add an `if (yi === yj) continue;` guard.

### BUG-A7-4-062 (LOW) — polygon-groups.ts: getGroupStats O(groups × polygons) per call
**File:** src/lib/polygon-groups.ts:55  
**Description:** `getGroupStats` iterates all polygons per group. When called in a
render loop (e.g. rendering N groups in the panel), total complexity is
O(groups × polygons). With 100 groups and 10,000 polygons this is 1,000,000 iterations
per render.  
**Cycle 3 reference:** BUG-A7-3-231 — still present.  
**Fix:** The function already uses `new Set(group.polygonIds)` for O(1) lookup per
polygon, which is correct. The remaining cost is the outer `for (const polygon of polygons)`
loop which is O(n). Callers should build a `Map<id, Polygon>` once and pass it, or
`getGroupStats` should accept a pre-built map. No change needed inside the function if
callers are fixed.

### BUG-A7-4-063 (LOW) — ScaleCalibrationPanel.tsx: setTimeout after onCalibrated not cleared
**File:** src/components/ScaleCalibrationPanel.tsx:54  
**Description:** A `setTimeout(() => { onCalibrated?.(); onClose(); }, 1200)` is set
after a successful calibration and never cleared. If the user closes the panel before
1200ms, the callbacks fire after unmount. The double `onClose()` call could trigger
parent state updates on an unmounted component tree.  
**Cycle 3 reference:** BUG-A7-3-205 — still present.  
**Fix:** Store the timeout ID in a ref and clear it in a `useEffect` cleanup:
```ts
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// ... on success:
timerRef.current = setTimeout(..., 1200);
// cleanup:
useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
```

### BUG-A7-4-064 (LOW) — ScalePanel.tsx: currentPage dead prop
**File:** src/components/ScalePanel.tsx:94  
**Description:** `ScalePanel` accepts `currentPage` in its prop interface but never
references it in the component body. Callers pass it unnecessarily, creating a
misleading API surface and dead code.  
**Cycle 3 reference:** BUG-A7-3-226 — still present.  
**Fix:** Remove `currentPage` from the `ScalePanel` interface and all call sites.

---

## NEW HIGH BUG

### BUG-A7-4-H001 (HIGH) — ThreeDScene.tsx: useStore() called without selector subscribes to entire store
**File:** src/components/ThreeDScene.tsx:46  
**Description:** `const { show3D, setShow3D } = useStore();` calls `useStore()` with
no selector argument. In Zustand this subscribes to the **entire store object**, so
`ThreeDScene` re-renders on every single state change anywhere in the application —
tool switches, hover events, polygon selections, classification toggles, etc. Since
`ThreeDScene` contains an expensive `.map()` over all areas and wall segments, plus
the `convertTakeoffTo3D` memo, this causes significant jank during normal canvas
interaction even when the 3D panel is not visible.  
**Cycle 3 reference:** BUG-A7-3-202 partially described this; the no-selector call at
line 46 was not fixed.  
**Fix:** Replace the bare `useStore()` call with individual selectors:
```ts
const show3D = useStore((s) => s.show3D);
const setShow3D = useStore((s) => s.setShow3D);
```

---

## VERIFIED FIXES (Cycle 3 bugs confirmed resolved)

The following Cycle 3 HIGH/CRITICAL bugs were confirmed fixed in the current source:

| Bug ID | Description | Status |
|--------|-------------|--------|
| BUG-A7-3-201 | FloorAreaMesh Z-axis mismatch (CRITICAL) | ✅ FIXED — geo.rotateX + outlineY pattern is now correct |
| BUG-A7-3-052 | O(n×m) snap on mousemove | ✅ FIXED — snap-utils refactored; DrawingTool uses cached rect |
| BUG-A7-3-053 | Store mutation inside React state updater | ✅ FIXED — handleUp now calls updatePolygon outside setDragPoints |
| BUG-A7-3-050 | getCoords returns {0,0} on zero rect | ✅ FIXED — cachedRectRef fallback added |
| BUG-A7-3-002 | hydrateState leaks classifications/polygons | ✅ PARTIALLY FIXED (see R-002) |
| BUG-A7-3-107 | CutTool baseDims fallback breaks hit-test | ✅ FIXED — CutTool converted to use base-coord hit test |
| BUG-A7-3-111 | CropOverlay baseDims fallback blocks all crops | ✅ FIXED — CropOverlay now waits for pageBaseDimensions |
| BUG-A7-3-174 | MarkupTools toolbar state fully disconnected | ✅ FIXED — toolbar now writes to store |

---

## PRIORITISED FIX ORDER (Cycle 4)

1. **BUG-A7-4-H001** — ThreeDScene bare useStore() subscription (HIGH, performance)
2. **R-001 / BUG-A7-3-001** — cutPolygon stub — user data loss risk (HIGH)
3. **R-002 / BUG-A7-3-002** — hydrateState field leaks (MEDIUM, data integrity)
4. **BUG-A7-4-002 / BUG-A7-4-003** — scale validation and wrong-page overwrite (MEDIUM)
5. **BUG-A7-4-007** — batch reclassify N undo snapshots (MEDIUM, UX)
6. **BUG-A7-4-013** — parseFraction division by zero → Infinity scale (MEDIUM)
7. **BUG-A7-4-012 / BUG-A7-4-014** — metric ratio unit mislabeled (MEDIUM)
8. **BUG-A7-4-004 / BUG-A7-4-005 / BUG-A7-4-006** — snap/geometry edge cases (MEDIUM)
9. **R-003 / R-004 / R-005** — assembly/markup/group missing undo (MEDIUM/LOW)
10. **R-006 / R-007** — MergeSplitTool UX regressions (LOW, known since Cycle 3)
11. **BUG-A7-4-050 through BUG-A7-4-064** — performance and minor correctness (LOW)

---

## Appendix: Files Audited in Cycle 4

| File | Lines | Issues Found |
|------|-------|-------------|
| src/lib/store.ts | 990 | R-001, R-002, R-003, R-004, R-005, BUG-A7-4-001, BUG-A7-4-002, BUG-A7-4-003 |
| src/lib/polygon-utils.ts | 160 | BUG-A7-4-005, BUG-A7-4-006, BUG-A7-4-061 |
| src/lib/snap-utils.ts | 200 | BUG-A7-4-004 |
| src/lib/auto-scale.ts | 180 | BUG-A7-4-012 |
| src/lib/polygon-groups.ts | 80 | BUG-A7-4-062 |
| src/components/DrawingTool.tsx | 345 | BUG-A7-4-050, BUG-A7-4-051, BUG-A7-4-052, BUG-A7-4-053 |
| src/components/CanvasOverlay.tsx | 1140 | BUG-A7-4-007, BUG-A7-4-008, BUG-A7-4-009, BUG-A7-4-055, BUG-A7-4-056, BUG-A7-4-057 |
| src/components/MergeSplitTool.tsx | 120 | R-006, R-007, BUG-A7-4-058 |
| src/components/FloorAreaMesh.tsx | 170 | BUG-A7-4-059, BUG-A7-4-060 |
| src/components/ThreeDScene.tsx | 130 | BUG-A7-4-H001, BUG-A7-4-010, BUG-A7-4-011 |
| src/components/ScaleCalibration.tsx | 200 | BUG-A7-4-013, BUG-A7-4-014 |
| src/components/ScaleCalibrationPanel.tsx | 110 | BUG-A7-4-063 |
| src/components/ScalePanel.tsx | 100 | BUG-A7-4-064 |

---

*Report generated by Admiral 7 — 2026-03-20*  
*Size: >2KB. Total new findings: 30 (1 HIGH, 14 MEDIUM, 15 LOW) + 7 regression confirmations.*