# Audit Report — A6 Cycle 6
**Sector:** `src/components/`
**Auditor:** Admiral (automated static review)
**Date:** 2026-03-20
**Files reviewed:** All `.tsx` files under `src/components/` (top-level + `admin/`, `dev/`, `settings/`, `ui/` subdirectories)

---

## Bug Index

| ID | File | Line(s) | Severity | Summary |
|----|------|---------|----------|---------|
| BUG-A6-6-001 | MeasurementTool.tsx | 146–149 | HIGH | Measurement label positioned using raw base-coord px values as CSS `left`/`top`, not percentage strings |
| BUG-A6-6-002 | MergeSplitTool.tsx | 40–44 | HIGH | `getCoords` returns raw screen-pixel offsets — not normalized to base PDF coordinates; `pointInPolygon` and split-line SVG both mismatch |
| BUG-A6-6-003 | MergeSplitTool.tsx | 46–52 | HIGH | `findPolygonAt` searches all polygons across all pages — no `currentPage` filter; hit-testing can match polygons on other pages |
| BUG-A6-6-004 | AIActivityLog.tsx | 107–125 | MEDIUM | Module-level `persistedEntries`, `persistedListeners`, and `sseSubscribed` singletons persist across Next.js Hot Module Replacement cycles, causing duplicate SSE subscriptions and stale log entries between page navigations in dev |
| BUG-A6-6-005 | AIImageSearch.tsx | 60–66 | MEDIUM | `useEffect` that auto-triggers `handleCroppedSearch` on `croppedImageBase64` change has `handleCroppedSearch` missing from deps array — runs stale closure if the function identity changes (function is defined inside the component) |
| BUG-A6-6-006 | VersionHistory.tsx | 395 | MEDIUM | `return () => { mounted = false; }` is inside the `async handleApiRestore` function body, not inside a `useEffect` cleanup — the cleanup function is returned to the caller (nothing) and `mounted` flag is never actually flipped to `false`, defeating the unmount guard |
| BUG-A6-6-007 | ExportPanel.tsx | 6–15 | MEDIUM | `xlsx@0.18.x` dependency with known CVEs (CVE-2023-30533 and related prototype-pollution/ReDoS) acknowledged via inline TODO but not yet remediated; `_xlsxModule` is a module-level `any`-typed singleton with no type safety |
| BUG-A6-6-008 | TextSearch.tsx | 24–70 | MEDIUM | `runSearch` always calls `buildStubResults` (hardcoded stub data), never the real PDF text-extraction API — search returns fake results regardless of actual drawing content |
| BUG-A6-6-009 | VersionHistory.tsx | 51–66 | LOW | `generateMockEntries` derives UI history entries from `undoStackLength` instead of real server history — shows invented descriptions ("Added classification Flooring", etc.) when the API fetch fails or before it resolves |
| BUG-A6-6-010 | WallMesh.tsx | 104–124 | LOW | Each `<group>` in the 3D scene contains an `<Html>` label that calls `segments[key]` where `key` is the map index, not the segment index when groups are filtered — safe currently because all segments are mapped, but fragile if nulls are skipped |
| BUG-A6-6-011 | DrawingComparison.tsx | 80–100 | LOW | Diff region overlay `key` prop includes both `region.label` and `i` (`diff-${region.label}-${i}`), making it index-dependent and non-stable; if diff regions reorder, all region DOM nodes are torn down and remounted |
| BUG-A6-6-012 | CanvasOverlay.tsx | 252 | LOW | `eslint-disable-next-line react-hooks/exhaustive-deps` suppresses a legitimate dep warning on the drag `useEffect` — `updatePolygon`, `baseDims` etc. are accessed via refs to avoid re-registration but the suppression comment leaves the intent undocumented and risky for future refactors |
| BUG-A6-6-013 | ManualCalibration.tsx | 56 | LOW | `useEffect(() => { … }, [])` with `eslint-disable-line react-hooks/exhaustive-deps` ignores `mode`, `calibrationMode`, `calibrationPoints`, and `setCalibrationMode` in deps — stale closure risk if any of those values change before mount completes |

---

## Detailed Findings

---

### BUG-A6-6-001
**File:** `MeasurementTool.tsx:146–149`
**Severity:** HIGH
**Description:**
The measurement distance label is positioned with:
```tsx
style={{
  left: midpoint.x,
  top: midpoint.y - 18,
}}
```
`midpoint.x` and `midpoint.y` are base-coordinate values (PDF coordinate space, e.g. 0–1190 for a typical page). When used directly as CSS pixel values they produce wildly incorrect label placement at zoom levels other than the exact scale where 1 base-unit ≈ 1 CSS pixel.

`DrawingTool.tsx` (the reference implementation) correctly converts to percentage strings:
```tsx
left: `${(cursor.x / baseDims.width) * 100}%`,
top:  `${(cursor.y / baseDims.height) * 100}%`,
```
`MeasurementTool` must do the same. The container element (`containerRef`) also needs `baseDims` in scope (it already reads `rawBaseDims` from the store — just use it).

**Impact:** Measurement label renders in the wrong location at any zoom level other than 1:1; at high zoom it is completely off-screen.

---

### BUG-A6-6-002
**File:** `MergeSplitTool.tsx:40–44`
**Severity:** HIGH
**Description:**
```tsx
const getCoords = useCallback((e: React.MouseEvent | MouseEvent): Point => {
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}, []);
```
This returns raw screen-pixel offsets. Every other drawing tool (`DrawingTool`, `CanvasOverlay`, `CutTool`, `MeasurementTool`, `RepeatingGroupTool`, `CropOverlay`) normalizes to base PDF coordinate space:
```tsx
return {
  x: ((e.clientX - rect.left) / rect.width)  * baseDims.width,
  y: ((e.clientY - rect.top)  / rect.height) * baseDims.height,
};
```
Consequences:
1. The split-line SVG preview (`x1={splitPts[0].x}`) is drawn in screen pixels against an SVG whose `viewBox` is in base coordinates — line renders in wrong position.
2. `findPolygonAt` passes screen-pixel `pt` to `pointInPolygon`, which tests against base-coordinate polygon vertices — hit-testing fails at zoom ≠ 100%.
3. The actual split cut passed to `store.splitPolygon` uses wrong coordinates.

**Impact:** Merge and split tools fail to select the correct polygon and produce geometrically incorrect cuts at any zoom level.

---

### BUG-A6-6-003
**File:** `MergeSplitTool.tsx:46–52`
**Severity:** HIGH
**Description:**
```tsx
const findPolygonAt = useCallback((pt: Point) => {
  for (let i = polygons.length - 1; i >= 0; i--) {
    const poly = polygons[i];
    if (pointInPolygon(pt, poly.points)) return poly.id;
  }
  return null;
}, [polygons]);
```
`polygons` is the full store array across all pages. No filter on `poly.pageNumber === currentPage`. `CutTool.tsx` (which also uses `findPolygonAt`) correctly pre-filters: `const pagePolygons = polygons.filter((p) => p.pageNumber === currentPage)`. A click on an empty area of page 3 could match an invisible polygon on page 1 or 2 if coordinates overlap.

**Impact:** Merge/split operations can incorrectly target polygons on off-screen pages.

---

### BUG-A6-6-004
**File:** `AIActivityLog.tsx:107–125`
**Severity:** MEDIUM
**Description:**
Three module-level variables (`persistedEntries`, `persistedListeners`, `sseSubscribed`) are never reset on HMR (Hot Module Replacement) in development, and their lifecycle is undefined in production SSR environments. Specifically:
- `sseSubscribed` is set to `true` on first `ensureSSESubscription()` call and never cleared. On HMR, the old module's SSE handler keeps running while the new module's `ensureSSESubscription` sees `sseSubscribed = false` again (new module scope), creating duplicate listeners.
- `persistedEntries` accumulates across navigations within an SPA session but is never scoped to a project ID — entries from project A appear when switching to project B.

**Impact:** In dev: duplicate log entries after HMR. In production: activity log entries are not scoped to the current project.

---

### BUG-A6-6-005
**File:** `AIImageSearch.tsx:60–66`
**Severity:** MEDIUM
**Description:**
```tsx
useEffect(() => {
  if (croppedImageBase64) {
    handleCroppedSearch(croppedImageBase64);
  }
}, [croppedImageBase64]);
```
`handleCroppedSearch` is defined as a regular `async function` inside the component body but is not included in the `useEffect` dependency array. If the component ever re-renders between `croppedImageBase64` becoming truthy and the effect running (e.g. due to a concurrent state update), `handleCroppedSearch` captured in the closure could be stale. Correct fix: either add `handleCroppedSearch` to deps (and wrap it in `useCallback`) or inline the call.

**Impact:** Low probability in practice due to synchronous component renders, but technically a stale-closure bug that could silently call an outdated version of the search function.

---

### BUG-A6-6-006
**File:** `VersionHistory.tsx:395`
**Severity:** MEDIUM
**Description:**
```tsx
async function handleApiRestore(entry: ApiHistoryEntry) {
  let mounted = true;
  try {
    // … async fetches that check `mounted` …
  } finally {
    if (mounted) setRestoringEntryId(null);
  }
  return () => { mounted = false; };   // ← BUG: returned from async fn, not useEffect
}
```
The cleanup arrow function is returned from the `async function` call site. Nothing calls it — React only calls cleanup functions returned from `useEffect`. So `mounted` is always `true`, and if the user closes the `VersionHistory` panel while a restore is in-flight, `setRestoringEntryId(null)` and `setApiEntries(...)` will still fire on the unmounted component, producing a React "state update on unmounted component" warning and potential null-ref errors.

**Fix:** Replace the `mounted` local variable pattern with a `useRef<boolean>` tracking mount state via a real `useEffect`, or use an `AbortController`.

---

### BUG-A6-6-007
**File:** `ExportPanel.tsx:6–15`
**Severity:** MEDIUM
**Description:**
The `xlsx` library (`@0.18.x`) has known CVE-2023-30533 (prototype pollution via crafted workbook) and related ReDoS issues. An inline comment acknowledges this but marks it only as `TODO: migrate`. The current mitigation (lazy dynamic import, reducing client bundle exposure) does not address the vulnerability itself — malicious `.xlsx` files uploaded through the compare/import flow could still trigger the vulnerability if the same library version is used server-side. Additionally, `_xlsxModule` is typed as `any`, stripping all compile-time safety from XLSX API calls.

**Impact:** If user-supplied `.xlsx` data ever reaches this code path, prototype pollution is possible. The `any` typing also hides future API breakage.

---

### BUG-A6-6-008
**File:** `TextSearch.tsx:24–70` (and `runSearch` at line 72)
**Severity:** MEDIUM
**Description:**
```tsx
const runSearch = useCallback((q: string) => {
  setHasSearched(true);
  setResults(buildStubResults(q));   // ← always stub
  setActiveId(null);
}, []);
```
`buildStubResults` returns a hardcoded set of 8 fixture results (`SCALE: 1/8" = 1' 0"`, `GENERAL NOTES`, etc.) filtered by string match. The real PDF text-extraction endpoint (`/api/…/text-search` or similar) is never called. The `searchAll` state variable is set but never used for anything. There is no API integration at all.

**Impact:** Search returns fake results for every query. Users who rely on text search to navigate drawings receive fabricated page references and coordinates.

---

### BUG-A6-6-009
**File:** `VersionHistory.tsx:51–66`
**Severity:** LOW
**Description:**
`generateMockEntries` creates a fake version history from `undoStackLength` with hardcoded description strings ("Added classification Flooring", "Changed scale to 1/8\"=1'0\"", etc.). These entries are shown in the UI while the real API fetch is loading, and also as a fallback if the fetch fails. The fabricated descriptions do not correspond to actual user actions and could be misleading.

**Impact:** Low data-integrity risk (UI only), but users may be confused by invented history entries that don't match what they actually did.

---

### BUG-A6-6-010
**File:** `WallMesh.tsx:104–124`
**Severity:** LOW
**Description:**
```tsx
meshes.map(({ key, geometry, position, color, opacity }) =>
  geometry ? (
    <group key={key}>
      …
      <Html position={…}>
        <div>…{segments[key]?.height ?? defaultHeight} FT</div>
      </Html>
    </group>
  ) : null
)
```
`key` is the iteration index from the `useMemo` segments map. When a zero-length segment produces `geometry: null` and is skipped with `null`, the `key` value no longer corresponds 1-to-1 with the `segments[]` array index for subsequent rendered entries. If multiple null-geometry segments are skipped, `segments[key]` will reference the wrong segment for the `Html` label, potentially showing the wrong wall height. This is currently masked because the null-segment path sets `geometry: null` without incrementing key differently, but it is a latent index-alignment bug.

**Impact:** Incorrect wall height label shown in 3D view if any degenerate (zero-length) wall segments are present.

---

### BUG-A6-6-011
**File:** `DrawingComparison.tsx:80–100`
**Severity:** LOW
**Description:**
```tsx
diffRegions.map((region, i) => (
  <div key={`diff-${region.label}-${i}`} …>
```
The key includes both `region.label` and the numeric index `i`. If diff regions are reordered (e.g. by severity sort), both parts of the key change for every element, causing React to unmount/remount all region overlays instead of just moving them. This produces unnecessary layout flicker. A stable unique ID on each `DiffRegion` (or just `region.label` if labels are unique) would be correct.

**Impact:** Visual flicker on diff region reorder; no functional data loss.

---

### BUG-A6-6-012
**File:** `CanvasOverlay.tsx:252`
**Severity:** LOW
**Description:**
```tsx
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [dragging, toSvgCoords, updatePolygon, baseDims]);
```
The comment explains the suppression but leaves an implicit contract that `allPolygons`, `classifications`, `scale`, and `currentPage` are accessed via "stable refs." If a future refactor removes or changes the ref pattern without updating this `useEffect`, stale closures will silently appear. The suppression has no automated enforcement.

**Impact:** Maintenance risk; no current bug, but likely to cause a stale-closure regression if the ref pattern is modified.

---

### BUG-A6-6-013
**File:** `ManualCalibration.tsx:56`
**Severity:** LOW
**Description:**
```tsx
useEffect(() => {
  if (mode === 'draw-line' && !calibrationMode && calibrationPoints.length === 0) {
    setCalibrationMode(true);
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```
The comment states "Re-running on every change would fight with the user switching modes", which is a valid design intent — but `mode`, `calibrationMode`, `calibrationPoints`, and `setCalibrationMode` are all missing from deps. If `mode` changes before the component's first paint (e.g. due to concurrent features or SSR hydration), the condition is evaluated against a stale initial value of `mode`. The `eslint-disable` hides this permanently.

**Impact:** Calibration mode may not activate on the first render if `mode` arrives late; low probability but non-zero.

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| HIGH | 3 |
| MEDIUM | 5 |
| LOW | 5 |
| **Total** | **13** |

## Highest-Priority Remediation

1. **BUG-A6-6-001** — Fix `MeasurementTool` label positioning to use `%` strings (same pattern as `DrawingTool`).
2. **BUG-A6-6-002** — Normalize `MergeSplitTool.getCoords` to base PDF coordinate space.
3. **BUG-A6-6-003** — Filter `MergeSplitTool.findPolygonAt` to `currentPage` only.
4. **BUG-A6-6-006** — Fix `VersionHistory.handleApiRestore` mounted guard (use `useRef` + `useEffect`).
5. **BUG-A6-6-008** — Replace `TextSearch` stub with real API integration or clearly gate the feature behind a flag.
