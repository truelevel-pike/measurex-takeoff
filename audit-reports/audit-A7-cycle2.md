# Audit Report — Sector A7: Core Drawing Tools + Canvas + Stores
**Date:** 2026-03-20  
**Branch:** main  
**Auditor:** Sector A7 Agent  
**Files Audited:**
- `src/components/DrawingTool.tsx`
- `src/components/CanvasOverlay.tsx`
- `src/components/AnnotationTool.tsx`
- `src/components/CutTool.tsx`
- `src/components/CropOverlay.tsx`
- `src/components/FloorAreaMesh.tsx`
- `src/components/MarkupTools.tsx`
- `src/components/ManualCalibration.tsx`
- `src/components/AutoScalePopup.tsx`
- `src/lib/store.ts`
- `src/hooks/use-feature-flag.ts`
- `src/hooks/use-text-search.ts`
- `src/hooks/useRealtimeSync.ts`
- `src/hooks/useViewerPresence.ts`
- `src/lib/ai-results-loader.ts`
- `src/lib/ai-takeoff.ts`
- `src/lib/auto-scale.ts`
- `src/lib/estimate-storage.ts`
- `src/lib/export.ts`
- `src/lib/keyboard-handler.ts`
- `src/lib/measurement-settings.ts`
- `src/lib/polygon-groups.ts`
- `src/lib/polygon-utils.ts`
- `src/lib/quick-takeoff.ts`
- `src/lib/snap-utils.ts`
- `src/lib/takeoff-to-3d.ts`
- `src/lib/use-focus-trap.ts`
- `src/lib/use-measurement-settings.ts`
- `src/lib/user-prefs.ts`
- `src/lib/workspace.ts`
- `src/lib/ws-client.ts`

---

## Summary

**Total issues found: 18**  
- CRITICAL: 2  
- HIGH: 6  
- MEDIUM: 7  
- LOW: 3  

---

## Bug Findings

---

### BUG-A7-001
**File:** `src/lib/store.ts:~330` (inside `setScale`)  
**Severity:** HIGH  
**Category:** Zustand store mutation — incorrect undo push pattern  

```ts
setScale: (scale) => {
  const before = snapshot(get());
  set({ scale, undoStack: [...get().undoStack, before], redoStack: [] });
},
```

`get()` is called twice: once for `snapshot(get())` and once for `[...get().undoStack, before]`. Between these two calls a concurrent state update could mutate the undo stack, meaning `before` could be pushed onto a different version of `undoStack` than the one snapshotted. All other actions correctly capture `s = get()` once at the top and operate on that frozen reference. `setScale` is the only action that violates this pattern.

**Fix:** Capture `const s = get()` once; use `pushUndo(s.undoStack, before)` like all other actions.

---

### BUG-A7-002
**File:** `src/components/CutTool.tsx:26–32`  
**Severity:** CRITICAL  
**Category:** Scale/coordinate calculation bug — raw screen pixels used for hit testing  

```ts
const getCoords = useCallback((e: React.MouseEvent): Point => {
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}, []);
```

`getCoords` returns raw screen-space pixels (client offset from the element's left/top). However, `pointInPolygon` (called immediately after in `findPolygonAt`) operates in **base PDF coordinate space** — the same space that polygon `points` live in (i.e., normalized by `baseDims.width/height`). This means hit-testing will always fail or produce wildly incorrect results unless the element happens to be exactly `baseDims.width × baseDims.height` pixels on screen.

`DrawingTool.getCoords` and `CanvasOverlay.toSvgCoords` both correctly normalize by dividing by `rect.width/height` and multiplying by `baseDims.width/height`. `CutTool.getCoords` does not — it omits this normalization entirely.

**Fix:** Apply the same normalization:
```ts
const baseDims = useStore((s) => s.pageBaseDimensions[s.currentPage] ?? { width: 1, height: 1 });

const getCoords = useCallback((e: React.MouseEvent): Point => {
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
  return {
    x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
    y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
  };
}, [baseDims]);
```

---

### BUG-A7-003
**File:** `src/lib/ws-client.ts:~180–220` (polygon:updated / classification:updated handlers)  
**Severity:** HIGH  
**Category:** Race condition / stale closure capturing old store state  

```ts
case 'polygon:updated': {
  const poly = parsed.data as Polygon;
  if (store.polygons.some((p) => p.id === poly.id)) {
    store.updatePolygon(poly.id, poly);
  } else {
    useStore.setState((s) => ({ polygons: [...s.polygons, poly] }));
  }
```

`store` is captured via `const store = useStore.getState()` once at the top of `handleSSEMessage`. If two SSE events are processed in quick succession (e.g., `polygon:created` followed immediately by `polygon:updated`), the `store` snapshot used for `polygon:updated` will not reflect the polygon added by `polygon:created` because the state update from the first event may not have propagated yet. This can cause the upsert path to create a duplicate or the update to be applied to a stale state.

**Fix:** Re-fetch state inside each case branch: `const store = useStore.getState();` at the start of each case, or use `useStore.setState(s => ...)` with functional updates throughout.

---

### BUG-A7-004
**File:** `src/hooks/use-feature-flag.ts:8–10`  
**Severity:** MEDIUM  
**Category:** Module-level mutable state / race condition  

```ts
let cachedFlags: Record<string, boolean> | null = null;
let fetchPromise: Promise<Record<string, boolean>> | null = null;
```

These module-level singletons are never reset. If the user navigates between projects and flags change server-side, or if the initial fetch fails (which nullifies `fetchPromise` but not `cachedFlags` since it was never set on failure), subsequently mounted `useFeatureFlag` hooks will use stale `false` defaults forever.

Additionally, the useEffect dependency array is `[flag]`. If `flag` stays constant across remounts but `cachedFlags` is null (e.g., after SSR hydration wipes the module cache), the effect only fires once per flag string globally — subsequent component mounts with the same flag will see the initial `false` default without re-fetching.

**Fix:** Either add a TTL to `cachedFlags` or expose a `clearFlagsCache()` function that can be called on project/session change.

---

### BUG-A7-005
**File:** `src/lib/ws-client.ts:~260–310` (startFallbackPolling)  
**Severity:** HIGH  
**Category:** Memory leak / interval not stopped on project switch  

```ts
function startFallbackPolling(projectId: string): void {
  if (pollTimer !== null) return; // already running
  pollTimer = setInterval(async () => {
    if (!projectId) return;
    ...
  }, POLL_INTERVAL_MS);
}
```

`startFallbackPolling` captures `projectId` via closure at the time it is called. When `connectToProject` is called for a **different** project (project switch), `disconnectFromProject` is called with `isProjectSwitch = true`, which calls `stopFallbackPolling()` — this is correct. However, the problem is that `startFallbackPolling` is also called inside `onerror`, after the EventSource is closed. If the error fires during a project switch (rare but possible on slow networks), the new polling interval captures the **old** projectId because closure capture happens at call time, not at tick time. The `if (!projectId)` guard checks the parameter, not the module-level `currentProjectId`. This can result in polling continuing against a stale project.

**Fix:** Replace `if (!projectId) return` with `if (!currentProjectId) return` and use `currentProjectId` (module scope) inside the interval callback instead of the closure-captured parameter.

---

### BUG-A7-006
**File:** `src/components/ManualCalibration.tsx:75–80`  
**Severity:** MEDIUM  
**Category:** Missing useEffect dependency / stale closure  

```ts
useEffect(() => {
  if (mode === 'draw-line' && !calibrationMode && calibrationPoints.length === 0) {
    setCalibrationMode(true);
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

This effect intentionally runs only on mount (the comment suppresses the lint warning). The intent is fine, but `setCalibrationMode` is pulled from `useStore` on each render — the version captured at mount time is a stable store action, so the suppression is safe here. However, if the component is hot-reloaded or remounted while `calibrationMode` is already true and `calibrationPoints` is non-empty, the guard condition may fail silently and leave the component in a confused state (showing the draw-line UI without actually being in calibration mode). The intent is sound, but the eslint-disable comment is a maintenance hazard.

**Fix:** If the intent is truly "run once on mount", consider restructuring so the condition is unconditional at mount, or at minimum document why each dep is intentionally omitted.

---

### BUG-A7-007
**File:** `src/lib/store.ts` — `setCalibrationMode` action  
**Severity:** MEDIUM  
**Category:** Zustand store mutation — calling `get()` inside `set()` callback  

```ts
setCalibrationMode: (active) => set({ 
  calibrationMode: active, 
  calibrationPoints: active ? [] : get().calibrationPoints 
}),
```

`set({})` is not a functional update, but it calls `get()` to read `calibrationPoints` in the object literal. If any concurrent state update modifies `calibrationPoints` between the `set()` call being queued and Zustand applying it, the wrong value could be used. This is a subtle race that's unlikely in practice but violates the Zustand pattern.

**Fix:**
```ts
setCalibrationMode: (active) => set((s) => ({ 
  calibrationMode: active, 
  calibrationPoints: active ? [] : s.calibrationPoints,
})),
```

---

### BUG-A7-008
**File:** `src/components/CanvasOverlay.tsx:~175–220` (vertex drag useEffect)  
**Severity:** HIGH  
**Category:** Stale closure / missing dependency  

The vertex drag `useEffect` has this dependency array:
```ts
}, [dragging, toSvgCoords, updatePolygon, allPolygons, classifications, scale, currentPage, baseDims]);
```

`toSvgCoords` itself is `useCallback([baseDims])`, so `baseDims` is doubly represented. More importantly, `handleMove` captures `allPolygons` via the dependency array. When the drag effect re-fires because `allPolygons` changed (e.g., another user on SSE adds a polygon), `window.removeEventListener('mousemove', handleMove)` removes the **old** handler and `window.addEventListener('mousemove', handleMove)` adds the **new** one — this is correct for correctness, but will cause a brief flicker where the user experiences a "skip" in drag position. More critically: if the re-run races with a fast drag gesture (mousemove fires between removeEventListener and addEventListener), a move event can be silently dropped, causing the dragged vertex to jump.

**Fix:** Use a ref to keep `allPolygons` current inside the effect without making it a dependency:
```ts
const allPolygonsRef = useRef(allPolygons);
useEffect(() => { allPolygonsRef.current = allPolygons; }, [allPolygons]);
```
Then make the drag effect depend only on `[dragging]` and read from refs inside.

---

### BUG-A7-009
**File:** `src/components/CanvasOverlay.tsx:~390–410` (floating toolbar position)  
**Severity:** MEDIUM  
**Category:** Canvas ref null guard / runtime crash potential  

```ts
const svgEl = wrapperRef.current?.querySelector('svg');
const svgRect = svgEl?.getBoundingClientRect();
if (!svgRect || baseDims.width === 0) return null;
```

This queries the SVG *child* of `wrapperRef` by DOM traversal. If the SVG hasn't rendered yet (e.g., during a fast selection state transition), `querySelector('svg')` returns `null` and `svgRect` is `undefined`, handled by the guard. However, the guard also computes `scaleX = svgRect.width / baseDims.width` after the null check passes — if `svgRect.width` is `0` (possible during CSS transitions or if the element is display:none), `scaleX` becomes `0` and `screenX = svgRect.left + floatingToolbarPos.centX * 0` places the toolbar at the element's left edge instead of the centroid. The toolbar will appear mispositioned instead of crashing, but it's visually broken.

**Fix:** Add `svgRect.width === 0 || svgRect.height === 0` guard alongside the `baseDims.width === 0` check.

---

### BUG-A7-010
**File:** `src/lib/polygon-utils.ts:splitPolygonByLine:~80`  
**Severity:** HIGH  
**Category:** Scale/coordinate calculation bug — buffer units mismatch  

```ts
const buffered = turf.buffer(line, 0.001, { units: 'meters' });
```

`splitPolygonByLine` operates in **PDF base-coordinate space** (pixel units at 72 DPI). The coordinates passed to `turf.lineString` are raw base-space pixel values (e.g., `x=1400, y=2100`). Turf's `buffer` function treats coordinates as WGS-84 longitude/latitude when `units: 'meters'` is specified. Passing pixel coordinates as if they were geographic coordinates produces completely wrong buffering behavior — the "0.001 meter" buffer around what Turf thinks is a line at lat/lng (1400, 2100) is nonsensical (those are off-globe coordinates). 

This means `splitPolygonByLine` will typically produce `diff === null` or a degenerate result because the buffered line has incorrect geometry relative to the polygon. The `return [polygon, []]` fallback on null silently no-ops the split.

**Fix:** Either use a coordinate system that's WGS-84 compatible (normalize to [0,1] range before calling Turf), or use a non-geographic Turf alternative that accepts pixel coordinates directly (e.g., manually compute line intersection with polygon edges instead of using Turf buffer/difference).

---

### BUG-A7-011
**File:** `src/lib/ws-client.ts:~100–115` (polygon:updated via `store.updatePolygon`)  
**Severity:** MEDIUM  
**Category:** Zustand store mutation bypassing immer / double undo-stack push  

```ts
case 'polygon:updated': {
  const poly = parsed.data as Polygon;
  if (store.polygons.some((p) => p.id === poly.id)) {
    store.updatePolygon(poly.id, poly);  // ← calls the store action
  }
```

`store.updatePolygon` is an action in the Zustand store that **pushes a snapshot onto the undo stack** (`undoStack: pushUndo(s.undoStack, before)`). When an SSE-received update (remote edit from another user) is applied via `store.updatePolygon`, it pollutes the local undo stack with remote changes. The user will then Ctrl+Z through other users' edits, which is incorrect UX. 

The SSE handler should apply remote updates silently (no undo-stack entry) using `useStore.setState((s) => ({ polygons: s.polygons.map(...) }))` directly.

**Fix:** For all SSE-sourced mutations, use direct `useStore.setState(...)` calls instead of calling undo-tracked store actions. Same issue applies to `scale:updated` which calls `store.setScale` (also undo-tracked).

---

### BUG-A7-012
**File:** `src/components/CropOverlay.tsx:30–40`  
**Severity:** MEDIUM  
**Category:** Missing null guard on canvas ref + mouse capture gap  

```ts
const handleMouseMove = useCallback(
  (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCurrentPoint(toBaseCoords(e));
  },
  [isDragging, toBaseCoords],
);
```

If the user drags outside the `CropOverlay` div (which is `position: absolute, inset: 0` and covers the viewport, but could be clipped), `onMouseMove` stops firing — the React synthetic event is attached to the div, not to `window`. The user can "escape" the crop selection by dragging quickly outside the overlay bounds, leaving `isDragging = true` but no `onMouseUp` firing on the div. The overlay will remain stuck in drag mode until the user clicks again.

**Fix:** Attach `mousemove` and `mouseup` to `window` during drag (same pattern as `CanvasOverlay`'s vertex drag), not to the div.

---

### BUG-A7-013
**File:** `src/components/DrawingTool.tsx:handleClick:~115–130`  
**Severity:** MEDIUM  
**Category:** Off-by-one / race condition in polygon closing detection  

```ts
if (clickCls?.type !== 'linear' && currentPoints.length >= 3) {
  ...
  if (Math.hypot(dx, dy) < CLOSE_THRESHOLD_PX) {
    commitPolygon();
    return;
  }
}

// Ignore the second click event in a double-click sequence.
if (e.detail > 1) return;
const nextPoints = [...currentPoints, pt];
setPointsAndRef(nextPoints);
```

The close-on-first-point check runs before the `e.detail > 1` guard. This means: if the user double-clicks near the first vertex (intending to close the polygon via double-click), two events fire in sequence. The first click (`detail=1`) triggers `commitPolygon()` via the proximity check and returns early — this is correct. The second click (`detail=2`) hits the `handleDoubleClick` handler, which calls `commitPolygon()` again on an **empty** `pointsRef.current` (already cleared by the first `commitPolygon`). `commitPolygon` silently exits because `currentPoints.length < minPts`, so no second polygon is added. This is actually safe, but the `handleDoubleClick` → `commitPolygon` call on empty state is an unnecessary no-op that could cause confusion if `commitPolygon` gains side effects.

Low-severity, but worth documenting.

---

### BUG-A7-014
**File:** `src/components/FloorAreaMesh.tsx:~95–100` (geometry disposal)  
**Severity:** CRITICAL  
**Category:** WebGL / Three.js memory leak — geometry not disposed  

```ts
const geometry = useMemo(() => {
  const shape = buildShape(points);
  if (!shape) return null;
  const geo = new ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.01, 0);
  return geo;
}, [points]);
```

`ShapeGeometry` allocates GPU buffers (vertex buffers, index buffers). `useMemo` will recompute when `points` changes, creating a new `ShapeGeometry` — but the **old geometry is never disposed**. Three.js does not automatically garbage-collect GPU resources. Over time (especially during AI takeoff when many polygons are added/updated), this leaks GPU buffer memory and can cause out-of-memory conditions or visual corruption on lower-end hardware.

**Fix:** Return a cleanup function via `useEffect` with `geometry.dispose()`:
```ts
useEffect(() => {
  return () => {
    geometry?.dispose();
  };
}, [geometry]);
```
Or use a `useRef` + manual disposal pattern.

---

### BUG-A7-015
**File:** `src/lib/ai-takeoff.ts:capturePageScreenshot / downscaleCanvasToMax`  
**Severity:** HIGH  
**Category:** Canvas memory leak — offscreen canvas not released  

```ts
function downscaleCanvasToMax(canvas: HTMLCanvasElement, maxEdge = 2048): string {
  ...
  const off = document.createElement('canvas');
  off.width = Math.round(width * scale);
  off.height = Math.round(height * scale);
  const ctx = off.getContext('2d');
  ...
  return off.toDataURL('image/png').replace(...);
}
```

The offscreen canvas `off` is created, drawn into, converted to a data URL, and then abandoned. In Chromium, canvas elements hold a backing GPU texture until garbage collected. On some browsers (especially Safari on iOS/macOS), canvases are not GC'd promptly, particularly 2048×2048 ones. Calling `triggerAITakeoff` multiple times (retries, multi-page takeoffs) can accumulate many unreleased canvas textures.

**Fix:** After extracting the data URL, explicitly destroy the canvas: `off.width = 0; off.height = 0;` (this releases the backing store on most browsers).

---

### BUG-A7-016
**File:** `src/lib/keyboard-handler.ts:useKeyboardHandler`  
**Severity:** LOW  
**Category:** Missing useEffect dependency  

```ts
export function useKeyboardHandler(onShowShortcuts: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      ...
      if (key === '?') {
        event.preventDefault();
        onShowShortcuts();
      }
      ...
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onShowShortcuts]);
}
```

`onKeyDown` also reads from `useStore.getState()` inside the closure, which is correct (fresh state on each invocation). However, the `onShowShortcuts` dependency means the effect re-fires every time the parent re-renders if `onShowShortcuts` is not memoized (via `useCallback`). Each re-fire removes and re-adds the global `keydown` listener. If the parent passes an inline arrow function (common), this will thrash the listener on every render. Not a bug per se, but a performance hazard.

**Recommendation:** Document that `onShowShortcuts` must be a stable reference (wrapped in `useCallback`), or memoize internally.

---

### BUG-A7-017
**File:** `src/components/MarkupTools.tsx` — `activeTool`, `activeColor`, `strokeWidth`  
**Severity:** LOW  
**Category:** Tool state orphaned / not connected to canvas  

`MarkupTools` maintains `activeTool`, `activeColor`, and `strokeWidth` in local component state, but these values are **never passed to or consumed by** any canvas rendering component. The markup tools UI is fully functional as a picker, but the selected tool/color/stroke width have no effect on actual markup drawing. This appears to be a stub/placeholder implementation where the UI was built but the integration with the canvas drawing layer was not completed.

**Severity:** LOW (it's unfinished, not broken — but any user expecting the markup tools to actually draw will be confused).

---

### BUG-A7-018
**File:** `src/components/ManualCalibration.tsx:handleSave — enter-number mode`  
**Severity:** MEDIUM  
**Category:** Scale calculation missing — enter-number mode does not set scale  

```ts
} else {
  const pft = parseFloat(paperFt) || 0;
  const pin = parseFloat(paperIn) || 0;
  const rft = parseFloat(realFt) || 0;
  const rin = parseFloat(realIn) || 0;
  const paperTotal = pft * 12 + pin;
  const realTotal = rft + rin / 12;
  onSave(`${paperTotal}" = ${realTotal.toFixed(1)}'`);
}
```

In `enter-number` mode, `handleSave` computes `paperTotal` and `realTotal` but **never calls `setScale` or `setScaleForPage`**. It only calls `onSave(label)` with a human-readable string. The draw-line mode correctly calls `setScale(cal)` and `setScaleForPage(currentPage, cal)` before `onSave`, but the enter-number mode does neither. The actual scale calibration is never applied to the store when using the "Enter Number" tab — users who set scale this way will find measurements are still calculated with whatever scale was previously set (or none).

**Fix:** Compute `pixelsPerUnit` from the ratio and call `setScale`/`setScaleForPage` in the else branch:
```ts
// paperTotal is in inches on paper, realTotal is in feet real-world
// 72 DPI: 1 paper inch = 72 base pixels
const pixelsPerFoot = (72 * 12 / paperTotal) * (1 / realTotal); // simplified
const cal = { pixelsPerUnit: pixelsPerFoot, unit: 'ft' as const, label: ..., source: 'manual' as const };
setScale(cal);
if (currentPage >= 1) setScaleForPage(currentPage, cal);
clearCalibrationPoints();
onSave(`${paperTotal}" = ${realTotal.toFixed(1)}'`);
```

---

## Notes on What Looks Good

- **DrawingTool.tsx** — The dual-ref pattern (`pointsRef` + `setPointsAndRef`) to prevent stale closures in event handlers is a solid approach. The `cachedRectRef`/ResizeObserver pattern for stable bounding rect reads is well-implemented.
- **CanvasOverlay.tsx** — The `toSvgCoords` comment explaining why pan/zoom offsets are not manually subtracted is correct and valuable.
- **store.ts** — The `hydrateState` deduplication by ID is good defensive programming.
- **snap-utils.ts** — Clean, testable, no memory issues.
- **auto-scale.ts** — Robust regex normalization and candidate sorting logic. The `hasNts()` guard is a nice safety check.
- **ws-client.ts** — Exponential backoff with jitter on reconnect is well-implemented.
- **use-text-search.ts** — Proper AbortController usage for debounced search with cleanup.
- **useRealtimeSync.ts** — `connectedRef` guard prevents reconnecting to the same project correctly.
- **FloorAreaMesh.tsx** — Three.js material setup (depthWrite: false, DoubleSide, emissive on select) is correct for 2D floor overlays.
- **polygon-utils.ts** — Shoelace formula is correctly implemented. The `|| 1e-10` zero-division guard in `pointInPolygon` is a good defensive pattern.

---

## Priority Fix Order

1. **BUG-A7-002** (CRITICAL) — CutTool coordinate space bug; cut always fails silently
2. **BUG-A7-014** (CRITICAL) — Three.js geometry memory leak in FloorAreaMesh
3. **BUG-A7-018** (MEDIUM→functionally CRITICAL) — Enter-number calibration never sets scale
4. **BUG-A7-010** (HIGH) — splitPolygonByLine Turf unit mismatch; split always fails silently  
5. **BUG-A7-011** (HIGH) — SSE remote updates pollute local undo stack
6. **BUG-A7-001** (HIGH) — setScale race condition on undo stack
7. **BUG-A7-003** (HIGH) — Stale store snapshot in SSE message handler
8. **BUG-A7-005** (HIGH) — Fallback polling captures stale projectId closure
9. **BUG-A7-008** (HIGH) — Vertex drag handler re-fires on allPolygons change
10. **BUG-A7-015** (HIGH) — AI takeoff offscreen canvas memory leak
11. **BUG-A7-012** (MEDIUM) — CropOverlay drag escapes div bounds
12. **BUG-A7-007** (MEDIUM) — setCalibrationMode reads get() inside set()
13. **BUG-A7-009** (MEDIUM) — Floating toolbar zero-width SVG positioning
14. **BUG-A7-004** (MEDIUM) — Feature flags module-level cache never refreshes
15. **BUG-A7-006** (MEDIUM) — ManualCalibration mount effect eslint-disable risk
16. **BUG-A7-013** (MEDIUM) — Double-click close calls commitPolygon on empty state
17. **BUG-A7-016** (LOW) — Keyboard handler listener thrash on unstable callback
18. **BUG-A7-017** (LOW) — MarkupTools tool state not wired to canvas
