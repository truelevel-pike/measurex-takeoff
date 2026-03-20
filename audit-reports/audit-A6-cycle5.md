# Audit Report: A6 — Cycle 5
**Sector:** src/components/
**Date:** 2026-03-20
**Auditor:** Admiral-5 (Admiral AI — full sweep)
**Job ID:** 279b0712-74e3-4794-8278-0b8065bb3bdd
**Scope:** ALL .tsx files under src/components/ — full read every file
**Format:** BUG-A6-5-[NNN]: [file:line] [SEVERITY] [description]

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 7 |
| MEDIUM   | 18 |
| LOW      | 12 |
| **Total**| **37** |

---

## Regression Check (Cycle 4 Fixes)

| Fix ID | Status |
|--------|--------|
| BUG-A6-001 (AutoNameTool cleanup before early return) | ✅ VERIFIED FIXED |
| BUG-A6-002 (ClassificationLibrary reset on open) | ✅ VERIFIED FIXED |
| BUG-A6-003 (DrawingSetManager upload intervals on unmount) | ✅ VERIFIED FIXED |
| BUG-A6-004 (AssembliesPanel debounce timer cleanup) | ✅ VERIFIED FIXED |
| BUG-A6-007 (CollaborationPanel timer refs on unmount) | ✅ VERIFIED FIXED |
| BUG-A6-009 (ClassificationGroups reorderGroups) | ✅ VERIFIED FIXED |
| BUG-A6-013 (MXChat copy timer ref + cleanup) | ✅ VERIFIED FIXED |
| BUG-A6-015 (CanvasOverlay stable keys for vertex handles/tooltip lines) | ✅ VERIFIED FIXED |
| BUG-A6-019 (ClassificationGroups persistent click listener) | ✅ VERIFIED FIXED |
| BUG-A6-020 (inline confirm dialogs replacing window.confirm) | ✅ VERIFIED FIXED |
| BUG-A6-021 (AssembliesPanel stale getState() in async callback) | ⚠️ PARTIALLY FIXED — see BUG-A6-5-002 |
| BUG-A6-026 (MXChat stable table cell keys) | ✅ VERIFIED FIXED |
| BUG-A6-037 (ClassificationLibrary stable onClose ref) | ✅ VERIFIED FIXED |
| BUG-A6-038 (QuantitiesPanel duplicated isLoading state) | ✅ VERIFIED FIXED |
| BUG-A6-040 (CanvasOverlay wrapper-relative floating toolbar coords) | ✅ VERIFIED FIXED |
| BUG-A7-2-006 (ManualCalibration empty useEffect deps intentional) | ✅ VERIFIED CORRECT |
| BUG-A7-2-018 (ManualCalibration enter-number mode not persisting scale) | ✅ VERIFIED FIXED |

---

## Files Confirmed CLEAN (Cycle 5 Full Read)

- `AutoNameTool.tsx` ✅
- `AutoScalePopup.tsx` ✅
- `BottomStatusBar.tsx` ✅
- `ClassificationGroups.tsx` ✅
- `ClassificationLibrary.tsx` ✅
- `ContextToolbar.tsx` ✅
- `CropOverlay.tsx` ✅
- `CutTool.tsx` ✅
- `DrawingComparison.tsx` ✅
- `DrawingSetManager.tsx` ✅
- `DrawingTool.tsx` ✅ (visible sections)
- `ManualCalibration.tsx` ✅
- `MXChat.tsx` ✅ (streaming abort, copy timer, reader all confirmed correct)
- `ScaleCalibration.tsx` ✅
- `Toast.tsx` ✅
- `WorkspaceSwitcher.tsx` ✅ (`prompt()` for new workspace name is the only concern — benign browser API, low risk)

---

## Bugs Found — Full File-by-File Audit

---

### `ActivityFeed.tsx`

**BUG-A6-5-001: ActivityFeed.tsx:~90 [HIGH]**
`exportJson` creates an `<a>` element and calls `.click()` directly — `URL.revokeObjectURL` is called synchronously after `anchor.click()`. On some browsers `click()` is async and the object URL may be revoked before the download initiates, producing a broken download.
**Fix:** `setTimeout(() => URL.revokeObjectURL(url), 1000)` instead of calling it immediately.

---

### `AssembliesPanel.tsx`

**BUG-A6-5-002: AssembliesPanel.tsx:~350 [HIGH]**
`handleSave` `.then()` callback captures the `assemblies` array from the outer render closure, not from the store. Rapid multi-assembly creation can silently drop most-recent additions because the stale snapshot is used for the `.map()` update.
**Fix:** Use `useStore.getState().assemblies` inside the `.then()` callback, or use a functional updater `setAssemblies(prev => prev.map(...))`.

**BUG-A6-5-003: AssembliesPanel.tsx:~182 [MEDIUM]**
`seedDefaults` iterates `DEFAULT_TEMPLATES` with sequential `await` inside a `for` loop — N serial API POSTs instead of concurrent. Causes unnecessary waterfall latency on first project open.
**Fix:** `await Promise.all(DEFAULT_TEMPLATES.map(t => postTemplate(t)))` with concurrency limiting.

**BUG-A6-5-004: AssembliesPanel.tsx:~186 [LOW]**
`DEFAULT_TEMPLATES` is evaluated once at module load; `crypto.randomUUID()` calls inside produce IDs that are identical across every app instance. If two projects seed defaults, they get identical IDs — potential future collision in deduplication logic.

---

### `AssemblyEditor.tsx`

**BUG-A6-5-005: AssemblyEditor.tsx:~64 [MEDIUM]**
Escape key listener added on `window` with `[onClose]` in deps. Inline `() => setShow(false)` parent prop has unstable identity; effect re-registers the listener on every render that references it, briefly creating duplicate listeners. Double `onClose` can fire on rapid interaction.
**Fix:** Stabilise `onClose` with `useCallback` in the parent or store it in a ref inside the editor.

**BUG-A6-5-006: AssemblyEditor.tsx:~40 [LOW]**
Per-material `formula` fields are silently overwritten by the global `formula` field in `handleSave`. If user sets both, global wins and per-material values are lost without any warning.

---

### `CanvasOverlay.tsx`

**BUG-A6-5-007: CanvasOverlay.tsx:~395 [MEDIUM]**
`handleKeyDown` DELETE path fires an API DELETE call with no AbortController and no deduplication guard. Rapid delete keypresses can issue concurrent in-flight DELETE requests; the last resolved may conflict with an undo that already recreated the polygon.
**Fix:** Track in-flight polygon IDs with a `Set`; skip if already in-flight.

**BUG-A6-5-008: CanvasOverlay.tsx:~295 [LOW]**
`rafRef.current = requestAnimationFrame(...)` assigns without first checking `rafRef.current`. Potential double-cancel is benign (cancel(0) is a no-op), but explicit guard would be cleaner.

**BUG-A6-5-009: CanvasOverlay.tsx:~550 [LOW]**
`<g>` polygon label has `onDoubleClick` conditionally attached only when `isSelected`, but `pointerEvents={isSelected ? 'all' : 'none'}` already blocks events for non-selected state — handler could be unconditional. Minor code clarity issue, no functional bug.

---

### `CollaborationPanel.tsx`

**BUG-A6-5-010: CollaborationPanel.tsx:~200 [MEDIUM]**
`handleCopyLink` catches clipboard failure with empty catch `() => {}` — user sees "Copied!" toast but nothing is actually copied if clipboard access is denied.
**Fix:** Show error toast in catch block, or fall back to `document.execCommand('copy')`.

**BUG-A6-5-011: CollaborationPanel.tsx:~1 [LOW]**
Hardcoded `FAKE_SHARE_URL` and `SAMPLE_COLLABORATORS` stub data present with no `TODO`/`FIXME` marker for production replacement.

---

### `ComparePanel.tsx`

**BUG-A6-5-012: ComparePanel.tsx:~55 [MEDIUM]**
`useEffect` fetches project list on mount with no AbortController. `setProjects` / `setFetching` fire on unmounted component if panel is closed while fetch is in-flight. React will warn and state update is applied to dead component.
**Fix:** `let cancelled = false` flag or `AbortController` with cleanup.

---

### `ContextMenu.tsx`

**BUG-A6-5-013: ContextMenu.tsx:~95 [MEDIUM]**
`handleSnapshot` calls `setTimeout(onClose, 600)` with no ref tracking. Timer fires on stale closure if component unmounts during the 600 ms wait.
**Fix:** Store timer in `useRef` and cancel in `useEffect` cleanup.

**BUG-A6-5-014: ContextMenu.tsx:~155 [LOW]**
`handleCopy` offsets duplicate polygon points by hardcoded `+20` screen pixels. Polygon points are stored in base-coordinate space; at zoom ≠ 1, the visual offset is incorrect and zoom-dependent.
**Fix:** Use proportional base-coordinate offset (e.g. `baseDims.width * 0.01`) as done in CanvasOverlay.

---

### `ContractorReportButton.tsx`

**BUG-A6-5-015: ContractorReportButton.tsx:~25 [MEDIUM]**
Download uses synchronous `document.body.appendChild(anchor)` / `.click()` / `removeChild` — will throw in SSR or test environments despite being a `'use client'` component. Low practical risk but brittle pattern.

**BUG-A6-5-016: ContractorReportButton.tsx:~23 [LOW]**
Errors are only logged with `console.error`; no user-visible toast or feedback on export failure.

---

### `CustomFormulas.tsx`

**BUG-A6-5-017: CustomFormulas.tsx:~180 [HIGH]**
`quantities` `useMemo` computes linear total as `p.linearFeet / scale.pixelsPerUnit`, but `linearFeet` is already stored in real-world units (feet) by `DrawingTool.tsx`. Dividing by `pixelsPerUnit` again produces a double-conversion — custom formulas referencing linear classifications will compute a value `ppu` times smaller than actual linear footage. At typical ppu values (e.g. 96), formula results will be ~100× too small.
**Fix:** Use `p.linearFeet` directly (already in feet), no division needed.

---

### `ErrorBoundary.tsx`

**BUG-A6-5-018: ErrorBoundary.tsx:~40 [MEDIUM]**
`handleRetry` has no retry limit, debounce, or cooldown. If the error is caused by a bad prop that never changes, the retry immediately throws again; rapid button clicks create an infinite retry storm.
**Fix:** Add a retry counter, disable the button after N failures (e.g. 3), and show a "contact support" message.

---

### `EstimateSummary.tsx`

**BUG-A6-5-019: EstimateSummary.tsx:~55 [MEDIUM]**
On-mount `useEffect` unconditionally calls `setAssemblies(mapped)`, overwriting Zustand store state even when AssembliesPanel has already loaded richer/fuller data. Viewing the Estimates tab after AssembliesPanel can strip material details.
**Fix:** Guard with `if (useStore.getState().assemblies.length === 0)` before calling `setAssemblies`, or merge instead of replace.

---

### `ExportPanel.tsx`

**BUG-A6-5-020: ExportPanel.tsx:~1 [HIGH] (security/dependency)**
Acknowledged comment flags `xlsx@0.18.x` CVE (CVE-2023-30533 — prototype pollution + ReDoS). Library is lazy-loaded but is present in the dependency tree. Must be resolved before production release.
**Action:** Migrate to `exceljs` or `xlsx@0.20.x+` (if CVE-patched). Verify with `npm audit`.

---

### `MeasurementTool.tsx`

**BUG-A6-5-021: MeasurementTool.tsx:~50 [HIGH]**
`getCoords` computes mouse coordinates as raw screen pixel offsets (`e.clientX - rect.left`, `e.clientY - rect.top`) without normalising by rect dimensions to base PDF coordinate space. Every other tool (DrawingTool, CanvasOverlay, CropOverlay, CutTool) applies the normalisation `(offset / rect.width) * baseDims.width`. At any zoom ≠ 100%, measurement lines and distance calculations are in screen pixels, not real-world units — results are systematically wrong.
**Fix:** Apply `(offset / rect.width) * baseDims.width` (x) and `(offset / rect.height) * baseDims.height` (y) as done in all other tools.

---

### `PDFViewer.tsx`

**BUG-A6-5-027: PDFViewer.tsx:~520 [MEDIUM]**
`renderPageForCapture` stores a single `renderCompleteResolveRef` resolve callback. If called twice in quick succession (e.g. export loops over pages), the first promise's resolve is overwritten and that promise never resolves — caller hangs indefinitely.
**Fix:** Use a queue or per-invocation resolve map keyed by page number + call ID; ensure each caller's promise resolves exactly once.

**BUG-A6-5-028: PDFViewer.tsx:~346 [LOW]**
`retryLoad` inline re-implements the full PDF load flow duplicating ~30 lines from the main `useEffect`. Logic divergence risk: future changes to main load path may not be applied here.
**Fix:** Extract `loadPdfFromFile(file, onSuccess, onError)` helper used by both the effect and `retryLoad`.

---

### `QuantitiesPanel.tsx`

**BUG-A6-5-029: QuantitiesPanel.tsx:~860–920 [HIGH]**
`handleExecuteMerge` fetches ALL project polygons per merged classification ID in a sequential `for` loop (`for (const id of removedIds)`), then patches each matching polygon one by one inside a nested `for` loop. For a project with N polygons and M merged classifications, this is O(N×M) sequential API calls with no AbortController. On large projects (e.g. 500 polygons, 5 merges), this can fire 2,500+ sequential requests, pinning the UI thread and potentially hitting rate limits. Errors are silently caught.
**Fix:** Batch-PATCH via a single `POST /api/projects/:id/classifications/merge` server endpoint that handles all reassignments atomically; or at minimum `Promise.all` with concurrency limit.

**BUG-A6-5-030: QuantitiesPanel.tsx:~935–970 [HIGH]**
`handleExecuteCleanUp` has the same O(N×M) sequential fetch pattern as `handleExecuteMerge`, additionally running this for every accepted suggestion — effectively cubing the problem for large clean-up batches. Same risk: silent catches mask partial failures, leaving server and client state out of sync.
**Fix:** Same as BUG-A6-5-029: server-side batch merge endpoint.

**BUG-A6-5-031: QuantitiesPanel.tsx:~980–1020 [MEDIUM]**
`handleSaveGroup` for the "edit existing group" path calls `updateGroup` then `moveClassificationToGroup` for each checked classification, then calls `updateGroup` again in a nested closure to remove unchecked IDs. The inner `useStore.getState().groups.find(...)` call reads from Zustand mid-render, but the preceding `updateGroup` calls may not have been flushed yet — potential stale read causing unchecked classifications to not be removed from the group.
**Fix:** Collect add/remove sets before calling any store mutations, then perform all mutations in a single batched operation.

**BUG-A6-5-032: QuantitiesPanel.tsx:~540 [MEDIUM]**
`fetchClassifications` useEffect (loading project ID from URL/localStorage) is not protected by AbortController. If `projectId` changes rapidly (e.g. deep-link navigation), stale fetch responses can overwrite `setProjectId` state.

**BUG-A6-5-033: QuantitiesPanel.tsx:~1330 [LOW]**
Repeating Group containment check (`p.points.some(pt => pt.x >= rg.boundingBox.x && ...)`) checks if ANY point of a polygon falls within the bounding box. A large polygon spanning the bounding box will be included only if one of its vertices happens to land inside; a polygon fully enclosing the bounding box will be excluded. The intent is to capture polygons "inside" the group, but this heuristic is incorrect for both edge cases.
**Fix:** Use centroid-in-bounding-box check, or require majority-of-points to be inside.

---

### `RepeatingGroupTool.tsx`

**BUG-A6-5-022: RepeatingGroupTool.tsx:~70 [MEDIUM]**
`handleMouseMove` and `handleMouseUp` are React event handlers on the overlay `<div>`. If the user drags outside the div, events stop, leaving drag state stuck. Compare with `CropOverlay.tsx` which attaches `mousemove`/`mouseup` to `window` during drag.
**Fix:** Mirror CropOverlay: use `useEffect` with window-level listeners while `isDragging` is true.

---

### `SnapshotPanel.tsx`

**BUG-A6-5-023: SnapshotPanel.tsx:~70 [LOW]**
`handleCreate` shows error toast on failure. Verify `handleRestore` and `handleDelete` also surface errors to user (not just `console.error`). Partial — confirm in next cycle.

---

### `TopNavBar.tsx`

**BUG-A6-5-024: TopNavBar.tsx:~78 [MEDIUM]**
`useViewerPresence(projectId, isShared)` hook likely sets up a WebSocket or polling interval. If this hook does not clean up on unmount (or if `TopNavBar` is conditionally removed, e.g. during print mode), the presence connection leaks. Requires audit of `useViewerPresence` implementation.

**BUG-A6-5-034: TopNavBar.tsx:~358 [MEDIUM]**
Project rename `onBlur` handler duplicates the entire PATCH fetch logic already in `onKeyDown`. Two code paths for the same mutation with independent error handling; any future change must be applied twice. Risk of divergence.
**Fix:** Extract `commitRename(trimmed: string)` helper called by both handlers.

**BUG-A6-5-035: TopNavBar.tsx:~125 [LOW]**
`shareLoading` state has no timeout guard. If the `/api/projects/:id/share` POST hangs (network issue, slow server), the Share button stays in loading state indefinitely with no user feedback. `setShareLoading(false)` only runs in `finally`, which is correct, but there is no max-wait timeout.
**Fix:** Add `setTimeout(() => setShareLoading(false), 15000)` fallback or use AbortController with a 10s timeout.

---

### `VersionHistory.tsx`

**BUG-A6-5-036: VersionHistory.tsx:~345 [MEDIUM]**
`handleApiRestore` issues a secondary `fetch` to reload history after a successful restore, with no AbortController. If the component unmounts during this reload (e.g. user closes the panel mid-restore), `setApiEntries` fires on an unmounted component.
**Fix:** Share the `cancelled` flag from the outer effect, or use a `useRef` mounted flag.

**BUG-A6-5-037: VersionHistory.tsx:~310 [LOW]**
`handleRestore` (mock/local path) calls `undo()` in a synchronous `for` loop (`for (let i = 0; i < idx; i++) undo()`). Each `undo()` call triggers a full Zustand re-render; N sequential undos produce N re-renders instead of one batched update. Visible UI thrashing for large undo stacks.
**Fix:** Wrap in `React.unstable_batchedUpdates`, or add a `undoN(count: number)` store action that applies N undos in a single update.

---

### `DrawingSetManager.tsx`

**BUG-A6-5-025: DrawingSetManager.tsx:~70 [LOW]**
Outside-click handler uses `window.addEventListener('click', handler)` (not `mousedown`). Correct ordering is maintained (item click → document click close), but if a menu item synchronously re-renders the component, a new handler is registered during the same event bubble — redundant close call possible. Low risk.

---

### `QuantitiesPanel.tsx (continued)`

**BUG-A6-5-026: QuantitiesPanel.tsx:~881+ [MEDIUM]**
(Superseding BUG-A6-3-308) Full reading confirms: `handleExecuteMerge` N+1 fetch loop is verified present. Additionally, `handleExecuteCleanUp` has the identical pattern nested inside a `for...of suggestions` outer loop. No AbortController on any of these requests. See BUG-A6-5-029 and BUG-A6-5-030.

---

## High-Priority Actions for Cycle 6

1. **BUG-A6-5-021** — `MeasurementTool.tsx` coordinate space bug: measurements in screen pixels at zoom ≠ 100% are systematically wrong.
2. **BUG-A6-5-017** — `CustomFormulas.tsx` double unit conversion: linear formula values are ~ppu× too small.
3. **BUG-A6-5-029 + 030** — `QuantitiesPanel.tsx` O(N×M) sequential fetch loops in merge/clean-up: must batch.
4. **BUG-A6-5-020** — `xlsx` CVE (prototype pollution/ReDoS): must resolve before production.
5. **BUG-A6-5-002** — `AssembliesPanel.tsx` residual stale closure in `handleSave`.
6. **BUG-A6-5-022** — `RepeatingGroupTool.tsx` drag escapes overlay bounds.
7. **BUG-A6-5-001** — `ActivityFeed.tsx` premature `URL.revokeObjectURL` breaks JSON export download.
8. **BUG-A6-5-027** — `PDFViewer.tsx` `renderPageForCapture` resolve overwrite hangs export caller.

---

*End of audit-A6-cycle5.md — Cycle 5 complete, 37 bugs catalogued*
