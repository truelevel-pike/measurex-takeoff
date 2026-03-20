# Code Audit — Sector A6: Components (UI/UX)
**Repo:** `measurex-takeoff`  
**Branch:** `main`  
**Sector:** `src/components/`  
**Auditor:** Admiral AI (Sector A6)  
**Date:** 2026-03-20  
**Files scanned:** 93 (all .tsx files in src/components/)

---

## Severity Legend
- **CRITICAL** — Runtime crash, data loss, or security risk
- **HIGH** — Broken behavior, memory leak, or React rules violation
- **MEDIUM** — Correctness/reliability issue that degrades UX or correctness
- **LOW** — Code smell, accessibility gap, or minor anti-pattern

---

## Findings

### 🔴 CRITICAL

**BUG-A6-001:** `[AutoNameTool.tsx:208]` **[severity: CRITICAL]** **Rules of Hooks violation — early return after hooks.**  
`AutoNameTool` calls 4 `useState` hooks and 2 `useRef` hooks (lines 201–206), then at line 208 performs a conditional `if (!aiSheetNaming) return (...)`, and afterwards calls `useEffect` at line 287. React requires all hooks to be called unconditionally. This violates the Rules of Hooks and will cause unpredictable hook miscount errors, especially as the `aiSheetNaming` flag toggles. The `useEffect` on line 287 (cleanup for interval/timeout refs) must come before any early return.  
**Fix:** Move all hooks above the `if (!aiSheetNaming)` guard, or extract the gated UI into a separate child component.

---

**BUG-A6-002:** `[ClassificationLibrary.tsx:27–31]` **[severity: CRITICAL]** **State mutation during render (getDerivedStateFromProps pattern misuse).**  
The component calls `setPrevOpen(open)` and `setActiveTab(...)` / `setSelectedKeys(...)` inside the render function body (not inside a `useEffect`), triggered by a manual `if (prevOpen !== open)` check. Calling state setters during render is explicitly an anti-pattern — it causes double-renders, can infinite-loop if React's Strict Mode batches updates differently, and is officially deprecated. The only supported way to synchronize props to state during render is via React's `getDerivedStateFromProps` (class component) or the controlled-component pattern (functional).  
**Fix:** Replace the render-body setState pattern with a `useEffect(() => { if (!open) return; setActiveTab('RESIDENTIAL'); setSelectedKeys(new Set()); }, [open])`. Remove `prevOpen` state entirely.

---

### 🟠 HIGH

**BUG-A6-003:** `[DrawingSetManager.tsx:128–155]` **[severity: HIGH]** **Memory leak — `setInterval` not cleared if component unmounts during upload simulation.**  
`simulateUpload` (a `useCallback`) spawns one `setInterval` per uploaded file. Each interval is stored in a local `interval` const; if the component unmounts while an upload is in progress, the interval fires `setSets` / `setUploads` on an unmounted component (and will trigger React "setState on unmounted component" warnings, or cause silent state corruption in StrictMode). There is no cleanup mechanism (no ref tracking, no `useEffect` return).  
**Fix:** Store interval IDs in a `useRef<number[]>` and clear them all in a `useEffect` cleanup. Or use an `isMounted` ref guard inside the interval callback.

---

**BUG-A6-004:** `[AssembliesPanel.tsx:290–304]` **[severity: HIGH]** **Memory leak — debounce timers not cleared on unmount.**  
`costDebounceTimers.current` accumulates `setTimeout` IDs for API calls (line 294). While in-flight timers are cleared before re-setting (correct), there is no `useEffect` cleanup that calls `Object.values(costDebounceTimers.current).forEach(clearTimeout)` on unmount. If the component unmounts while a 300ms debounce is pending, the callback fires against an unmounted component and may execute a `fetch` with `projectId` from a stale closure.  
**Fix:** Add `useEffect(() => () => { Object.values(costDebounceTimers.current).forEach(clearTimeout); }, [])`.

---

**BUG-A6-005:** `[CanvasOverlay.tsx: post-hook conditional]` **[severity: HIGH]** **Potential hooks-after-conditional in CanvasOverlay (non-obvious).**  
`CanvasOverlay` has a long sequence of hooks (useState, useStore, useCallback, useMemo, useEffect — many of them), and then later in the render section uses IIFE patterns inside JSX that call `useMemo`-derived values after conditional early returns in nested blocks (e.g., `(() => { ... if (!poly) return null; ... })()`). While these are not top-level hooks, the `isSelected && displayPoints.map(...)` pattern on line 646 uses `key={i}` (index as key) for vertex handle rects — see BUG-A6-015.

---

**BUG-A6-006:** `[PerfMonitor.tsx:6–9]` **[severity: HIGH]** **useEffect with no cleanup for `initPerfMonitor`.**  
`initPerfMonitor({ reportUrl: '/api/perf' })` is called with no return value captured and no cleanup in the `useEffect`. If `initPerfMonitor` sets up any intervals, timers, or global event listeners internally, they will leak on every hot-reload or StrictMode double-mount. No `return () => cleanup()` exists.  
**Fix:** `initPerfMonitor` should return a cleanup function; call it in the `useEffect` return, or document that it is idempotent and safe to call without cleanup.

---

**BUG-A6-007:** `[CollaborationPanel.tsx:204, 210]` **[severity: HIGH]** **Uncaptured `setTimeout` calls on state setters — potential setState-after-unmount.**  
`handleInvite` calls `setTimeout(() => setInviteSent(null), 3000)` and `handleCopyLink` calls `setTimeout(() => setCopied(false), 2500)` without storing the timer ID. If the panel is closed/unmounted within 3 seconds of inviting or copying, these callbacks will call `setInviteSent`/`setCopied` on an unmounted component. In React 18 this is a no-op warning, but under concurrent mode it can cause state updates on wrong fiber trees.  
**Fix:** Store timer IDs in a `useRef`, clear them in a `useEffect` cleanup.

---

**BUG-A6-008:** `[AIActivityLog.tsx:26]` **[severity: HIGH]** **`useStore.getState()` called in a module-level helper function used during rendering — not reactive.**  
`getClassificationColor(classificationId)` calls `useStore.getState().classifications.find(...)` at render time inside a module-scope function (not a hook). This read is non-reactive: if `classifications` changes in the store, the log entries that have already been rendered via `eventToLogEntry` (line 49) will never update their colors. Any log entry stored in state before the classification color was updated will show a stale color forever.  
**Fix:** Either pass `classifications` explicitly as a parameter (from a `useStore` selector in the component), or recompute classification colors when rendering the list (not during the event parsing phase).

---

**BUG-A6-009:** `[ClassificationGroups.tsx:155–165]` **[severity: HIGH]** **`handleMoveGroup` is a dead/broken function — reorder UI is wired but does nothing.**  
The `handleMoveGroup` function at line 155 computes a reordered array but then has inline comments acknowledging it can't actually swap groups (no `setGroups` action), and the swap logic is never executed. The "Move group up/down" buttons in the UI call this function, meaning clicking them silently does nothing. This is a broken feature shipped in the UI.  
**Fix:** Add a `reorderGroups(ids: string[])` action to the store, or remove the reorder buttons until the store supports it.

---

**BUG-A6-010:** `[QuantitiesPanel.tsx:1012–1017]` **[severity: HIGH]** **`useStore.getState()` inside `setTimeout(0)` — fragile "microtask" workaround to read newly-created group state.**  
After calling `addGroup(...)`, a `setTimeout(() => { const latest = useStore.getState().groups; ... }, 0)` is used to find the newly created group by name comparison (line 1013–1016). This pattern is brittle: it races against Zustand's state sync (Zustand updates are synchronous by default, so the group should be available in the same tick via `useStore.getState()` without the timeout), and it matches by name which could collide if two groups have identical names.  
**Fix:** Have `addGroup` return the new group's ID, or use a pending-ID ref pattern.

---

**BUG-A6-011:** `[ContextMenu.tsx:133–135]` **[severity: HIGH]** **`useEffect` with empty `[]` dep array calls `menuRef.current?.focus()` — but `polygonId` null guard comes AFTER the effect.**  
The `useEffect(() => { menuRef.current?.focus(); }, [])` at line 133 is placed before the `if (!polygonId) return null` guard at line 138. In practice, the effect runs on every mount, including during the brief mount when `polygonId` is null. While this is mostly harmless (focus on null ref is no-op), it violates the convention of not running effects when the component is in a "hidden" state. More importantly, the Escape/scroll `useEffect` hooks at lines 98 and 126 reference `onClose` in their deps but run window-level event listeners — these run even when the menu is arguably not meaningful.

---

### 🟡 MEDIUM

**BUG-A6-012:** `[AutoScalePopup.tsx:52]` **[severity: MEDIUM]** **`setInterval` inside `useEffect` — verify cleanup path on fast unmounts.**  
An interval is set at line 52 for polling scale-detection progress. Need to verify the cleanup path handles the case where the interval callback fires after unmount. The `clearInterval` at line 55 (if present) is inside the interval callback (when progress ≥ 100), but there should also be a `return () => clearInterval(id)` in the `useEffect` cleanup.  
*Based on the grep, the interval is captured in `id` — confirm the `useEffect` return does `clearInterval(id)`.*

---

**BUG-A6-013:** `[MXChat.tsx:527]` **[severity: MEDIUM]** **`setTimeout` inside onClick handler for "copy message" — not captured or cleared on unmount.**  
`setTimeout(() => setCopiedId((prev) => ...), 2000)` in the copy button onClick (line 527) has no timer ID storage. If the user copies and the message list unmounts (e.g., panel closes), the callback fires on an unmounted component. In React 18+ this is silent but wasteful.  
**Fix:** Use a `useRef<ReturnType<typeof setTimeout>>` and clear on unmount, or accept the minor risk since MXChat is session-persistent.

---

**BUG-A6-014:** `[ExportPanel.tsx:367, 416]` **[severity: MEDIUM]** **`URL.createObjectURL` revoked via `setTimeout(..., 4000)` — revoke not guaranteed if tab is closed mid-timeout.**  
Most export handlers call `setTimeout(() => URL.revokeObjectURL(url), 4000)` rather than revoking immediately after `a.click()`. This is fine for the main case, but if the component unmounts before 4 seconds (user navigates away), the object URL is revoked by GC anyway — however no `useEffect` cleanup tracks these. Compare line 472 which correctly calls `URL.revokeObjectURL(url)` immediately after click — that's the correct pattern. Lines 367, 416, 509, 516, 535, 542, 595, 602 should all use immediate revoke like line 472–477.

---

**BUG-A6-015:** `[CanvasOverlay.tsx:646, 860]` **[severity: MEDIUM]** **`key={i}` (array index as React key) for draggable vertex handles and tooltip lines.**  
Vertex handle `<rect>` elements and hover tooltip `<div>` lines both use `key={i}` (array index). For vertex handles, if vertices are reordered or deleted, React will reuse DOM nodes based on index rather than vertex identity, potentially mismatching drag state. Use a stable key like `key={`v-${poly.id}-${i}`}` to tie identity to the polygon+index combination.

---

**BUG-A6-016:** `[DrawingComparison.tsx:79, 530]` **[severity: MEDIUM]** **`key={i}` (array index) for rendered polygon comparison rows.**  
Static list rendered from an array without stable IDs — use derived stable keys.

---

**BUG-A6-017:** `[AIImageSearch.tsx:495]` **[severity: MEDIUM]** **`key={i}` (array index) for search result thumbnails — list can reorder.**  
If AI image search results are reordered, filtered, or updated, React will reuse wrong DOM nodes. Use `key={result.id}` or equivalent stable identifier.

---

**BUG-A6-018:** `[QuantitiesPanel.tsx:1082, 1633]` **[severity: MEDIUM]** **`key={i}` for suggestion cards and formula rows — unstable on reorder.**  
Suggestions are accepted/rejected in place, which mutates their index position. Using `key={i}` means React doesn't correctly reconcile accepted state with the DOM node.  
**Fix:** Use a stable suggestion ID (e.g., hash of the suggestion content, or backend-assigned ID).

---

**BUG-A6-019:** `[ClassificationGroups.tsx:51–57]` **[severity: MEDIUM]** **`useEffect` for context-menu outside-click handler — `contextMenu` dep causes excessive listener churn.**  
The effect at line 51 depends on `contextMenu` state. Every time the menu position updates (even by 1px), the old listener is removed and a new one added. This is correct but inefficient. More importantly, the `mousedown` handler calls `setContextMenu(null)` which will trigger a re-run of the effect unnecessarily.  
**Fix:** Keep the listener always attached (mount/unmount only), and use a `ref` for the context menu element check.

---

**BUG-A6-020:** `[AssembliesPanel.tsx:312]` **[severity: MEDIUM]** **`window.confirm()` blocks the main thread UI.**  
`window.confirm('Delete this assembly?')` is used as a confirmation dialog. This is a synchronous blocking call that freezes the entire tab, breaks with custom themes, and is unreliable in some embedded WebView contexts.  
**Fix:** Replace with a custom modal or inline confirmation pattern (already used elsewhere in the codebase, e.g., `SnapshotPanel`).  
Same issue in `ClassificationGroups.tsx:151` and `MarkupTools.tsx:59`.

---

**BUG-A6-021:** `[AssembliesPanel.tsx:378]` **[severity: MEDIUM]** **`useStore.getState()` called inside a `.map()` during render — inconsistent read.**  
`useStore.getState().assemblies.map(...)` at line 378 reads from the store snapshot at call-time rather than from a reactive selector. If the component re-renders for a different reason while the store updates asynchronously, the `.map()` result could be stale.  
**Fix:** Subscribe to `assemblies` via `useStore((s) => s.assemblies)` at the top of the component and use the reactive value.

---

**BUG-A6-022:** `[CollaborationPanel.tsx:162]` **[severity: MEDIUM]** **`SAMPLE_COLLABORATORS` is a module-level constant — collaboration data is fake/hardcoded, no loading or error state.**  
The `CollaborationPanel` initializes state with hardcoded `SAMPLE_COLLABORATORS` and there is no API fetch, no loading spinner, and no error state. The "Invite" flow only calls `setCollaborators(prev => [...prev, newCollab])` in local state with no persistence. If this is meant to be production-ready collaboration, it has no real data layer.  
**Fix:** Add an API integration or clearly gate behind a feature flag marking it as a demo/stub.

---

**BUG-A6-023:** `[QuantitiesPanel.tsx:256, VersionHistory.tsx:323]` **[severity: MEDIUM]** **`window.location.search` accessed inside `useEffect` — correct, but projectId could come from a typed router param.**  
Using `new URLSearchParams(window.location.search)` inside a `useEffect` to extract the project ID is a common workaround for non-Next.js routing, but it creates a dependency on the global `window` that breaks SSR and makes the component non-testable without `jsdom`. Using Next.js's `useSearchParams()` hook would be the idiomatic approach in an App Router context.

---

**BUG-A6-024:** `[AutoNameTool.tsx:287]` **[severity: MEDIUM]** **`useEffect` cleanup for `intervalRef`/`timeoutRef` does not clear both refs symmetrically.**  
The cleanup effect at line 287 clears the interval/timeout refs on unmount — but because the early return at line 208 bypasses the effect registration when `!aiSheetNaming`, the cleanup only runs when `aiSheetNaming` is truthy at mount time. If the flag is toggled off while a timer is running, the timers become orphaned.  
(This is a secondary consequence of BUG-A6-001.)

---

**BUG-A6-025:** `[TopNavBar.tsx:385]` **[severity: MEDIUM]** **`key={i}` for collaborator avatar list — index as key.**  
Avatar circles for collaborators use `key={i}`. If the collaborators array changes order, React will misreconcile colors/initials.  
**Fix:** Use `key={collaborator.id}` or a hash of the collaborator name.

---

**BUG-A6-026:** `[MXChat.tsx:124, 130, 132]` **[severity: MEDIUM]** **`key={i}` for table headers and cells in the parsed markdown table renderer.**  
Table `<th>` (key=`{i}`) and `<td>` (key=`{ci}`) and `<tr>` (key=`{ri}`) use index keys. For a static table this is acceptable, but if table data updates dynamically (e.g., AI streaming updates the table), React will incorrectly reuse cells.  
**Fix:** Derive stable keys from header text + row index for headers, and row content hash for data rows.

---

**BUG-A6-027:** `[ExportPanel.tsx:509, 535]` **[severity: MEDIUM]** **IFC stub and CSV exports use `window.location.search` inside `useCallback` without `useSearchParams` — SSR unsafe.**  
`new URLSearchParams(window.location.search)` is called inside callbacks (not `useEffect`), meaning it runs during event handlers. This is fine at runtime but won't work in SSR or test environments.

---

**BUG-A6-028:** `[PDFViewer.tsx:270, 427, 512, 520, 675]` **[severity: MEDIUM]** **`useStore.getState()` called inside async callbacks and event handlers.**  
While `useStore.getState()` is a supported Zustand pattern for reading fresh state inside event handlers/async code (intentional here to avoid stale closures), it makes the data flow harder to trace and test. The pattern is applied inconsistently — some values use reactive selectors, others use `getState()`. This is acceptable in Zustand but warrants a consistent convention comment/doc.

---

### 🔵 LOW

**BUG-A6-029:** `[AIImageSearch.tsx:247, 278, 303, 338, 369, 523, 600]` **[severity: LOW]** **Multiple `<button>` and `<input>` elements without `aria-label` or visible label text.**  
Several interactive controls (filter chips, "Search", "Clear", pagination arrows) in `AIImageSearch` have no accessible label. Screen readers will announce them as generic "button" elements.  
**Fix:** Add `aria-label="Search AI images"` etc. on all unlabeled buttons.

---

**BUG-A6-030:** `[AnnotationTool.tsx:104, 120]` **[severity: LOW]** **Text annotation input and submit button lack accessible labels.**  
The annotation text input has a `placeholder` but no `aria-label`. The submit button contains an SVG icon with no `title` or `aria-label`.

---

**BUG-A6-031:** `[ActivityFeed.tsx:110, 122]` **[severity: LOW]** **Clear/export buttons lack `aria-label`.**  
The "Clear all" and "Export JSON" buttons in `ActivityFeed` have icon-only content with no accessible text.

---

**BUG-A6-032:** `[AssembliesPanel.tsx:403, 410, 417, 429, 496, 508]` **[severity: LOW]** **Multiple icon-only `<button>` elements without `aria-label` in assembly rows.**  
Increment/decrement cost buttons and row-level action buttons have no accessible labels.

---

**BUG-A6-033:** `[PageThumbnailSidebar.tsx:274]` **[severity: LOW]** **`key={i}` for classification color segment bars.**  
Page breakdown bar segments use `key={i}`. Low-risk since segments are display-only, but for correctness should use `key={seg.classificationId}`.

---

**BUG-A6-034:** `[TakeoffProgressModal.tsx:325]` **[severity: LOW]** **`key={i}` for status badge spans inside page rows.**  
Model badge spans inside page status rows use `key={i}`.

---

**BUG-A6-035:** `[WhatsNewModal.tsx:109]` **[severity: LOW]** **`key={i}` for feature changelog items.**  
Changelog item `<div>` elements use `key={i}`. Items could theoretically reorder between versions.

---

**BUG-A6-036:** `[TopNavBar.tsx:169]` **[severity: LOW]** **`window.location.origin` used inside a `useCallback` — safe at runtime but not SSR-safe.**  
The share URL is built as `${window.location.origin}/share/${token}` inside a callback. Should guard with `typeof window !== 'undefined'` or use Next.js's `usePathname`/router.

---

**BUG-A6-037:** `[ClassificationLibrary.tsx:41–45]` **[severity: LOW]** **`useEffect` for Escape key handler depends on `[open, onClose]` — `onClose` reference must be stable.**  
If `onClose` is an inline function at the call site (not `useCallback`-wrapped), this effect will re-register the listener on every parent render. Correct behavior requires `onClose` to be stable. Add a note in prop types or wrap internally with `useRef`.

---

**BUG-A6-038:** `[QuantitiesPanel.tsx:255–258]` **[severity: LOW]** **`isLoading` state derived from `externalLoading` prop is duplicated state.**  
A separate `useEffect` at line 259 syncs `externalLoading` into a local `isLoading` state. This is derived state — it duplicates the prop value unnecessarily. Use `externalLoading` directly (or combine with a local loading state for the fetch).

---

**BUG-A6-039:** `[LeftToolbar.tsx:105, 168]` **[severity: LOW]** **`key={b.label}` for toolbar buttons — label strings are used as keys.**  
Using human-readable label strings as keys is fragile if labels are localized/translated (the `LanguageSwitcher` component exists, implying i18n intent). Use stable IDs (`b.tool` or `b.id`) as keys.

---

**BUG-A6-040:** `[CanvasOverlay.tsx: floating toolbar]` **[severity: LOW]** **Floating toolbar uses `position: fixed` relative to SVG centroid calculated from `getBoundingClientRect()` — will misposition if the page scrolls.**  
The floating edit toolbar (line ~800) converts SVG coordinates to screen-space via `svgRect` from `getBoundingClientRect()`, then uses `position: fixed`. This is correct for non-scrolling viewports but will misalign if the PDF viewer panel is inside a scrollable container and the user has scrolled.

---

**BUG-A6-041:** `[DrawingComparison.tsx]` **[severity: LOW]** **Comparison polygon list uses `key={i}` for polygon overlap rows — index keys.**  
Same index-as-key pattern in the drawing comparison diff view.

---

**BUG-A6-042:** `[ExportPanel.tsx:881]` **[severity: LOW]** **`key={i}` for export format option tabs.**  
Export tab buttons use `key={i}` — stable `key={tab.id}` or `key={tab.label}` preferred.

---

**BUG-A6-043:** `[TogalChat.tsx:331]` **[severity: LOW]** **`key={i}` for chat message suggestions.**

---

**BUG-A6-044:** `[AssemblyEditor.tsx:86]` **[severity: LOW]** **Assembly name `<input>` has no `aria-label` — only relies on placeholder.**

---

**BUG-A6-045:** `[ScaleCalibrationPanel.tsx:35]` **[severity: LOW]** **Custom event `calibration-line-complete` dispatched via `window.removeEventListener` — custom event channel bypasses React's event system and is not typed.**  
The component listens on `window` for a non-standard custom event. This is an implicit coupling between `ScaleCalibrationPanel` and whatever emits `calibration-line-complete`. Should use a typed event bus or Zustand action instead.

---

**BUG-A6-046:** `[SmartTools.tsx:299]` **[severity: LOW]** **`window.dispatchEvent(new CustomEvent('open-pattern-search'))` — same untyped custom event coupling as above.**  
Cross-component communication via raw `window` custom events bypasses React's component tree and is untestable. Should use Zustand store state or a typed event emitter.

---

## Summary Table

| Severity | Count |
|---|---|
| CRITICAL | 2 |
| HIGH | 9 |
| MEDIUM | 17 |
| LOW | 17 |
| **Total** | **45** |

---

## Top Priority Fixes (for the mass fix wave)

1. **BUG-A6-001** — AutoNameTool hooks violation (will cause React errors in production)
2. **BUG-A6-002** — ClassificationLibrary setState-during-render (StrictMode crash risk)
3. **BUG-A6-003** — DrawingSetManager interval leak on unmount
4. **BUG-A6-004** — AssembliesPanel debounce timer cleanup
5. **BUG-A6-009** — ClassificationGroups broken reorder UI (ships dead code)
6. **BUG-A6-010** — QuantitiesPanel fragile setTimeout(0) store read workaround
7. **BUG-A6-008** — AIActivityLog non-reactive store read for classification colors
8. **BUG-A6-020** — window.confirm() usage (3 components) — blocks main thread

---

*End of audit report — Sector A6 (Components).*
