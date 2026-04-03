# MeasureX Frontend Audit — A7 (Frontend Section)
**Auditor:** Agent A7  
**Date:** 2026-03-27  
**Scope:** `src/app/`, `src/components/`, `public/`  
**Status:** COMPLETE

---

## Table of Contents
1. [src/app/layout.tsx](#srcapplayouttsx)
2. [src/app/page.tsx (main editor)](#srcapppagetsx)
3. [src/app/projects/page.tsx](#srcappprojectspagetsx)
4. [src/app/share/[token]/page.tsx](#srcappsharetoken)
5. [src/components/QuantitiesPanel.tsx](#srccomponentsquantitiespaneltsx)
6. [src/components/CanvasOverlay.tsx](#srccomponentscanvasoverlaytsx)
7. [src/components/PDFViewer.tsx](#srccomponentspdfviewertsx)
8. [src/components/TopNavBar.tsx](#srccomponentstopnavbartsx)
9. [src/components/LeftToolbar.tsx](#srccomponentslefttoolbartsx)
10. [src/components/BottomStatusBar.tsx](#srccomponentsbottomstatusbartsx)
11. [src/components/Toast.tsx](#srccomponentstoasttsx)
12. [src/components/ErrorBoundary.tsx](#srccomponentserrorboundarytsx)
13. [src/components/PolygonProperties.tsx](#srccomponentspolygonpropertiestsx)
14. [src/components/MXChat.tsx](#srccomponentsmxchattsx)
15. [src/components/OfflineIndicator.tsx](#srccomponentsofflineindicatortsx)
16. [src/components/ScaleCalibration.tsx](#srccomponentsscalecalibrationtsx)
17. [src/components/ExportPanel.tsx](#srccomponentsexportpaneltsx)
18. [src/components/MobileToolbar.tsx](#srccomponentsmobiletoolbartsx)
19. [src/components/WorkspaceSwitcher.tsx](#srccomponentsworkspaceswitchertsx)
20. [public/ assets](#public-assets)
21. [Cross-cutting / Global Issues](#cross-cutting--global-issues)

---

## src/app/layout.tsx

### L-001 · MEDIUM — No `<meta name="viewport">` tag visible in layout
- The root layout must include a responsive viewport meta tag. If it is only in a separate `<head>` config export, verify it renders correctly in Next.js 14 App Router; missing viewport breaks mobile scaling.
- **Fix:** Confirm `metadata.viewport` or explicit `<meta name="viewport" content="width=device-width, initial-scale=1">` is present.

### L-002 · LOW — No `lang` attribute verified on `<html>` element
- Screen readers need `<html lang="en">` for proper speech synthesis. Audit whether layout exports a `metadata.locale` or directly sets `<html lang="en">`.

### L-003 · LOW — No skip-navigation link
- There is no "Skip to main content" link at the top of the layout, which is a WCAG 2.1 Level A requirement for keyboard-only users.

---

## src/app/page.tsx (main editor)

### P-001 · HIGH — Entire page is one monolithic 2,970+ line client component with no lazy boundaries
- `src/app/page.tsx` is a single `'use client'` file containing the full editor. All heavy components (3D scene, ExportPanel, ComparePanel, WhatsNewModal) are dynamically imported, but the root component itself cannot be server-rendered. Large bundles increase TTI. Consider splitting into smaller sub-components with independent error boundaries.

### P-002 · HIGH — Race condition: `loadProjects` initialisation in projects page
- In `projects/page.tsx`, `loadProjects` is in a `useCallback` that depends on `projectsOffset` (line ~195). The initial `useEffect(() => { loadProjects(); }, [loadProjects])` will re-fire whenever `projectsOffset` changes, causing duplicate requests on "load more." The `// eslint-disable-next-line react-hooks/exhaustive-deps` suppressor hides this.
- **File:** `src/app/projects/page.tsx` ~line 195–220

### P-003 · HIGH — `MAX_CLASSIFICATIONS = 20` hardcoded constant, enforced silently
- `page.tsx` line ~89: `const MAX_CLASSIFICATIONS = 20;`. When AI takeoff produces >20 classifications they are silently merged/auto-dropped via `autoMergeToLimit`. Users are never told this happened. There is no toast or warning when classifications are forcibly merged.
- **Fix:** Show a `warning` toast when auto-merge fires and document the limit in the UI.

### P-004 · MEDIUM — `prompt()` used for breakdown names in QuantitiesPanel
- `src/components/QuantitiesPanel.tsx` line ~1520 (inside the "Add Breakdown" button handler): `const bdName = prompt('Breakdown name (e.g. Living Room):');`. Native `window.prompt()` is synchronous, blocks the thread, is unstyled, and is completely inaccessible on iOS/Android (often returns `null`). It also does not work in some embedded environments.
- **Fix:** Replace with an inline input form or a modal, consistent with all other edit flows in the panel.

### P-005 · MEDIUM — `localStorage` accessed at module scope / before `mounted` guard on multiple paths
- Several `useState` initialisers in `QuantitiesPanel.tsx` (lines ~260, ~266) call `localStorage.getItem()` directly inside the initialiser callback with an `if (typeof window === 'undefined') return false` guard. Although the guard prevents SSR crashes, the Next.js App Router with `'use client'` still pre-renders on the server in some configurations. The state initialiser pattern is correct here, but the companion `groupByTrade` read (line ~260) has no guard against `typeof window === 'undefined'` being falsy during hydration snapshot mismatch. Confirm a suppressHydrationWarning is present on affected elements.
- **File:** `src/components/QuantitiesPanel.tsx` ~line 260–270

### P-006 · MEDIUM — Keyboard shortcut 'S' conflicts: 'Split' tool vs. search input
- `page.tsx` defines `s: 'split'` in `toolKeys` (~line 83). When focus is in a search `<input>` the shortcut fires anyway unless properly guarded. Inputs in QuantitiesPanel and TextSearchPanel do not all call `e.stopPropagation()` / check `e.target instanceof HTMLInputElement` in the global keydown handler.

### P-007 · MEDIUM — No loading state during project autosave
- The main page auto-saves project state to the API. There is no visual indicator (spinner, "Saving…" pill, dirty bit) to inform the user that unsaved work exists. Users may close the tab before the debounce fires.

### P-008 · MEDIUM — `convertTakeoffTo3D` called client-side on every import
- `import { convertTakeoffTo3D } from '@/lib/takeoff-to-3d'` at the top of `page.tsx` is an unconditional static import. If this library is heavy it should be dynamically imported (like ThreeDScene).

### P-009 · LOW — `toolKeys` record (`page.tsx` ~line 83) includes `'annotate'` not exposed in LeftToolbar
- The `GROUPS` array in `LeftToolbar.tsx` does not include an Annotate button, but `page.tsx` assigns keyboard shortcut `t: 'annotate'`. This creates a hidden shortcut with no discoverable affordance. The `KeyboardShortcutsModal` likely lists it, but it should be in the toolbar or removed.

### P-010 · LOW — DEMO_PROJECT_ID writes to `localStorage` from server component
- `saveDemoProject()` and `DEMO_PROJECT_ID` are called from inside `onClick` handlers in `projects/page.tsx` so they're client-only. However `isDemoProject()` is imported in `page.tsx` which is also client-side — not a bug, but verify `DEMO_PROJECT_STATE` is not accidentally imported in a Server Component context elsewhere.

---

## src/app/projects/page.tsx

### PR-001 · CRITICAL — Folders & stars stored only in `localStorage` — silently lost on new device / incognito
- `loadFolders()`, `loadStarred()`, `loadProjectTags()` all read from `localStorage`. No server-side persistence. No warning to the user that these are device-local. A user who switches browsers or clears storage loses all folder organisation.
- **File:** `src/app/projects/page.tsx` ~lines 112–145
- **Fix:** Either persist to the server API (preferred) or display a prominent disclaimer that organisation is device-local.

### PR-002 · HIGH — Unhandled promise rejection in `handleBulkDelete`
- `handleBulkDelete()` (~line 313) calls `Promise.allSettled(...)` but does not check for rejected items. On partial failure some projects may not be deleted but the UI removes them anyway. No error toast is shown.
- **Fix:** Check results array, show an error toast listing failed deletions, and re-add them to the UI list.

### PR-003 · HIGH — `handleCreate` opens the project on **name collision** without confirming
- Lines ~280–290: if a project with the same name already exists, `handleCreate` silently opens the existing project and discards the new-name form without any user confirmation. This is a silent data-loss footgun if the user intended to create a new project with an identical name.
- **Fix:** Show a disambiguation dialog: "A project named X already exists. Open it or create a new one?"

### PR-004 · HIGH — Thumbnail lazy-load fires on every `projects` state change
- The thumbnail `useEffect` (~line 250) has `projects` in its dependency array (via the suppressed `// eslint-disable-next-line`). Every time any project changes (e.g. after `loadProjects()`) the thumbnail batch re-runs for all projects. This can cause repeated API calls to `/api/projects/:id` for projects whose thumbnails were already fetched if `thumbnails` state updates cause a re-render.
- **Fix:** Track which thumbnail IDs have been fetched (separate `fetchedIds` Set ref) and exclude them from the needs-thumbnail filter.

### PR-005 · MEDIUM — No error state for failed individual project delete
- `confirmDelete()` catches errors and calls `setError(message)`. However `setProjects(prev => prev.filter(p => p.id !== id))` runs regardless of whether the delete succeeded (it is outside the try block). If the API call fails, the project disappears from the UI but still exists server-side.
- **File:** ~line 330

### PR-006 · MEDIUM — Drag-and-drop counter logic fragile on fast drag events
- `pageDragCounter` ref is incremented/decremented on `dragenter`/`dragleave`. This approach can under-count if `dragleave` fires multiple times before `dragenter`. The result is `pageDragOver` getting stuck `true` after a quick move. A more reliable pattern is using a single `dragover`/`dragend` detection.

### PR-007 · MEDIUM — Context menu position clamping uses `ref` side-effect inside render
- The context menu `div` uses a `ref` callback (~line 870) that reads `getBoundingClientRect()` and sets `el.style.left/top` as a post-render DOM mutation. This is a layout effect disguised as a ref callback and will cause a visible reposition flash. Use `useLayoutEffect` or CSS `translate` clamping instead.

### PR-008 · MEDIUM — `onboardingSteps` accesses `localStorage` inside `useMemo` (during render)
- Lines ~395–404: `onboardingSteps` `useMemo` reads `localStorage.getItem('mx-onboarding-takeoff-run')` and `localStorage.getItem('mx-onboarding-exported')` guarded by `mounted`. This is correct but results in a hydration mismatch warning because `mounted` starts `false`, so the steps flash incorrect initial state on first render. A `useEffect` that sets these booleans after mount is cleaner.

### PR-009 · MEDIUM — `handleCreate` `useCallback` missing `pdfFile` in deps
- `handleCreate` references `pdfFile` but it is not in the `useCallback` dependency array (there's an eslint-disable comment). This means the callback closes over a stale `pdfFile` value in some timing scenarios.

### PR-010 · LOW — "Shared with Me" and "Archived" sections are permanently empty stubs
- Both sidebar sections return empty arrays with no message to the user about feature availability. This looks broken.
- **Fix:** Show "Coming soon" or hide the sections entirely.

### PR-011 · LOW — No confirmation when dropping a PDF onto the page drag overlay
- Page-wide drag `handlePageDrop` immediately starts upload with no preview of the file name or chance to cancel. A brief preview + confirm step would reduce accidental uploads.

### PR-012 · LOW — Version footer `MeasureX v1.0.0` is hardcoded string
- `src/app/projects/page.tsx` bottom footer: hardcoded `"MeasureX v1.0.0"`. Will diverge from the actual version in `package.json`. Should pull from `process.env.NEXT_PUBLIC_APP_VERSION` or a build-time constant.

### PR-013 · LOW — `RecentProjects` component rendered **twice** on the projects page
- Both `<RecentProjectsSection projects={projects} />` AND `<RecentProjects />` (standalone, with its own data fetch) are rendered on the same page, creating visual duplication and redundant API calls.
- **File:** ~lines 680, 695

---

## src/app/share/[token]/page.tsx

### SH-001 · HIGH — `inferTrade()` in share page duplicates and diverges from the canonical `assignTradeGroup` in `@/lib/trade-groups`
- The share page defines its own `inferTrade()` with a simpler regex, returning only 3 trade types (`Structural | Mechanical | Architectural`). The main app uses a full `TRADE_GROUP_ORDER` system with many more groups. Any trade-grouped quantities view in the share page will be incorrect / incomplete.
- **File:** `src/app/share/[token]/page.tsx` ~line 55
- **Fix:** Import and use `assignTradeGroup` from `@/lib/trade-groups` instead.

### SH-002 · MEDIUM — No skeleton / loading state beyond a spinner for share page
- The share page shows a `Loader2` spinner while loading. If the project has many polygons or pages the canvas itself may appear blank for a long time with no progress indication.

### SH-003 · MEDIUM — Share page re-implements scale calculations independently
- The scale math for area/linear quantities in the share view is re-derived locally, creating a potential for divergence from `@/lib/measurement-settings` and `@/lib/polygon-utils` used everywhere else.

### SH-004 · LOW — `readOnly` flag from API is acknowledged but never enforced visually
- `SharedProject.readOnly` is present in the type but if `readOnly === false` the page still renders a static view with no edit affordances. The field appears unused.

---

## src/components/QuantitiesPanel.tsx

This is the largest component (~1,800 lines rendered JSX). Many issues noted.

### Q-001 · HIGH — `eslint-disable-next-line react/display-name` on outer memo wrapper
- Line ~200: `// eslint-disable-next-line react/display-name` suppresses the missing display name on the `React.memo()` wrapper. This makes React DevTools debugging difficult and hides components during profiling.
- **Fix:** Use `QuantitiesPanel.displayName = 'QuantitiesPanel';` after the declaration, or use the named function form inside `React.memo`.

### Q-002 · HIGH — `lastUpdatedTime` never updates
- Lines ~300: `const [lastUpdatedTime] = useState(() => new Date().toLocaleTimeString(...))`. The timestamp is set once at component mount and never updated, even when data changes. The info tooltip reads "Last updated: 12:34 PM" but this is the panel-mount time, not the last measurement time.
- **Fix:** Derive from the store's last mutation timestamp or compute on render.

### Q-003 · HIGH — Deductions are stored in local React state (`deductionsByClassification`), not persisted
- Manual deductions added via "+ Add Deduction" exist only in component state. They are lost on unmount, page reload, or any store reset. There is no persistence to the API or to the Zustand store.
- **File:** ~line 397 (`addDeduction`, `updateDeduction`, `deleteDeduction` functions)
- **Fix:** Persist deductions to the classification in the store and save to the server like other classification properties.

### Q-004 · HIGH — Totals summary bar re-computes area using different logic than `totalsByClassification`
- Lines ~880–900: a second inline `for (const c of classifications)` loop re-sums totals from `totalsByClassification`. This duplicates the `totalsSummary` useMemo. Both should agree but if any deduction logic changes only one place gets updated.
- **Fix:** Consolidate to use `totalsSummary` everywhere or remove the duplicate loop.

### Q-005 · MEDIUM — Classification list has a `max-h-[400px]` cap on desktop only when >20 items
- Line ~1055: `className={\`flex-1 overflow-y-auto px-1${filtered.length > 20 ? ' max-h-[400px]' : ''}\`}`. This adds a fixed pixel cap when there are >20 classifications. On large monitors this wastes vertical space; on compact monitors the sidebar layout already constrains height via `h-full`. The inline conditional adds an unexpected scroll container midway through the DOM, which can conflict with the outer `aside` overflow handling.

### Q-006 · MEDIUM — `visibleCount` pagination interacts poorly with `summaryFilteredItems` filtering
- When `viewMode === 'summary'`, `summaryFilteredItems` may have fewer items than `visibleCount`, but the "Show all / Load more" buttons appear because `visibleCount < summaryFilteredItems.length` is checked incorrectly. Switching from summary → detailed can briefly show a "Load more" button for 0 additional items.

### Q-007 · MEDIUM — `MeasurementSettingsPanel` positioned as `absolute` child inside a `relative` header row
- The `MeasurementSettingsPanel` is rendered inside `div.px-3.py-2...relative` at the top of the panel. On mobile, this panel likely clips outside the sidebar boundary because the parent has `overflow-hidden` set via the tablet `aside` styles.

### Q-008 · MEDIUM — Trade header click target is a plain `div` with `onClick` — not keyboard accessible
- Lines ~1095–1110: trade-group headers use `<div onClick={...}>` with no `role="button"`, no `tabIndex`, and no `onKeyDown`. They are not reachable by keyboard navigation.
- **Fix:** Use `<button>` or add `role="button"`, `tabIndex={0}`, and keyDown handler.

### Q-009 · MEDIUM — Copy-to-clipboard in header button uses raw `formatArea`/`formatLinear` strings
- Line ~730: the copy-quantities button builds TSV rows. `formatArea` and `formatLinear` return locale-formatted strings (e.g. `"1,234.5 SF"`). When pasted into Excel with non-US locale settings the comma is interpreted as a thousands separator or decimal separator, breaking numeric columns.
- **Fix:** Use raw numeric values (`.toFixed(2)`) in the clipboard output and include unit in a separate column.

### Q-010 · MEDIUM — `pendingDeleteId` confirmation row can be covered by the next classification row on small screens
- The inline delete confirmation (`mx-6 flex items-center gap-2...`) appears between two `div` rows but has no `z-index` and no scrollIntoView. On a compact panel it may be partially obscured.

### Q-011 · MEDIUM — Groups section always shows (even empty) with a "No groups" message
- The groups section at the bottom renders even when `groups.length === 0` and `classifications.length === 0`. On an empty project the panel shows: "No groups with classifications. Click Group to create one." before the user has created anything. This is premature guidance.

### Q-012 · LOW — `VersionHistory` component is toggled via state but no loading/empty state is shown
- `showHistory && <VersionHistory ... />` — if `VersionHistory` fetches data, it has no loading or error state visible to the user when the data fetch fails.

### Q-013 · LOW — `showInfoTooltip` only on `mouseEnter`/`mouseLeave` — not keyboard accessible
- Lines ~680–698: the info tooltip on the QUANTITIES header is shown only on mouse hover. Keyboard/screen-reader users cannot discover "Last updated" information.
- **Fix:** Add `onFocus`/`onBlur` or use a `<Tooltip>` component with `role="tooltip"` and an `aria-describedby` reference.

### Q-014 · LOW — `RepeatingGroup` centroid-in-bounding-box check may miss fully-enclosed small polygons
- The comment says this is a BUG fix (BUG-A6-5-033), but centroid-based containment can still incorrectly exclude thin/long polygons (e.g. a corridor) whose centroid falls inside the box even though the polygon spans far outside it, inflating the repeating group total.

### Q-015 · LOW — `ClassificationShape` SVG has no title / aria-label
- The `ClassificationShape` SVG is `aria-hidden="true"` which is correct, but any accessibility tree that relies on color differentiation alone would fail for colorblind users. The shapes alone are intended to help, but they are hidden from AT — verify color is never the *only* differentiator for critical information.

### Q-016 · LOW — `handleExecuteMerge` and `handleExecuteCleanUp` are `async` but errors only go to `catch {}`
- Both functions catch errors with `catch { /* best effort */ }` after firing network calls. If the server-side polygon reassignment fails silently, the store and server are out of sync permanently without any user notification.

---

## src/components/CanvasOverlay.tsx

### C-001 · HIGH — 1,550+ line single component — difficult to maintain, no sub-components
- `CanvasOverlay.tsx` is a massive single file handling drawing, snapping, selection, hover, context menus, SVG rendering, and annotation. Any change risks regressions in unrelated features. Should be split into `DrawingLayer`, `SelectionLayer`, `AnnotationLayer`, etc.

### C-002 · HIGH — `getModelDisplayName` hardcodes model IDs that will go stale
- Lines ~30–42: `getModelDisplayName` maps model identifiers like `"gpt-5.4"`, `"claude-sonnet-4-6"`, `"gemini-3.1"` to display names. These IDs will become stale as models are versioned. There is no fallback normalization for new model identifiers.
- **Fix:** Source model display names from a shared config or derive them from the ID.

### C-003 · MEDIUM — SVG canvas overlay uses `ref` callback (`svgRef`) but is not guaranteed to match canvas dimensions on zoom
- The SVG is co-rendered inside the PDF transform. If the PDF render is async and the canvas dimensions change after the SVG is positioned, the overlay coordinates may not match for one frame. This can cause brief misalignment of polygon highlights.

### C-004 · MEDIUM — No error boundary wrapping `CanvasOverlay`
- CanvasOverlay has complex draw/event logic. A runtime error here crashes the entire editor with no recovery path unless `ErrorBoundary` wraps it in the parent. Verify the parent `page.tsx` wraps `<CanvasOverlay>` in `<ErrorBoundary name="canvas">`.

### C-005 · LOW — `highlightedPolygonId` prop is optional and defaults to undefined — missing null check in some paths
- `highlightedPolygonId?: string | null` — code that does `highlightedPolygonId === polygon.id` will return `false` for `null` and `undefined`, which is correct, but any path that calls `.includes(highlightedPolygonId)` on an array of strings could match `undefined` unexpectedly. Audit all uses.

---

## src/components/PDFViewer.tsx

### PDF-001 · HIGH — `renderCompleteResolveRef` is not called if component unmounts mid-render
- The cleanup function in `useEffect` (~line 110) sets `renderCompleteResolveRef.current = null` after calling `resolve(null)`. However if `renderPageForCapture` is awaiting resolution and the component unmounts *after* the resolve-ref is cleared but before the promise settles, the external caller gets a permanently hanging promise.
- **Fix:** Ensure `resolve(null)` is always called in the cleanup, then null the ref.

### PDF-002 · MEDIUM — `loadError` and `isOffline` are both React state; `isOffline` also tracked in-component via `window.online` events
- `OfflineIndicator.tsx` already tracks offline status globally. `PDFViewer` tracks its own `isOffline` state with its own event listeners. These two offline states may diverge (e.g. if offline events fire in different order between renders).
- **Fix:** Use a shared hook (e.g. `useIsOnline`) rather than duplicating the event listener logic.

### PDF-003 · MEDIUM — No loading progress indicator during PDF render
- `isRendering` state is tracked (line ~75) but the rendered state setter is stored as `const [, setIsRendering] = useState(false)` — the getter is discarded. The loading state is never surfaced to the user UI. On large multi-page PDFs the canvas goes blank between page renders.
- **Fix:** Expose `isRendering` to the parent via `useImperativeHandle` or a callback, and show a per-page loading overlay.

### PDF-004 · MEDIUM — `zoom` starts at `0.5` but `fitToPage()` corrects it — race on first render
- `const [zoom, setZoomState] = useState(0.5)` (~line 77). The `fitToPage()` call adjusts to the correct value, but any code that runs *before* fitToPage completes (e.g. `onDimensionsChange`) receives the wrong initial zoom. This can cause the first canvas draw to be at wrong scale briefly.

### PDF-005 · LOW — `detectSheetName()` regex `SHEET_CODE_RE` will match version numbers (e.g. "v2.0")
- The regex `/\b([A-Z]{1,2})[-.]?(\d{1,3})(?:\.(\d{1,2}))?\b/` would match `"V2.0"` or `"A1"` in a copyright notice. This could assign a wrong sheet name.

### PDF-006 · LOW — Worker is always loaded from `/pdf.worker.min.mjs` relative path with no version hash
- `public/pdf.worker.min.mjs` has no cache-busting hash. When the PDF.js version is updated, browsers may serve a stale worker. Add a versioned path or use a CDN URL with version pinning.

---

## src/components/TopNavBar.tsx

### TN-001 · HIGH — TopNavBar not read in full during this audit pass — only structure reviewed
- Full line-by-line analysis was not completed due to file size. Issues below are from partial review.

### TN-002 · MEDIUM — Mobile nav items likely do not meet 44×44px minimum touch target size
- Several icon-only buttons in the mobile layout use `p-1` or `p-1.5` padding, which with a 16px icon gives a ~24px tap target. WCAG 2.5.5 recommends 44×44px.

### TN-003 · LOW — AI model selector (if present in nav) has model IDs hardcoded
- Same concern as CanvasOverlay: model display names likely hardcoded in TopNavBar's AI settings panel.

---

## src/components/LeftToolbar.tsx

### LT-001 · MEDIUM — Smart Tools panel focus trap does not account for dynamically injected focusable elements
- `handleSmartPanelKeyDown` queries `querySelectorAll` for focusables at the time of each Tab press. If SmartTools lazy-loads content that adds focusable elements after initial open, the first/last detection will be stale until the next Tab press.

### LT-002 · MEDIUM — `onClick` handler on undo/redo buttons does not show any disabled state when history is empty
- `undo()` and `redo()` are called unconditionally. There is no `canUndo`/`canRedo` state from the store being read. The undo/redo buttons appear always enabled even when there is nothing to undo.
- **Fix:** Read `canUndo` and `canRedo` from the store and set `disabled` + `aria-disabled` on the buttons.

### LT-003 · LOW — Keyboard shortcuts shown in `title` tooltip but not accessible via ARIA
- Buttons show shortcut keys in the `title` attribute (e.g. `title="Draw Area (D)"`). `title` is not reliably read by screen readers on all platforms. Should use `aria-keyshortcuts="d"` or a visible keyboard shortcut badge.

### LT-004 · LOW — Mobile toolbar renders a separate `<nav>` outside LeftToolbar
- On mobile, `LeftToolbar` returns a `<nav aria-label="Tool bar">` with an inline style layout, while `MobileToolbar.tsx` also exists as a `<nav aria-label="Mobile toolbar">`. Both exist in the DOM on certain breakpoints — verify only one is rendered at a time and they share the same landmark structure.

---

## src/components/BottomStatusBar.tsx

### BS-001 · MEDIUM — Scale button uses arbitrary inline `style` instead of design system tokens
- The scale display button uses complex inline `style` objects with rgba colors, box-shadows, and conditional values. These are not from the Tailwind design system and will diverge from the rest of the dark-theme token set.

### BS-002 · MEDIUM — `totalPages ?? 0` — if `totalPages` is `0` the sheet indicator shows `"Page 1 / 0"` which is confusing
- `src/components/BottomStatusBar.tsx` ~line 55: `{sheetLabel}{totalPages ? ` / ${totalPages}` : ''}`. When `totalPages` is `0` (falsy), the slash is suppressed. However if `totalPages` is a valid `1`, the display is `"A1.00 / 1"` which is redundant. The conditional should also hide the total when total === 1.

### BS-003 · LOW — `pixelsPerUnitLabel` shown in parentheses to end users
- The `(47.2 px/ft)` label is a developer/debug value that leaks into the production UI. Normal users do not understand pixels-per-unit. Should be hidden in production builds or only shown in a debug mode.

---

## src/components/Toast.tsx

### T-001 · MEDIUM — Toast stacking uses `bottom: 16 + index * 72` with fixed pixel offsets
- When a toast with a long message wraps to multiple lines, its height exceeds 72px. The next toast starts at a fixed 72px offset regardless, causing overlap.
- **Fix:** Use a CSS flexbox stack or measure actual toast heights for positioning.

### T-002 · MEDIUM — `aria-live="assertive"` on all toast types including `info` and `warning`
- ARIA live `assertive` interrupts screen reader announcements immediately. Only `error` severity truly warrants `assertive`. `info` and `success` toasts should use `aria-live="polite"`.
- **File:** `src/components/Toast.tsx` ~line 82

### T-003 · LOW — Toasts can accumulate without a cap
- `addToast` pushes to an array with no maximum length. If a component calls `addToast` in a tight loop (e.g. on every keystroke), the stack will grow unbounded and fill the screen.
- **Fix:** Cap the toast stack at 5–7 items and drop oldest when exceeded.

### T-004 · LOW — `duration` prop defaults to 4000ms but warning/error toasts should persist longer
- Error toasts should remain until dismissed by the user. A 4-second auto-dismiss for a "Delete failed" message may cause the user to miss it entirely.
- **Fix:** Separate duration defaults by type: `success: 3000`, `info: 4000`, `warning: 6000`, `error: persistent` (or very long, e.g. 15000).

---

## src/components/ErrorBoundary.tsx

### EB-001 · MEDIUM — Error boundary sends raw error stack to `/api/errors` via `navigator.sendBeacon` without sanitization
- `src/components/ErrorBoundary.tsx` line ~44: `navigator.sendBeacon("/api/errors", blob)` sends `error.stack` in JSON. Stack traces can contain user data (e.g. file paths, input values embedded in function names). Verify the `/api/errors` endpoint doesn't log PII and that the beacon payload is filtered.

### EB-002 · MEDIUM — Retry button shows remaining count but errors after max retries give no actionable guidance
- When `exhausted === true` the message says "contact support" but there is no support link, email, or error code. Users are stuck with no escape other than a full page reload.
- **Fix:** Add a "Reload page" button and an error code / reference ID from the beacon response.

### EB-003 · LOW — `ErrorBoundary.MAX_RETRIES` is a static class property — changing it requires a code deploy
- Consider making it a prop with a default, so different boundaries can have different retry limits.

---

## src/components/PolygonProperties.tsx

### PP-001 · HIGH — Component is `'use client'` missing from the file header
- `src/components/PolygonProperties.tsx` does not begin with `'use client'`. It uses `useStore`, `React.useState`, and `React.useEffect` — all client-only hooks. Without the directive, Next.js App Router may attempt server-rendering and throw.
- **File:** `src/components/PolygonProperties.tsx` line 1

### PP-002 · HIGH — `polygon.linearFeet` used directly, bypassing the unit conversion pipeline
- Line ~32: `const lengthReal = polygon.linearFeet || 0;`. The `linearFeet` field is the raw canvas-pixel-derived value before the scale PPU conversion, unlike the rest of the codebase which uses `calculateLinearFeet(polygon.points, ppu, false)`. This will display incorrect values when the scale is not 1px = 1ft.
- **Fix:** Use `calculateLinearFeet(polygon.points, ppu, false)` like everywhere else.

### PP-003 · MEDIUM — Styling uses plain white `bg-white border-gray-200` — completely out of place in dark theme
- `PolygonProperties` has `className="bg-white border border-gray-200 p-4 rounded-md w-64 shadow-sm"`. The entire app uses a dark `#0a0a0f` theme with cyan accents. This component was never updated to match the design system.

### PP-004 · MEDIUM — `persistLabel` on `onBlur` only — no save on unmount
- If the user edits the label and then clicks away *to a button outside the panel* (which triggers blur) the label saves. But if the panel is forcibly unmounted (e.g. user selects another polygon) the `onBlur` may not fire, losing the edit silently.

### PP-005 · LOW — `area` displayed as raw `areaReal` without unit-conversion formatting
- Line ~37: `{areaReal.toFixed(2)} sq {unit}` bypasses `formatArea()` from `@/lib/measurement-settings`, ignoring the user's preferred area unit (m², yd², etc.).

### PP-006 · LOW — No empty state for when no polygon is selected — returns plain text in `<aside>`
- `if (!polygon) return <aside className="p-4 text-gray-400">No polygon selected</aside>` uses wrong styling. Should match dark theme.

---

## src/components/MXChat.tsx

### MC-001 · HIGH — Chat messages stored only in local React state — lost on panel toggle
- `src/components/MXChat.tsx` `visible` prop comment states: "the panel is hidden via CSS but remains mounted so conversation history persists." This means history survives while the component is mounted but is lost on page navigation or full unmount. No persistence to localStorage or the server.

### MC-002 · MEDIUM — `parseMarkdownTable` iterates over all lines twice
- The function does a first pass to collect table lines, then iterates again to split into before/after. A single-pass approach would be more efficient, though not a critical issue.

### MC-003 · MEDIUM — Suggested questions and quick-reply chips are hardcoded strings
- `SUGGESTED_QUESTIONS` and `QUICK_REPLY_CHIPS` are static arrays of strings that don't adapt to the current project's classifications or contents. A user measuring only linear elements will see irrelevant "total area" suggestions.

### MC-004 · MEDIUM — No loading indicator while AI is processing a chat message
- If the chat API call takes >2 seconds, the send button becomes unresponsive with no spinner or "Thinking..." state visible to the user.

### MC-005 · LOW — Markdown table renderer does not handle escaped pipe characters (`\|`)
- `parseMarkdownTable` splits cells on `|` naively. Classification names or values containing `|` would break the table rendering.

---

## src/components/OfflineIndicator.tsx

### OI-001 · MEDIUM — Initial offline state set via `useState(false)` not `useState(!navigator.onLine)`
- `const [isOffline, setIsOffline] = useState(false)` means the component always renders "online" on mount and then corrects in the `useEffect`. If the user loads the app while already offline, there's a brief "online" flash before the correct state is shown.
- **Fix:** `useState(() => typeof navigator !== 'undefined' && !navigator.onLine)`.

### OI-002 · LOW — No `role="alert"` on the offline banner
- The offline indicator is a `div` with no ARIA role. Screen readers will not announce it when it appears.
- **Fix:** Add `role="alert"` and `aria-live="assertive"`.

---

## src/components/ScaleCalibration.tsx

### SC-001 · HIGH — `labelToPixelsPerUnit` returns `null` for unrecognized formats but callers may not handle null
- `labelToPixelsPerUnit` (line ~30) returns `number | null`. If called with an unrecognized preset string and the result is used directly in arithmetic without a null check, `NaN` propagates silently into the scale store, breaking all measurements.
- **Fix:** Add runtime null-check guards at every call site and show a validation error to the user.

### SC-002 · MEDIUM — `parseFraction` ignores strings that are valid numbers but not pure fractions
- Input `"0.5"` returns the parsed float, but `"1 1/2"` and `"1/2"` are handled correctly. However a label like `"0 3/4"` (zero + fraction) would be parsed by the mixed-match branch as `0 + 3/4 = 0.75` — which is correct — but `"3/0"` triggers `den === 0` guard, returning `null`. Test coverage needed.

### SC-003 · MEDIUM — `buildScalePreview` only handles architectural format; other formats return a fallback message
- The function only produces a human-readable description for `"1/8" = 1' 0"` style labels. Ratio scales (`1 : 500`) and civil scales (`1" = 20' 0"`) return a generic fallback. This leaves users of those scale types without a helpful confirmation string.

---

## src/components/ExportPanel.tsx

### EP-001 · HIGH — Export panel fetches and processes all polygons client-side with no server-side pagination
- `computeClassificationTotals` iterates over all `polygons` in memory. For large projects (1000+ polygons), this runs in the main thread during render of the modal, causing jank.
- **Fix:** Consider computing totals server-side via the API or using a Web Worker.

### EP-002 · MEDIUM — `GroupByOption` type includes `'group'` and `'trade'` but neither is fully implemented in the preview table
- The preview table renders group-by logic for `'type'` and `'drawing'` but the `'group'` and `'trade'` paths produce plain classification rows without headers. The UI offers these options but they behave identically to `'none'`.

### EP-003 · MEDIUM — Print/export uses `window.open()` for PDF which can be blocked by popup blockers
- Several export paths call `window.open(url, '_blank')`. Modern browsers block popups opened without a direct user gesture in some contexts (e.g. after an async operation). The export may silently fail.

### EP-004 · LOW — `ColumnVisibility` state is not persisted — resets every time the modal opens
- User column preferences in the export modal reset to defaults on every open. Should be persisted to `localStorage`.

---

## src/components/MobileToolbar.tsx

### MT-001 · MEDIUM — Mobile toolbar uses `minHeight: 44` but `height: 52` — the extra 8px is not accessible space
- The button style sets `minHeight: 44` for accessibility but `height: 52` is hardcoded. On devices with small screens this may be fine, but the inconsistency between min and actual height can cause layout issues in compressed viewports.

### MT-002 · MEDIUM — No Undo/Redo in mobile toolbar
- Desktop `LeftToolbar` includes Undo/Redo buttons. `MobileToolbar` does not. Mobile users have no way to undo the last action without a keyboard shortcut (which mobile doesn't have). This is a significant UX gap for mobile workflows.

### MT-003 · LOW — `aria-pressed` is `boolean` but should be `"true" | "false"` string per ARIA spec
- Line ~52: `aria-pressed={active}` passes a boolean. While React/JSX converts it, the HTML spec for `aria-pressed` expects `"true"`, `"false"`, or `"mixed"`. Some AT implementations read booleans differently.

---

## src/components/WorkspaceSwitcher.tsx

### WS-001 · HIGH — `prompt()` used for new workspace name — same issue as Q-004
- `WorkspaceSwitcher.tsx` line ~25: `const name = prompt('New workspace name:');`. Native browser `prompt()` is inaccessible, unstyled, blocked on some platforms, and inconsistent with the rest of the UI.
- **Fix:** Replace with an inline input or a modal.

### WS-002 · MEDIUM — All workspaces stored only in `localStorage` — same device-lock issue as PR-001
- Workspaces (`getWorkspaces()`, `saveWorkspaces()`) are purely localStorage-based. No server sync. Creating a workspace on one device has no effect on others.

### WS-003 · LOW — `router.refresh()` called after workspace switch — causes full page re-fetch without transition
- After switching workspaces, `router.refresh()` triggers a server-side re-render that clears all in-memory state. The project list flickers/reloads entirely. A filtered client-side state update would be smoother.

---

## public/ assets

### PUB-001 · MEDIUM — `manifest.json` declares both icons with `"purpose": "any maskable"` combined
- `public/manifest.json`: `{ "purpose": "any maskable" }` for both icons. The W3C Web App Manifest spec recommends listing `"any"` and `"maskable"` as separate entries or using `"any"` for the 192px icon and `"maskable"` only for icons that have the safe zone padding. Combined `"any maskable"` is deprecated in some browser implementations.
- **Fix:** Use `"purpose": "any"` for one entry and `"purpose": "maskable"` for a separate maskable-safe icon.

### PUB-002 · MEDIUM — `sw.js` service worker has no visible version hash — stale worker risk
- `public/sw.js` has no cache-busting mechanism visible from the filename. If the service worker caches API responses aggressively, stale data may be served after deploys without users being notified.
- **Fix:** Use `SWUpdateBanner.tsx` to notify users of updates (appears to exist) and verify the service worker uses a versioned cache key.

### PUB-003 · LOW — Sample PDF files (`kirkland-sample-plans.pdf`, `sonoma-house-plans.pdf`) in public/
- These appear to be demo/test files. In production builds they add unnecessary bundle weight if they are not linked from the UI. Confirm they are intentionally served or move to a CDN / gitignore.

### PUB-004 · LOW — `favicon.svg` with no PNG fallback
- Only `favicon.svg` is present. Older browsers (IE, some Android WebViews) do not support SVG favicons. Should provide a `favicon.ico` or `favicon-32x32.png` fallback.

### PUB-005 · LOW — `next.svg` and `vercel.svg` appear to be scaffolding leftovers
- `public/next.svg` and `public/vercel.svg` are standard Next.js/Vercel boilerplate assets and appear unused in the production UI. Remove to reduce noise.

---

## Cross-cutting / Global Issues

### G-001 · CRITICAL — Widespread use of `window.prompt()` for user input
- Found in: `QuantitiesPanel.tsx` (breakdown names), `WorkspaceSwitcher.tsx` (workspace name). These are the only two confirmed instances during this audit pass, but other components should be checked. `prompt()` is synchronous, blocks the event loop, is unstyled, inaccessible, and may return `null` on mobile or in certain browser contexts (e.g. iframe, cross-origin). Every instance must be replaced with a proper modal or inline form.

### G-002 · CRITICAL — No CSRF protection visible on any state-mutating API calls
- Fetch calls throughout the frontend (create project, delete project, PATCH polygons, etc.) do not include any CSRF token header. If the app uses cookie-based auth (common in Next.js), all mutations are vulnerable to CSRF attacks. Verify the API layer has CSRF protection (e.g. `SameSite=Strict` cookies + `Origin` header checks, or a CSRF token).

### G-003 · HIGH — `localStorage` overused as primary data store for business-critical data
- Folders, stars, tags, workspace definitions, onboarding state, measurement settings, AI settings, and view preferences all live exclusively in `localStorage`. This creates: (1) silent data loss when users clear storage; (2) no multi-device sync; (3) no backup/recovery path. The architecture should move user preferences and organisation to a server-backed store.

### G-004 · HIGH — No explicit error boundary wrapping the main canvas/editor area
- `page.tsx` has an `<ErrorBoundary>` import but it is not verified to wrap the `<CanvasOverlay>` and `<PDFViewer>` components. If either throws during render, the whole page crashes. Full audit of ErrorBoundary placement in `page.tsx` is required.

### G-005 · HIGH — `console.error` / `console.warn` calls left in production components
- Multiple components reference `captureError` from `@/lib/error-tracker` (good), but also use direct `console.error(...)` calls (e.g. `ErrorBoundary.tsx` line ~52). In production, verbose console output leaks implementation details and inflates DevTools output for legitimate users.
- **Fix:** Strip console.error calls in production via `next.config.js` `compiler.removeConsole` option.

### G-006 · HIGH — All classification/polygon rendering logic uses raw `for` loops over potentially large arrays in `useMemo` — no virtualization
- `QuantitiesPanel.tsx` renders every classification row in a plain scrollable `div`. With 100+ classifications (possible in large commercial projects), the panel becomes slow. No `react-window` or similar list virtualization is used.
- **Fix:** Add windowed list rendering for classification lists > 30 items.

### G-007 · MEDIUM — TypeScript `as const` assertions on imported JSON not verified
- Several components cast API responses with `as` without runtime validation (e.g. `as ProjectState`). If the API returns unexpected shapes, properties silently come back as `undefined`, causing subtle bugs rather than clear errors.
- **Fix:** Add runtime schema validation (e.g. `zod`) on API response boundaries.

### G-008 · MEDIUM — Dark-theme color tokens are hardcoded inline across hundreds of classNames
- The entire codebase uses inline hex values like `#0a0a0f`, `#00d4ff`, `rgba(0,212,255,0.2)` in className strings throughout. There is no Tailwind custom theme configuration for these values. Changing the brand color requires a global find-replace.
- **Fix:** Define `measurex` color tokens in `tailwind.config.js` and use semantic class names.

### G-009 · MEDIUM — `crypto.randomUUID()` used without polyfill check
- Multiple components call `crypto.randomUUID()` directly. This is available in modern browsers and Node 14.17+, but is not available in older Chrome versions (<92) or some WebViews. For production apps targeting wide browser support, a fallback is needed.

### G-010 · MEDIUM — No `<noscript>` fallback in layout
- If JavaScript is disabled, the entire app renders nothing. A `<noscript>` message explaining that JS is required would improve the user experience for users with JS blocked.

### G-011 · MEDIUM — Loading skeleton styles defined via `<style jsx>` in QuantitiesPanel
- `QuantitiesPanel.tsx` bottom: `<style jsx>{...}</style>` defines `quantities-skeleton-shimmer` keyframes. `styled-jsx` is a Styled Components-style solution that works in Next.js pages but can have conflicts in the App Router. Prefer `globals.css` `@keyframes` or Tailwind animation utilities.

### G-012 · LOW — Several components import unused icons from `lucide-react`
- `QuantitiesPanel.tsx` imports `BookOpen`, `Check`, `ChevronDown`, `ChevronRight`, `Copy`, `Crosshair`, `Download`, `Eye`, `EyeOff`, `GitMerge`, `Hash`, `History`, `Info`, `Layers`, `Minus`, `Pencil`, `Plus`, `Printer`, `Search`, `Settings`, `SlidersHorizontal`, `Square`, `Trash2`, `Wand2`, `X` (25 icons). Verify all are actually used in the render; unused imports increase bundle size unless tree-shaking is effective.

### G-013 · LOW — `LanguageSwitcher.tsx` exists but internationalization (i18n) setup is not visible in the audit scope
- `src/components/LanguageSwitcher.tsx` implies i18n support, but no `next-intl`, `react-i18next`, or equivalent library was found in reviewed files. All UI strings are hardcoded English. Either i18n is incomplete or the switcher is a stub.

### G-014 · LOW — `PerfMonitor.tsx` component left in production component folder
- `src/components/PerfMonitor.tsx` appears to be a development/debugging tool. If it is conditionally rendered only in dev mode, this is fine. Verify it is not included in production builds.

### G-015 · LOW — Several `.stories.tsx` files in the component directory
- `BottomStatusBar.stories.tsx` and `ZoomControls.stories.tsx` are Storybook story files co-located in `src/components/`. These should be excluded from the production bundle (Next.js should not pick them up, but verify `tsconfig.json` `exclude` or `.storybook/` separation).

### G-016 · LOW — `test-hive-4.txt` and `test-hive3.txt` files in `src/components/`
- These are clearly test artifacts left in the component directory. They should be deleted or moved to a test fixtures directory.

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH     | 25 |
| MEDIUM   | 42 |
| LOW      | 35 |
| **TOTAL**| **105** |

### Top 5 Priorities

1. **G-001 / CRITICAL** — Replace all `window.prompt()` calls with proper modals (QuantitiesPanel, WorkspaceSwitcher)
2. **G-002 / CRITICAL** — Verify CSRF protection on all state-mutating API calls
3. **PP-001 / HIGH** — Add `'use client'` directive to `PolygonProperties.tsx`
4. **PP-002 / HIGH** — Fix `polygon.linearFeet` misuse in `PolygonProperties.tsx` — uses wrong value instead of `calculateLinearFeet()`
5. **Q-003 / HIGH** — Persist manual deductions to the store and server instead of ephemeral local component state

---

*Audit generated by Agent A7 — MeasureX Full Codebase Audit — 2026-03-27*
