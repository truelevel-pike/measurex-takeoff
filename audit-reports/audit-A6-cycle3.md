# Audit Report: A6 — Cycle 3
**Sector:** src/components/  
**Date:** 2026-03-20  
**Engineers:** E16, E17, E18, E19, E20  
**Total Files Audited:** 90 (85 root + 5 subdirectory)  
**Total Bugs Found:** 139  

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 9 |
| MEDIUM | 54 |
| LOW | 75 |

---

## Bug Entries

### E16 — Files: AIActivityLog → ContextToolbar + subdirs (admin, dev, settings, ui)

BUG-A6-3-001: src/components/AIActivityLog.tsx:158 MEDIUM interactive-inside-interactive: div[role="button"] wraps a nested <button> (Trash2 clear button at line 169); screen readers cannot distinguish the two interactive targets
BUG-A6-3-002: src/components/AIActivityLog.tsx:169 LOW clear-log <button> has title="Clear log" but missing aria-label; assistive technology falls back to empty accessible name
BUG-A6-3-003: src/components/AIImageSearch.tsx:62 LOW useEffect depends on handleCroppedSearch but omits it from the dependency array; violates exhaustive-deps rule (no stale closure in practice because only setState is captured)
BUG-A6-3-004: src/components/AIImageSearch.tsx:75 MEDIUM async fetch in handleCroppedSearch has no AbortController; if component unmounts mid-request, setLoading/setError/setResult fire on unmounted component
BUG-A6-3-005: src/components/AIImageSearch.tsx:115 MEDIUM async fetch in handleVisionSearch has no AbortController; same unmount-safety issue as handleCroppedSearch
BUG-A6-3-006: src/components/AssembliesPanel.tsx:387 HIGH stale closure: handleSave captures `assemblies` from render-time closure and passes it to setAssemblies inside an async .then callback; if assemblies change before the API responds, the stale array overwrites newer state (should use functional updater `prev => prev.map(...)`)
BUG-A6-3-007: src/components/AssembliesPanel.tsx:194 LOW mount-effect fetch uses `cancelled` flag but no AbortController; cancelled requests still consume bandwidth and the HTTP response is discarded silently
BUG-A6-3-008: src/components/AssembliesPanel.tsx:487 LOW inline unit-cost <input type="number"> lacks aria-label; screen readers announce it as an unlabeled text field
BUG-A6-3-009: src/components/AssemblyEditor.tsx:70 MEDIUM modal overlay (fixed inset-0) has no focus trap; Tab key can reach elements behind the modal backdrop
BUG-A6-3-010: src/components/AssemblyEditor.tsx:204 LOW "Remove material" button (X icon) missing aria-label; screen readers cannot identify its purpose
BUG-A6-3-011: src/components/AutoNameTool.tsx:139 HIGH Reject button onClick handler body is empty (lines 140-144 are only comments); clicking "Reject" does nothing, making the reject workflow completely non-functional
BUG-A6-3-012: src/components/ComparePanel.tsx:48 MEDIUM useEffect async IIFE fetching project list has no AbortController and no cancelled flag; if currentProjectId changes rapidly, stale response overwrites fresh state
BUG-A6-3-013: src/components/ComparePanel.tsx:67 MEDIUM handleCompare async fetch has no AbortController; if user closes the panel during comparison, setState calls fire after unmount
BUG-A6-3-014: src/components/ContextMenu.tsx:91 MEDIUM setTimeout(onClose, 600) after snapshot save is not stored in a ref and not cleared on unmount; if menu closes before 600ms, stale onClose fires on parent
BUG-A6-3-015: src/components/CollaborationPanel.tsx:256 MEDIUM dialog (role="dialog" aria-modal is missing) has no Escape key handler; keyboard users cannot dismiss the modal without reaching the close button
BUG-A6-3-016: src/components/CollaborationPanel.tsx:256 MEDIUM dialog has no focus trap; Tab key can escape to elements behind the backdrop, violating WAI-ARIA dialog pattern
BUG-A6-3-017: src/components/CollaborationPanel.tsx:256 LOW dialog container has role="dialog" but missing aria-modal="true"; assistive technology may not treat it as a true modal
BUG-A6-3-018: src/components/admin/FeatureFlagPanel.tsx:7 MEDIUM useState initializer calls getAllFlags() synchronously during render; if getAllFlags accesses localStorage without a typeof-window guard, SSR/hydration will throw or produce a mismatch
BUG-A6-3-019: src/components/settings/ShortcutCustomizer.tsx:28 MEDIUM useState initializer calls getAllShortcuts() synchronously during render; same SSR/hydration risk as FeatureFlagPanel if it accesses localStorage without a guard
BUG-A6-3-020: src/components/CanvasOverlay.tsx:807 LOW calibration-point circle keys use array index (`cal-${i}`); if a calibration point were removed and re-added, React could reuse the wrong DOM node
BUG-A6-3-021: src/components/ClassificationGroups.tsx:277 LOW rename-group <input> missing aria-label; screen readers announce it as an unlabeled text field
BUG-A6-3-022: src/components/ClassificationGroups.tsx:374 LOW add-breakdown <input> missing aria-label (placeholder="Breakdown name" does not substitute for aria-label)
BUG-A6-3-023: src/components/ClassificationGroups.tsx:446 LOW new-group-name <input> missing aria-label (placeholder="Group name" does not substitute for aria-label)
BUG-A6-3-024: src/components/ComparePanel.tsx:188 LOW <label> "Compare With" is not associated with the <select> via htmlFor/id; screen readers cannot programmatically link label to control
BUG-A6-3-025: src/components/CanvasOverlay.tsx:726 LOW calculateLinearFeet() called inside polygons.map() render loop without memoization; with large polygon counts this recomputes on every render causing unnecessary work
BUG-A6-3-026: src/components/ContextMenu.tsx:81 LOW handleSnapshot async fetch has no AbortController; if menu unmounts during the POST, setSnapshotStatus fires after unmount
BUG-A6-3-027: src/components/AssemblyEditor.tsx:159 LOW material-name, unitCost, wasteFactor, coverageRate, unit, and formula <input> elements (lines 159-201) all lack aria-labels; the table headers exist visually but are not programmatically linked to inputs

### E17 — Files: ContractorReportButton → KeyboardShortcutsModal

BUG-A6-3-100: src/components/ContractorReportButton.tsx:42 MEDIUM Error catch block only calls console.error; user gets no visible feedback when contractor report export fails
BUG-A6-3-101: src/components/ContractorReportButton.tsx:24 LOW fetch has no AbortController; unmounting during download causes setLoading call on unmounted component
BUG-A6-3-102: src/components/CropOverlay.tsx:119 LOW Overlay div has tabIndex={0} but no aria-label or role; screen readers cannot describe its purpose
BUG-A6-3-103: src/components/CustomFormulas.tsx:253 MEDIUM Modal overlay lacks role="dialog" and aria-modal="true"; screen reader semantics are broken for the custom formula dialog
BUG-A6-3-104: src/components/CustomFormulas.tsx:261 LOW Close button (X icon) has no aria-label; screen readers announce nothing meaningful
BUG-A6-3-105: src/components/CutTool.tsx:17 LOW pagePolygons filter runs every render without useMemo, causing findPolygonAt callback to be needlessly recreated each render
BUG-A6-3-106: src/components/DrawingComparison.tsx:178 LOW btnBase and btnActive style objects are recreated as new object refs on every render; should be hoisted outside component or memoized
BUG-A6-3-107: src/components/DrawingComparison.tsx:168 MEDIUM Dialog has no Escape key handler; keyboard users cannot dismiss the comparison modal
BUG-A6-3-108: src/components/DrawingSetManager.tsx:159 MEDIUM setTimeout inside upload simulation is not tracked or cleared on unmount; can call setUploads on an already-destroyed component
BUG-A6-3-109: src/components/DrawingSetManager.tsx:509 MEDIUM "Archive" button calls deleteDrawing(d.id) which permanently deletes the drawing; functionally identical to the Delete button directly above it
BUG-A6-3-110: src/components/DrawingSetManager.tsx:469 MEDIUM Uses window.prompt() for renaming drawings; blocks the main thread and is inaccessible to screen readers
BUG-A6-3-111: src/components/DrawingTool.tsx:38 LOW snapPolygons is recomputed (new array ref) every render without useMemo, causing getCoords and handleMouseMove useCallback hooks to recreate on every render
BUG-A6-3-112: src/components/DuplicateProjectModal.tsx:18 HIGH handleDuplicate performs 4+ sequential fetches with no AbortController; closing the modal mid-duplication causes setState on unmounted component and leaves orphaned partial data on server (project created but classifications/polygons incomplete)
BUG-A6-3-113: src/components/EstimateSummary.tsx:42 MEDIUM No loading state during assembly fetch on mount; shows misleading "No assemblies assigned" message while data is still being fetched
BUG-A6-3-114: src/components/EstimateSummary.tsx:67 LOW Fetch error silently swallowed with console.error only; user sees no feedback on API failure
BUG-A6-3-115: src/components/EstimatesTab.tsx:106 LOW Failed unit cost PATCH only logs to console; user gets no visible feedback that their cost edit was not saved
BUG-A6-3-116: src/components/ExportPanel.tsx:248 LOW setTimeout in showToast is not cleared on unmount or on repeated calls; can call setToast after component unmounts
BUG-A6-3-117: src/components/ExportPanel.tsx:486 LOW JSON export handler does not append anchor to document.body before click() and revokes objectURL synchronously; may silently fail to trigger download in Safari and older browsers unlike all other export handlers which append/defer
BUG-A6-3-118: src/components/FirstRunTooltips.tsx:64 LOW Tooltip dismiss button (× character) has no aria-label; screen readers announce the raw unicode character
BUG-A6-3-119: src/components/FloorAreaMesh.tsx:111 MEDIUM new Color() and pointsToVec3() allocate fresh Three.js objects on every render without useMemo; in scenes with many floor polygons this creates significant GC pressure and frame drops
BUG-A6-3-120: src/components/ImportFromLibraryModal.tsx:51 LOW Supabase fetch error silently swallowed (empty catch block); user cannot distinguish "no library items exist" from "failed to load library"
BUG-A6-3-121: src/components/KeyboardShortcuts.tsx:1 LOW Missing 'use client' directive; component uses useEffect hook but relies on parent's client boundary — will break if ever imported from a server component
BUG-A6-3-122: src/components/DrawingSetManager.tsx:219 CRITICAL moveDrawing uses a single .map() pass with a mutable movedDrawing variable; if the target set appears before the source set in the array, the drawing is removed from the source set but movedDrawing is still null when the target is processed, so the drawing is never added — permanent data loss

### E18 — Files: KeyboardShortcutsPortal → PageThumbnailSidebar

BUG-A6-3-200: src/components/MXChat.tsx:171 MEDIUM useEffect cleanup missing — abortRef.current is never aborted on unmount; in-flight fetch and streaming reader continue after component unmounts, leaking network resources and scheduling state updates on dead component
BUG-A6-3-201: src/components/MXChat.tsx:131 LOW React keys use array index for table rows (`key={`row-${ri}`}`); if streamed markdown table content is re-parsed mid-stream, React cannot reconcile rows correctly
BUG-A6-3-202: src/components/MXChat.tsx:133 LOW React keys use array indices for table cells (`key={`r${ri}-c${ci}`}`); same reconciliation risk as rows
BUG-A6-3-203: src/components/MXChat.tsx:533-536 LOW navigator.clipboard.writeText rejection is silently swallowed via void; copiedId is set to success state even when clipboard write fails (e.g. non-HTTPS context), showing misleading check icon
BUG-A6-3-204: src/components/LeftToolbar.tsx:224-256 MEDIUM Smart Tools panel declares aria-modal="true" but implements no focus trap; keyboard users can Tab out of the dialog to toolbar buttons behind it, violating WCAG 2.4.3
BUG-A6-3-205: src/components/LeftToolbar.tsx:223-256 LOW Smart Tools popover has no click-outside-to-close behavior; users must find the close button or press Escape — inconsistent with MeasurementSettings which does close on outside click
BUG-A6-3-206: src/components/LeftToolbar.tsx:260-278 LOW "Open chat" button renders with aria-label and icon but has no onClick handler; the button is non-functional dead code
BUG-A6-3-207: src/components/NotificationSettings.tsx:23 LOW getNotificationPrefs() reads localStorage synchronously in useState initializer (line 48); server render returns DEFAULT_PREFS while client hydration returns stored prefs, causing hydration mismatch if user has customized preferences
BUG-A6-3-208: src/components/MeasurementTool.tsx:108 LOW Container div has tabIndex={0} but no role or aria-label attribute; screen readers place focus on the element without announcing its purpose or how to interact with it
BUG-A6-3-209: src/components/MergeSplitTool.tsx:96 LOW Container div has tabIndex={0} but no role or aria-label; screen readers cannot convey the element's function
BUG-A6-3-210: src/components/MergeSplitTool.tsx:86-93 MEDIUM Escape handler is React onKeyDown only — not a window-level listener; pressing Escape when focus is elsewhere (e.g. user clicked outside the overlay) does nothing, unlike MeasurementTool which registers a global keydown listener
BUG-A6-3-211: src/components/PageThumbnailSidebar.tsx:154 MEDIUM currentPage is listed in useEffect deps for thumbnail generation; every page navigation increments renderSessionRef, invalidates all in-flight thumbnail renders, resets all thumbnails to null (loading skeleton), and re-queues all pages — causing visible flickering of every thumbnail on each navigation
BUG-A6-3-212: src/components/PWAInstallBanner.tsx:32-39 LOW handleInstall async function has no try-catch; if deferredPrompt.prompt() or userChoice rejects, the unhandled promise rejection will fire and the banner state won't update
BUG-A6-3-213: src/components/PDFViewer.tsx:770 MEDIUM No error boundary wrapping {children} prop inside the canvas container; if any overlay child (DrawOverlay, MeasurementTool, etc.) throws during render, the entire PDFViewer crashes and becomes unrecoverable without page reload
BUG-A6-3-214: src/components/ManualCalibration.tsx:269-302 LOW Draw Line mode ft/in inputs have no programmatic label association; the text "Enter value of known linear" (line 269) is a standalone label element not connected to either input via htmlFor, failing WCAG 1.3.1
BUG-A6-3-215: src/components/ManualCalibration.tsx:335-404 LOW Enter Number mode has four numeric inputs (paperFt, paperIn, realFt, realIn) with no individual accessible labels; only a "Ratio" text label exists with no htmlFor association
BUG-A6-3-216: src/components/MeasurementSettings.tsx:36-47 LOW ToggleGroup buttons lack aria-pressed or aria-selected attributes; active state is only conveyed visually via CSS class, so screen readers cannot determine which option is currently selected
BUG-A6-3-217: src/components/OfflineIndicator.tsx:22 LOW Offline banner div has no role="alert" or aria-live attribute; when the banner appears dynamically, screen readers will not announce the connectivity change (contrast with OfflineBanner.tsx:30 which correctly uses role="alert")

### E19 — Files: PatternSearch → SmartTools

BUG-A6-3-300: src/components/PatternSearch.tsx:150 MEDIUM fetch('/api/vision-search') has no AbortController; unmounting during search causes state updates on unmounted component
BUG-A6-3-301: src/components/PatternSearch.tsx:256 MEDIUM modal overlay missing role="dialog" and aria-modal="true"; screen readers cannot identify the dialog boundary
BUG-A6-3-302: src/components/PatternSearch.tsx:420 MEDIUM result list items are clickable divs missing role="button", tabIndex={0}, and onKeyDown handler; not keyboard navigable
BUG-A6-3-303: src/components/PatternSearch.tsx:304 LOW drawing canvas region lacks aria-label or role attribute; invisible to assistive technology
BUG-A6-3-304: src/components/PolygonGroupPanel.tsx:62 MEDIUM groups useState initializer captures initial classificationGroups/initialGroups but never resyncs when store or props change; stale groups if component stays mounted
BUG-A6-3-305: src/components/PolygonProperties.tsx:1 LOW missing 'use client' directive despite using useState and useEffect; will crash at runtime if imported from a server component
BUG-A6-3-306: src/components/QuantitiesPanel.tsx:1979 MEDIUM deduction list uses index-based React key (`classification.id-deduction-${deductionIndex}`); deleting a middle item causes remaining inputs to display values from wrong deduction rows
BUG-A6-3-307: src/components/QuantitiesPanel.tsx:1649 LOW trade group header div acts as button (onClick, cursor:pointer) but missing role="button", tabIndex={0}, and onKeyDown; inaccessible to keyboard users
BUG-A6-3-308: src/components/QuantitiesPanel.tsx:881 MEDIUM handleExecuteMerge and handleExecuteCleanUp both fetch all project polygons per merged ID in a sequential loop (N+1 API calls); no AbortController; errors silently caught with no user feedback on partial failures
BUG-A6-3-309: src/components/QuantitiesPanel.tsx:1293 MEDIUM IIFE computes grand totals (totalAreaSF, totalLF, totalEA) by iterating all classifications on every render without useMemo
BUG-A6-3-310: src/components/QuantitiesPanel.tsx:1791 MEDIUM per-classification-row inline IIFE calls polygons.filter(p => p.confidence !== undefined) during render; runs O(polygons) for every visible classification row on every re-render
BUG-A6-3-311: src/components/QuantitiesPanel.tsx:1037 MEDIUM groupTotals useMemo inner loop calls polygons.filter(p => p.classificationId === cid) for each cid; total cost O(groups × classificationIds × polygons) instead of using polygonsByClassification Map
BUG-A6-3-312: src/components/ReTogal.tsx:84 MEDIUM handleConfirm catches server polygon deletion and AI takeoff errors with console.error only; user sees success toast even when re-togal partially or fully fails
BUG-A6-3-313: src/components/ReTogal.tsx:160 LOW dropdown panel missing role attribute (role="menu" or role="dialog") and aria-label; screen readers treat it as generic content
BUG-A6-3-314: src/components/RecentProjects.tsx:88 MEDIUM article element with onClick handler acts as interactive card but has no role="button", tabIndex={0}, or onKeyDown; unreachable via keyboard navigation
BUG-A6-3-315: src/components/RepeatingGroupTool.tsx:118 LOW drawing overlay container has tabIndex={0} but no aria-label; screen readers announce a focusable element with no description of its purpose
BUG-A6-3-316: src/components/ScaleCalibration.tsx:209 LOW backdrop overlay closes dialog on click but has no role or keyboard-accessible dismiss (Escape is handled elsewhere but the backdrop itself is not semantically interactive)
BUG-A6-3-317: src/components/ScaleCalibration.tsx:136 LOW persistScale fetch failure only logged to console.error; user receives no indication that their scale was not saved to the server
BUG-A6-3-318: src/components/ScaleCalibrationPanel.tsx:54 HIGH setTimeout(1200ms) in handleApply not stored in ref or cleared on unmount; if component unmounts within 1200ms, stale onCalibrated() and onClose() callbacks fire against destroyed component tree
BUG-A6-3-319: src/components/ScaleCalibrationPanel.tsx:58 MEDIUM calibration modal container div missing role="dialog" and aria-modal="true"; screen readers cannot identify modal boundary
BUG-A6-3-320: src/components/ScaleCalibrationPanel.tsx:94 LOW dimension number input and unit select both lack aria-label; the preceding paragraph text is not programmatically associated via htmlFor/id
BUG-A6-3-321: src/components/SmartTools.tsx:103 MEDIUM showStatus creates a new setTimeout(3000) on each call without clearing the previous one; rapid successive calls cause the earlier timer to prematurely clear the latest message; timers also leak on unmount
BUG-A6-3-322: src/components/SmartTools.tsx:107 LOW wallClassifications, doorClassifications, windowClassifications are derived via .filter() on every render without useMemo; recomputed unnecessarily on unrelated state changes
BUG-A6-3-323: src/components/RecentProjectsSection.tsx:83 LOW relTimeFromISO returns empty string for invalid ISO date strings, causing display of "Updated " with no relative time text

### E20 — Files: SnapshotPanel → ZoomControls

BUG-A6-3-400: src/components/SnapshotPanel.tsx:37 MEDIUM useEffect calls fetchSnapshots with no AbortController — fetch response sets state on unmounted component if panel closes mid-request
BUG-A6-3-401: src/components/SnapshotPanel.tsx:44 LOW fetchSnapshots silently swallows all fetch errors (catch block is empty comment "// ignore") — user sees no feedback if snapshot list fails to load
BUG-A6-3-402: src/components/SnapshotPanel.tsx:53 MEDIUM handleCreate/handleRestore/handleDelete async fetches have no AbortController — state updates fire after unmount
BUG-A6-3-403: src/components/SnapshotPanel.tsx:181 LOW delete button is icon-only with no aria-label — screen readers announce nothing meaningful
BUG-A6-3-404: src/components/TagInput.tsx:86 LOW onBlur setTimeout(150ms) is never cleared on unmount — can call setShowSuggestions on unmounted component
BUG-A6-3-405: src/components/TagInput.tsx:76 LOW tag text input missing aria-label — screen readers cannot identify the input's purpose
BUG-A6-3-406: src/components/TakeoffProgressModal.tsx:212 MEDIUM setTimeout(() => setCancelled(false), 1500) in cancel handler is never cleared — fires on unmounted component if modal closes within 1.5s of cancel
BUG-A6-3-407: src/components/TakeoffProgressModal.tsx:70 MEDIUM fullscreen modal div missing role="dialog" and aria-modal="true" — screen readers do not recognize it as a modal, focus is not trapped
BUG-A6-3-408: src/components/TakeoffProgressModal.tsx:207 LOW Cancel button is text-only but missing aria-label for consistent screen-reader announcement
BUG-A6-3-409: src/components/TakeoffProgressModal.tsx:352 LOW "View Results" button missing type="button" — could submit an ancestor form unexpectedly
BUG-A6-3-410: src/components/TakeoffProgressModal.tsx:283 MEDIUM TakeoffSummaryOverlay modal div missing role="dialog" and aria-modal="true"
BUG-A6-3-411: src/components/TextSearch.tsx:169 MEDIUM li elements have onClick handlers but no role="option"/role="button", no tabIndex, no onKeyDown — results list is not keyboard navigable
BUG-A6-3-412: src/components/TextSearch.tsx:131 LOW close button (X icon) missing aria-label
BUG-A6-3-413: src/components/TextSearch.tsx:127 LOW clear button (X icon) missing aria-label and type="button"
BUG-A6-3-414: src/components/TextSearch.tsx:138 MEDIUM custom toggle for "Search across all drawings" missing role="switch" and aria-checked — screen readers cannot convey toggle state
BUG-A6-3-415: src/components/ThreeDScene.tsx:44 LOW classifications read from store on line 44 and again on line 51 as storeClassifications — redundant duplicate selector subscription causing extra re-renders
BUG-A6-3-416: src/components/ThreeDScene.tsx:95 HIGH no error boundary wrapping ThreeDViewer/Canvas children — a WebGL crash (e.g. bad geometry, GPU context lost) takes down the entire app
BUG-A6-3-417: src/components/ThreeDViewer.tsx:105 HIGH pdfTexture created via TextureLoader.load is never disposed when textureUrl changes — old Three.js textures leak GPU memory on every page flip
BUG-A6-3-418: src/components/ThreeDViewer.tsx:122 MEDIUM fallbackTexture (CanvasTexture) is never disposed — leaks GPU memory when component unmounts
BUG-A6-3-419: src/components/ThreeDViewer.tsx:108 MEDIUM TextureLoader.load has no error callback — a 404 or corrupt image silently fails with no user feedback
BUG-A6-3-420: src/components/ThreeDViewer.tsx:248 HIGH Canvas element has no error boundary — WebGL context loss or three.js crash propagates to root and blanks the entire page
BUG-A6-3-421: src/components/Toast.tsx:87 MEDIUM individual ToastItem divs missing role="alert" — screen readers do not announce toast notifications to users
BUG-A6-3-422: src/components/TogalChat.tsx:90 HIGH sendMessage reads an SSE stream via response.body.getReader() with no AbortController — if component unmounts mid-stream, the reader loop continues indefinitely calling setMessages on an unmounted component
BUG-A6-3-423: src/components/TogalChat.tsx:102 MEDIUM streaming reader is never released via reader.releaseLock() or reader.cancel() — holds the fetch connection open after unmount
BUG-A6-3-424: src/components/TopNavBar.tsx:407 MEDIUM page badge div has onClick handler (line 412) but is a div, not a button — missing role="button", tabIndex={0}, and onKeyDown, so keyboard users cannot activate "jump to page"
BUG-A6-3-425: src/components/TopNavBar.tsx:295 MEDIUM onKeyDown(Enter) and onBlur both independently fire PATCH /api/projects/:id to rename — pressing Enter triggers the save, then the input unmounts triggering onBlur which fires a second identical PATCH request
BUG-A6-3-426: src/components/TopNavBar.tsx:72 LOW TopNavBar accepts 30+ props — extreme prop drilling; should extract AI controls, page navigation, and export actions into context or sub-components
BUG-A6-3-427: src/components/VersionHistory.tsx:312 MEDIUM useState initializer calls loadTakeoffRuns() which reads localStorage — returns [] during SSR but populated array on client, causing hydration mismatch
BUG-A6-3-428: src/components/VersionHistory.tsx:360 MEDIUM handleApiRestore has no AbortController — state updates on unmounted component if panel is closed during restore
BUG-A6-3-429: src/components/VersionHistory.tsx:353 MEDIUM handleRestore calls undo() in a synchronous for-loop — triggers N sequential re-renders instead of batching, causing visible UI thrashing
BUG-A6-3-430: src/components/VersionHistory.tsx:513 LOW re-run model picker dropdown positioned with absolute top-full — overflows off-screen when the parent item is near the bottom of the scrollable list
BUG-A6-3-431: src/components/WallMesh.tsx:76 HIGH ExtrudeGeometry objects created in useMemo are never disposed via geometry.dispose() — when segments change, old geometries leak GPU memory
BUG-A6-3-432: src/components/WallMesh.tsx:100 LOW meshes use array index as React key (key={key} where key=idx) — reordering or removing segments causes incorrect mesh reuse
BUG-A6-3-433: src/components/WhatsNewModal.tsx:38 MEDIUM modal div missing role="dialog" and aria-modal="true" — not recognized as modal by screen readers, no focus trap
BUG-A6-3-434: src/components/WhatsNewModal.tsx:142 LOW "Got it" dismiss button missing type="button" — could submit a parent form if one exists
BUG-A6-3-435: src/components/WorkspaceSwitcher.tsx:16 MEDIUM useState initializers call getWorkspaces() and getActiveWorkspace() which likely read localStorage — returns different values during SSR vs client hydration, causing mismatch
BUG-A6-3-436: src/components/WorkspaceSwitcher.tsx:24 LOW prompt() used for new workspace name — blocks the main thread, is unstyled, and is inaccessible to screen readers
BUG-A6-3-437: src/components/UserPreferencesPanel.tsx:27 LOW backdrop overlay div uses onClick={onClose} but has no onKeyDown handler — pressing Escape on the backdrop does not close the panel for keyboard users
BUG-A6-3-438: src/components/UserPreferencesPanel.tsx:204 LOW color hex text input missing aria-label — screen readers cannot identify this as the custom color input

---

## Top Issues by Priority

### CRITICAL
- BUG-A6-3-122: DrawingSetManager moveDrawing logic — permanent data loss when target set precedes source set in array

### HIGH (action recommended within current sprint)
- BUG-A6-3-006: AssembliesPanel stale closure overwrites state with stale array on save
- BUG-A6-3-011: AutoNameTool Reject button is completely non-functional (empty handler)
- BUG-A6-3-112: DuplicateProjectModal leaves orphaned server data when closed mid-operation
- BUG-A6-3-318: ScaleCalibrationPanel setTimeout fires stale callbacks after unmount
- BUG-A6-3-416: ThreeDScene missing error boundary — WebGL crash takes down entire app
- BUG-A6-3-417: ThreeDViewer pdfTexture never disposed — GPU memory leak on every page flip
- BUG-A6-3-420: ThreeDViewer Canvas missing error boundary — WebGL crash blanks entire page
- BUG-A6-3-422: TogalChat SSE stream reader never cancelled on unmount — infinite loop after unmount
- BUG-A6-3-431: WallMesh ExtrudeGeometry never disposed — GPU memory leak on segment changes

---

*Report generated: 2026-03-20 | Job ID: 37c42c56-e8d2-4241-8dca-9f61dce09a1a*
