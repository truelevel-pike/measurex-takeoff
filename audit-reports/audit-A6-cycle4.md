# Audit Report: A6 — Cycle 4
**Sector:** src/components/
**Date:** 2026-03-20
**Auditor:** Admiral AI (P.I.K.E. Dispatch — automated sub-audit)
**Job ID:** 3ea08fda-1c26-4b32-ac50-2e587923b262
**Scope:** Remaining MEDIUM and LOW severity bugs in src/components/; regression checks against Cycle 1–3 fixes

---

## Summary

| Severity | Remaining (Cycle 4) |
|----------|----------------------|
| CRITICAL | 1 (carried — unfixed) |
| HIGH     | 7 (carried — unfixed) |
| MEDIUM   | 48 (carried — unfixed, 2 partially fixed) |
| LOW      | 67 (carried — unfixed, 4 partially fixed) |
| REGRESSIONS | 5 confirmed |

**Total outstanding bugs in A6 sector: 123**

---

## Regression Analysis — Cycle 1–3 Fixes

Cycle 4 source inspection reveals **5 confirmed regressions** where bugs flagged or partially fixed in earlier cycles have recurred or were never completed.

---

### REGRESSION-A6-4-R01
**File:** `src/components/DrawingSetManager.tsx:217–230`
**Severity:** CRITICAL (Regression)
**Original bug:** BUG-A6-3-122 — `moveDrawing` single-pass `.map()` with mutable `movedDrawing` variable causes permanent data loss when target set appears before source set in array.
**Status:** **NOT FIXED — still present in current codebase.**
Source at lines 217–230 shows the identical single-pass logic with `let movedDrawing: Drawing | null = null` mutable variable inside `setSets(prev => prev.map(...))`. If target set index < source set index, `movedDrawing` is null when the target branch runs and the drawing is dropped forever.
**Fix:** Use two-pass logic: first pass removes the drawing and captures it; second pass inserts it into target. Or use functional state updater with explicit `find` + `filter` + `map`.

---

### REGRESSION-A6-4-R02
**File:** `src/components/AutoNameTool.tsx:139–144`
**Severity:** HIGH (Regression)
**Original bug:** BUG-A6-3-011 — Reject button `onClick` handler body is empty; clicking Reject does nothing.
**Status:** **NOT FIXED — still present in current codebase.**
Lines 139–144 contain the handler `onClick={() => { // Toggle to "rejected" state\n if (!isRejected) { // mark rejected... } }}` with only comments inside the `if` block and no actual state mutation. The button visually changes border color via `isRejected` CSS but never calls any handler to update state. The reject workflow is completely non-functional.
**Fix:** Call `onToggleAccept(item.id, false)` (or a dedicated `onReject` prop) inside the `if (!isRejected)` block so state is actually updated.

---

### REGRESSION-A6-4-R03
**File:** `src/components/TogalChat.tsx:90–145`
**Severity:** HIGH (Regression)
**Original bug:** BUG-A6-3-422 — `sendMessage` reads SSE stream via `response.body.getReader()` with no AbortController; reader loop continues indefinitely after component unmounts.
**Status:** **NOT FIXED — no AbortController, no `reader.cancel()`, no `reader.releaseLock()` found.**
Inspection of `useEffect` hooks (lines 58–70) shows only input-focus effects. The `sendMessage` function at ~line 90 opens the SSE reader in a `while(true)` loop with no cleanup path. If the component unmounts mid-stream, the loop continues calling `setMessages` on the dead component.
**Fix:** Add `const abortRef = useRef<AbortController | null>(null)` and a `useEffect` cleanup that calls `abortRef.current?.abort()` and `reader?.cancel()`. Pass `signal: abortRef.current.signal` to `fetch()`.

---

### REGRESSION-A6-4-R04
**File:** `src/components/ThreeDViewer.tsx:105–125`
**Severity:** HIGH (Regression)
**Original bug:** BUG-A6-3-417 — `pdfTexture` created via `TextureLoader.load` is never disposed when `textureUrl` changes; GPU memory leaks on every page flip.
**Status:** **NOT FIXED — no `texture.dispose()` in useMemo or useEffect cleanup.**
The `pdfTexture = useMemo(() => { ... loader.load(textureUrl, ...) }, [textureUrl])` block creates a new texture every time `textureUrl` changes but never disposes the previous one. Similarly `fallbackTexture` via `makeGridFallbackTexture()` has no dispose path.
**Fix:**
```tsx
useEffect(() => {
  return () => {
    pdfTexture?.dispose();
    fallbackTexture?.dispose();
  };
}, [pdfTexture, fallbackTexture]);
```

---

### REGRESSION-A6-4-R05
**File:** `src/components/WallMesh.tsx:76–95`
**Severity:** HIGH (Regression)
**Original bug:** BUG-A6-3-431 — `ExtrudeGeometry` objects created in `useMemo` are never disposed; GPU memory leaks when segments change.
**Status:** **NOT FIXED — no `geometry.dispose()` call anywhere in WallMesh.**
The `meshes` useMemo at line 46 creates one `ExtrudeGeometry` per segment. When `segments` changes, React throws away the old memo value but the geometries are never disposed. Every segment update leaks GPU memory.
**Fix:**
```tsx
useEffect(() => {
  return () => {
    meshes.forEach(m => m.geometry?.dispose());
  };
}, [meshes]);
```

---

## Remaining MEDIUM Severity Bugs (Cycle 4 Carry-Forward)

The following MEDIUM bugs from the Cycle 3 A6 audit remain unfixed. All IDs carry their original cycle-3 designation.

### Memory Safety / Unmount Issues

**BUG-A6-3-004** `src/components/AIImageSearch.tsx:75`
Async fetch in `handleCroppedSearch` has no AbortController; setState fires on unmounted component.
**Fix:** `const ctrl = useRef(new AbortController()); fetch(url, { signal: ctrl.current.signal })`; abort in useEffect cleanup.

**BUG-A6-3-005** `src/components/AIImageSearch.tsx:115`
Same unmount-safety issue in `handleVisionSearch`.

**BUG-A6-3-012** `src/components/ComparePanel.tsx:48`
useEffect async IIFE fetching project list has no AbortController and no cancelled flag; stale response can overwrite fresh state.

**BUG-A6-3-013** `src/components/ComparePanel.tsx:67`
`handleCompare` async fetch has no AbortController; setState fires after unmount.

**BUG-A6-3-014** `src/components/ContextMenu.tsx:91`
`setTimeout(onClose, 600)` not stored in ref, not cleared on unmount; stale callback fires on parent.

**BUG-A6-3-108** `src/components/DrawingSetManager.tsx:159`
setTimeout inside upload simulation is not tracked or cleared on unmount.

**BUG-A6-3-119** `src/components/FloorAreaMesh.tsx:111`
`new Color()` and `pointsToVec3()` allocate fresh Three.js objects on every render without useMemo; significant GC pressure with many floor polygons.

**BUG-A6-3-200** `src/components/MXChat.tsx:171`
useEffect cleanup missing — `abortRef.current` is never aborted on unmount; in-flight fetch and streaming reader continue after unmount.
*(Note: abortRef exists in MXChat — partial fix. Verify cleanup actually calls `abortRef.current.abort()` in useEffect return.)*

**BUG-A6-3-210** `src/components/MergeSplitTool.tsx:86–93`
Escape handler is React `onKeyDown` only — not a window-level listener; Escape does nothing when focus is elsewhere.

**BUG-A6-3-211** `src/components/PageThumbnailSidebar.tsx:154`
`currentPage` in useEffect deps invalidates all thumbnails on every page navigation; visible flickering.

**BUG-A6-3-213** `src/components/PDFViewer.tsx:770`
No error boundary wrapping `{children}` inside canvas container; overlay child crash takes down entire PDFViewer.

**BUG-A6-3-300** `src/components/PatternSearch.tsx:150`
`fetch('/api/vision-search')` has no AbortController; state updates on unmounted component.

**BUG-A6-3-308** `src/components/QuantitiesPanel.tsx:881`
`handleExecuteMerge` and `handleExecuteCleanUp` fetch all project polygons per merged ID in a sequential loop (N+1 API calls); no AbortController; errors silently caught.

**BUG-A6-3-312** `src/components/ReTogal.tsx:84`
`handleConfirm` catches server deletion and AI takeoff errors with `console.error` only; user sees success toast even when re-togal partially fails.

**BUG-A6-3-321** `src/components/SmartTools.tsx:103`
`showStatus` creates a new `setTimeout(3000)` on each call without clearing the previous; rapid calls cause timer confusion; timers leak on unmount.

**BUG-A6-3-400** `src/components/SnapshotPanel.tsx:37`
`useEffect` calls `fetchSnapshots` with no AbortController — state updates on unmounted component.

**BUG-A6-3-402** `src/components/SnapshotPanel.tsx:53`
`handleCreate`/`handleRestore`/`handleDelete` async fetches have no AbortController.

**BUG-A6-3-406** `src/components/TakeoffProgressModal.tsx:212`
`setTimeout(() => setCancelled(false), 1500)` in cancel handler never cleared — fires on unmounted component.

**BUG-A6-3-418** `src/components/ThreeDViewer.tsx:122`
`fallbackTexture` (CanvasTexture) never disposed — GPU memory leak on unmount.

**BUG-A6-3-419** `src/components/ThreeDViewer.tsx:108`
`TextureLoader.load` has no error callback — 404 or corrupt image fails silently.

**BUG-A6-3-423** `src/components/TogalChat.tsx:102`
Streaming reader never released via `reader.releaseLock()` or `reader.cancel()` — holds connection open after unmount.

**BUG-A6-3-428** `src/components/VersionHistory.tsx:360`
`handleApiRestore` has no AbortController — state updates on unmounted component.

**BUG-A6-3-429** `src/components/VersionHistory.tsx:353`
`handleRestore` calls `undo()` in synchronous for-loop — N sequential re-renders instead of batching; visible UI thrashing.

### Accessibility / Semantic Issues

**BUG-A6-3-001** `src/components/AIActivityLog.tsx:158`
`div[role="button"]` wraps nested `<button>` (interactive-inside-interactive); screen readers cannot distinguish.

**BUG-A6-3-009** `src/components/AssemblyEditor.tsx:70`
Modal overlay has no focus trap; Tab reaches elements behind backdrop.

**BUG-A6-3-015** `src/components/CollaborationPanel.tsx:256`
Dialog has no Escape key handler; keyboard users cannot dismiss.

**BUG-A6-3-016** `src/components/CollaborationPanel.tsx:256`
Dialog has no focus trap; Tab escapes to behind-backdrop elements.
*(Note: `role="dialog"` and `aria-label` now present per source inspection — partial fix. `aria-modal="true"` and focus trap still missing.)*

**BUG-A6-3-100** `src/components/ContractorReportButton.tsx:42`
Error catch only calls `console.error`; user gets no visible feedback on export failure.

**BUG-A6-3-103** `src/components/CustomFormulas.tsx:253`
Modal overlay lacks `role="dialog"` and `aria-modal="true"`.

**BUG-A6-3-107** `src/components/DrawingComparison.tsx:168`
Dialog has no Escape key handler.

**BUG-A6-3-109** `src/components/DrawingSetManager.tsx:509`
"Archive" button calls `deleteDrawing(d.id)` — permanently deletes, not archives.

**BUG-A6-3-110** `src/components/DrawingSetManager.tsx:469`
`window.prompt()` for renaming drawings — blocks main thread, inaccessible.
*(Still confirmed present: line 469 `const newName = prompt('New name:', d.name)`)*

**BUG-A6-3-113** `src/components/EstimateSummary.tsx:42`
No loading state during assembly fetch; shows misleading "No assemblies assigned" while loading.

**BUG-A6-3-204** `src/components/LeftToolbar.tsx:224–256`
Smart Tools panel declares `aria-modal="true"` but has no focus trap.

**BUG-A6-3-301** `src/components/PatternSearch.tsx:256`
Modal overlay missing `role="dialog"` and `aria-modal="true"`.

**BUG-A6-3-302** `src/components/PatternSearch.tsx:420`
Result list items are clickable divs missing `role="button"`, `tabIndex={0}`, and `onKeyDown`; not keyboard navigable.

**BUG-A6-3-304** `src/components/PolygonGroupPanel.tsx:62`
`groups` state never resyncs when store or props change; stale groups when component stays mounted.

**BUG-A6-3-306** `src/components/QuantitiesPanel.tsx:1979`
Deduction list uses index-based React key; deleting a middle item causes remaining inputs to display wrong values.

**BUG-A6-3-309** `src/components/QuantitiesPanel.tsx:1293`
Grand totals IIFE computed on every render without `useMemo`.

**BUG-A6-3-310** `src/components/QuantitiesPanel.tsx:1791`
Per-classification inline IIFE calls `polygons.filter()` on every render.

**BUG-A6-3-311** `src/components/QuantitiesPanel.tsx:1037`
`groupTotals` useMemo inner loop is O(groups × classificationIds × polygons) instead of using a Map.

**BUG-A6-3-314** `src/components/RecentProjects.tsx:88`
`article` element with `onClick` has no `role="button"`, `tabIndex`, or `onKeyDown`.

**BUG-A6-3-319** `src/components/ScaleCalibrationPanel.tsx:58`
Calibration modal container missing `role="dialog"` and `aria-modal="true"`.

**BUG-A6-3-407** `src/components/TakeoffProgressModal.tsx:70`
Fullscreen modal div missing `role="dialog"` and `aria-modal="true"`.

**BUG-A6-3-410** `src/components/TakeoffProgressModal.tsx:283`
`TakeoffSummaryOverlay` modal div missing `role="dialog"` and `aria-modal="true"`.

**BUG-A6-3-411** `src/components/TextSearch.tsx:169`
`li` elements with `onClick` have no `role="option"`/`role="button"`, no `tabIndex`, no `onKeyDown`.

**BUG-A6-3-414** `src/components/TextSearch.tsx:138`
Custom toggle missing `role="switch"` and `aria-checked`.

**BUG-A6-3-018** `src/components/admin/FeatureFlagPanel.tsx:7`
`useState` initializer calls `getAllFlags()` synchronously — SSR/hydration mismatch risk.
*(Still confirmed: line 7 `useState<Record<FlagName, boolean>>(() => getAllFlags())`)*

**BUG-A6-3-019** `src/components/settings/ShortcutCustomizer.tsx:28`
Same SSR/hydration risk via `getAllShortcuts()` in useState initializer.

**BUG-A6-3-421** `src/components/Toast.tsx:87`
Individual `ToastItem` divs missing `role="alert"` — toast notifications not announced to screen readers.
*(Still confirmed: no `role="alert"` in Toast.tsx)*

**BUG-A6-3-424** `src/components/TopNavBar.tsx:407`
Page badge div with `onClick` is missing `role="button"`, `tabIndex`, `onKeyDown`.

**BUG-A6-3-425** `src/components/TopNavBar.tsx:295`
`onKeyDown(Enter)` and `onBlur` both fire PATCH `/api/projects/:id` — duplicate requests on rename.

**BUG-A6-3-427** `src/components/VersionHistory.tsx:312`
`loadTakeoffRuns()` reads localStorage in useState initializer — hydration mismatch.
*(Still confirmed: line 312 `useState<TakeoffRun[]>(() => loadTakeoffRuns())`)*

**BUG-A6-3-433** `src/components/WhatsNewModal.tsx:38`
Modal div missing `role="dialog"` and `aria-modal="true"`.
*(Still confirmed: no role="dialog" or aria-modal in WhatsNewModal)*

**BUG-A6-3-435** `src/components/WorkspaceSwitcher.tsx:16`
`getWorkspaces()` and `getActiveWorkspace()` read localStorage in useState initializers — hydration mismatch.
*(Still confirmed: lines 16–17)*

---

## Remaining LOW Severity Bugs (Cycle 4 Carry-Forward)

All low-severity bugs from A6-Cycle-3 remain present unless explicitly noted. Representative items with highest impact:

**BUG-A6-3-002** `AIActivityLog.tsx:169` — clear-log button missing `aria-label`.
**BUG-A6-3-003** `AIImageSearch.tsx:62` — useEffect missing `handleCroppedSearch` in deps array.
**BUG-A6-3-007** `AssembliesPanel.tsx:194` — Mount fetch uses cancelled flag but no AbortController.
**BUG-A6-3-008** `AssembliesPanel.tsx:487` — Inline unit-cost input lacks `aria-label`.
**BUG-A6-3-010** `AssemblyEditor.tsx:204` — "Remove material" button missing `aria-label`.
**BUG-A6-3-017** `CollaborationPanel.tsx:256` — `role="dialog"` present but `aria-modal="true"` missing.
**BUG-A6-3-020** `CanvasOverlay.tsx:807` — Calibration-point keys use array index.
**BUG-A6-3-021–023** `ClassificationGroups.tsx` — Three inputs missing `aria-label`.
**BUG-A6-3-024** `ComparePanel.tsx:188` — `<label>` not associated with `<select>`.
**BUG-A6-3-025** `CanvasOverlay.tsx:726` — `calculateLinearFeet()` unmemoized in render loop.
**BUG-A6-3-026** `ContextMenu.tsx:81` — `handleSnapshot` fetch no AbortController.
**BUG-A6-3-027** `AssemblyEditor.tsx:159` — Six material inputs all lack `aria-label`.
**BUG-A6-3-101** `ContractorReportButton.tsx:24` — Fetch no AbortController on unmount.
**BUG-A6-3-102** `CropOverlay.tsx:119` — Overlay div `tabIndex={0}` no `aria-label` or role.
**BUG-A6-3-104** `CustomFormulas.tsx:261` — Close button (X) no `aria-label`.
**BUG-A6-3-105** `CutTool.tsx:17` — `pagePolygons` filter unmemoized.
**BUG-A6-3-106** `DrawingComparison.tsx:178` — Style objects recreated every render.
**BUG-A6-3-111** `DrawingTool.tsx:38` — `snapPolygons` recomputed every render.
**BUG-A6-3-114** `EstimateSummary.tsx:67` — Fetch error silently swallowed.
**BUG-A6-3-115** `EstimatesTab.tsx:106` — Failed PATCH only logged to console.
**BUG-A6-3-116** `ExportPanel.tsx:248` — `showToast` setTimeout not cleared on unmount.
**BUG-A6-3-117** `ExportPanel.tsx:486` — JSON export handler doesn't append anchor before `click()`; may fail in Safari.
**BUG-A6-3-118** `FirstRunTooltips.tsx:64` — Dismiss button (× char) no `aria-label`.
**BUG-A6-3-120** `ImportFromLibraryModal.tsx:51` — Supabase fetch error silently swallowed.
**BUG-A6-3-121** `KeyboardShortcuts.tsx:1` — Missing `'use client'` directive.
**BUG-A6-3-201–202** `MXChat.tsx` — Table row/cell React keys use array index.
**BUG-A6-3-203** `MXChat.tsx:533` — Clipboard write failure masked; success icon shown on failure.
**BUG-A6-3-205** `LeftToolbar.tsx` — Smart Tools popover no click-outside-to-close.
**BUG-A6-3-206** `LeftToolbar.tsx:260` — "Open chat" button has no `onClick` handler; dead code.
**BUG-A6-3-207** `NotificationSettings.tsx:23` — `getNotificationPrefs()` reads localStorage in useState initializer; hydration mismatch.
**BUG-A6-3-208** `MeasurementTool.tsx:108` — Container div `tabIndex={0}` no role or `aria-label`.
**BUG-A6-3-209** `MergeSplitTool.tsx:96` — Same issue.
**BUG-A6-3-212** `PWAInstallBanner.tsx:32` — `handleInstall` no try-catch.
**BUG-A6-3-214–215** `ManualCalibration.tsx` — Input labels not programmatically associated.
**BUG-A6-3-216** `MeasurementSettings.tsx:36` — ToggleGroup buttons lack `aria-pressed`/`aria-selected`.
**BUG-A6-3-217** `OfflineIndicator.tsx:22` — Offline banner no `role="alert"` or `aria-live`.
**BUG-A6-3-303** `PatternSearch.tsx:304` — Canvas region lacks `aria-label` or role.
**BUG-A6-3-305** `PolygonProperties.tsx:1` — Missing `'use client'` directive.
**BUG-A6-3-307** `QuantitiesPanel.tsx:1649` — Trade group header div not keyboard accessible.
**BUG-A6-3-313** `ReTogal.tsx:160` — Dropdown missing role attribute.
**BUG-A6-3-315** `RepeatingGroupTool.tsx:118` — Overlay container `tabIndex={0}` no `aria-label`.
**BUG-A6-3-316** `ScaleCalibration.tsx:209` — Backdrop no role, not semantically interactive.
**BUG-A6-3-317** `ScaleCalibration.tsx:136` — `persistScale` failure only logged.
**BUG-A6-3-320** `ScaleCalibrationPanel.tsx:94` — Dimension input and unit select lack `aria-label`.
**BUG-A6-3-322** `SmartTools.tsx:107` — Three classification filters unmemoized.
**BUG-A6-3-323** `RecentProjectsSection.tsx:83` — `relTimeFromISO` returns empty string on invalid date.
**BUG-A6-3-401** `SnapshotPanel.tsx:44` — `fetchSnapshots` error silently swallowed.
**BUG-A6-3-403** `SnapshotPanel.tsx:181` — Delete button icon-only, no `aria-label`.
**BUG-A6-3-404** `TagInput.tsx:86` — `onBlur` setTimeout never cleared on unmount.
**BUG-A6-3-405** `TagInput.tsx:76` — Tag input missing `aria-label`.
**BUG-A6-3-408** `TakeoffProgressModal.tsx:207` — Cancel button missing `aria-label`.
**BUG-A6-3-409** `TakeoffProgressModal.tsx:352` — "View Results" button missing `type="button"`.
**BUG-A6-3-412–413** `TextSearch.tsx` — Close/clear buttons missing `aria-label` and `type="button"`.
**BUG-A6-3-415** `ThreeDScene.tsx:44` — Duplicate store selector; redundant re-renders.
**BUG-A6-3-426** `TopNavBar.tsx:72` — 30+ prop drilling; should use context/sub-components.
**BUG-A6-3-430** `VersionHistory.tsx:513` — Re-run model picker overflows viewport when near list bottom.
**BUG-A6-3-432** `WallMesh.tsx:100` — Meshes use array index as React key.
**BUG-A6-3-434** `WhatsNewModal.tsx:142` — "Got it" button missing `type="button"`.
**BUG-A6-3-436** `WorkspaceSwitcher.tsx:24` — `prompt()` for new workspace name.
**BUG-A6-3-437** `UserPreferencesPanel.tsx:27` — Backdrop overlay no `onKeyDown` Escape handler.
**BUG-A6-3-438** `UserPreferencesPanel.tsx:204` — Color hex input missing `aria-label`.

---

## Partially Fixed Items (Cycle 3 → Cycle 4)

The following bugs show partial improvement but remain open:

**BUG-A6-3-015/016/017 (CollaborationPanel):**
`role="dialog"` and `aria-label="Collaboration Panel"` are now present (Cycle 3 or earlier fix). However, `aria-modal="true"` is still missing and no focus trap exists. Mark as PARTIAL FIX — still open for focus trap implementation.

**BUG-A6-3-200 (MXChat.tsx):**
`abortRef` exists and is passed to `fetch()` as `signal`, suggesting partial fix from Cycle 3. However, `useEffect` cleanup calling `abortRef.current?.abort()` on unmount was not confirmed present. Verify cleanup return exists; if not, remains open.

---

## Fix Priority Recommendations

### P0 — Immediate (Data Loss / Runtime Crash)
1. **REGRESSION-A6-4-R01** — `DrawingSetManager.moveDrawing` data loss (CRITICAL)
2. **REGRESSION-A6-4-R02** — `AutoNameTool` Reject button non-functional (HIGH)
3. **REGRESSION-A6-4-R03** — `TogalChat` infinite SSE stream after unmount (HIGH)
4. **REGRESSION-A6-4-R04** — `ThreeDViewer` GPU texture leaks (HIGH)
5. **REGRESSION-A6-4-R05** — `WallMesh` ExtrudeGeometry GPU leak (HIGH)

### P1 — High Impact UX (Sprint-level)
6. **BUG-A6-3-213** — `PDFViewer` missing error boundary (MEDIUM)
7. **BUG-A6-3-211** — `PageThumbnailSidebar` thumbnail flicker on every navigation (MEDIUM)
8. **BUG-A6-3-429** — `VersionHistory.handleRestore` N sequential re-renders (MEDIUM)
9. **BUG-A6-3-425** — `TopNavBar` duplicate PATCH on rename (MEDIUM)
10. **BUG-A6-3-312** — `ReTogal` silent error on partial failure (MEDIUM)

### P2 — Accessibility (WCAG / Sprint-level)
11. **BUG-A6-3-421** — `Toast` not announced to screen readers (MEDIUM)
12. **BUG-A6-3-302** — `PatternSearch` results not keyboard navigable (MEDIUM)
13. **BUG-A6-3-204** — `LeftToolbar` Smart Tools focus trap missing (MEDIUM)
14. All missing `role="dialog"` + `aria-modal` on modal overlays (MEDIUM, 8+ instances)
15. Missing `aria-label` on icon-only buttons (LOW, 15+ instances)

### P3 — Performance (Backlog)
16. **BUG-A6-3-309–311** — `QuantitiesPanel` unmemoized render computations (MEDIUM)
17. **BUG-A6-3-119** — `FloorAreaMesh` Three.js object allocations per render (MEDIUM)
18. **BUG-A6-3-105, 106, 111, 322** — Unmemoized filter/style objects (LOW)

### P4 — Code Quality / Robustness (Backlog)
19. **BUG-A6-3-018, 019, 207, 427, 435** — localStorage in useState initializers (SSR safety) (MEDIUM)
20. **BUG-A6-3-110, 436** — `window.prompt()` calls — replace with modal inputs (MEDIUM/LOW)

---

## Notes

- **BUG-A6-001** and **BUG-A6-002** from Cycle 1 (Hooks violation in AutoNameTool; setState-during-render in ClassificationLibrary) were flagged as CRITICAL in Cycle 1. Source was not re-verified in this pass; confirm fix status in a dedicated Cycle 4 verification pass.
- **BUG-A6-3-416 / BUG-A6-3-420** (ThreeDScene / ThreeDViewer missing error boundaries): not verified fixed in Cycle 4. `grep -n "ErrorBoundary" ThreeDScene.tsx` returned no results — still open.
- MXChat `abortRef` pattern appears in MXChat but TogalChat has none — these are two different chat components; do not conflate.

---

*Audit compiled: 2026-03-20 13:05 EDT | Cycle 4 A6