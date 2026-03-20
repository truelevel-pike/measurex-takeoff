# CYCLE 3 AUDIT — SECTOR: DRAWING TOOLS + STORES + HOOKS
**Report:** audit-A7-cycle3.md  
**Repo:** measurex-takeoff  
**Date:** 2026-03-20  
**Engineers:** E26–E30  
**Files audited:** src/lib/store.ts, src/hooks/* (4 hooks), src/components/DrawingTool.tsx, CanvasOverlay.tsx, AnnotationTool.tsx, CutTool.tsx, CropOverlay.tsx, FloorAreaMesh.tsx, MarkupTools.tsx, ManualCalibration.tsx, AutoScalePopup.tsx, ScaleCalibration.tsx, ScaleCalibrationPanel.tsx, ScalePanel.tsx, MeasurementTool.tsx, MergeSplitTool.tsx, ThreeDScene.tsx, src/lib/polygon-utils.ts, snap-utils.ts, auto-scale.ts, polygon-groups.ts

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 9     |
| MEDIUM   | 54    |
| LOW      | 39    |
| **TOTAL**| **103** |

---

## Engineer E26 — Store + Hooks

BUG-A7-3-001: src/lib/store.ts:599 HIGH cutPolygon ignores the cutShape parameter entirely (void cutShape) and unconditionally deletes the polygon — user data is silently destroyed instead of geometrically cut
BUG-A7-3-002: src/lib/store.ts:671 HIGH hydrateState does not reset groups, assemblies, markups, repeatingGroups, sheetNames, drawingSets, or pageBaseDimensions — stale data from a previously loaded project leaks into the newly hydrated project on project switch
BUG-A7-3-003: src/lib/store.ts:630 MEDIUM setScaleForPage unconditionally sets the active `scale` field to the provided scale regardless of currentPage — calibrating a non-current page overwrites the current page's active scale, corrupting area calculations
BUG-A7-3-004: src/lib/store.ts:822 MEDIUM addGroup/updateGroup/deleteGroup/reorderGroups/moveClassificationToGroup/addBreakdown/deleteBreakdown do not push undo snapshots even though groups are included in HistorySnapshot — group operations are not individually undoable and get silently reverted when undoing unrelated polygon/classification edits
BUG-A7-3-005: src/lib/store.ts:766 MEDIUM addAssembly/updateAssembly/deleteAssembly do not push undo snapshots even though assemblies are in HistorySnapshot — assembly changes are silently reverted when undoing unrelated operations
BUG-A7-3-006: src/lib/store.ts:781 MEDIUM addMarkup/deleteMarkup/clearMarkups do not push undo snapshots even though markups are in HistorySnapshot — markup changes are silently reverted when undoing unrelated operations
BUG-A7-3-007: src/lib/store.ts:217 MEDIUM snapshot() calls structuredClone on all polygons, classifications, annotations, groups, assemblies, and markups on every single mutation; with 50 undo entries and 1000+ polygons each with many points, this causes O(n) deep copies per edit and significant memory bloat
BUG-A7-3-008: src/lib/store.ts:614 MEDIUM setScale and setScaleForPage accept any pixelsPerUnit value including 0, negative, or NaN without validation — downstream division by pixelsPerUnit produces Infinity/NaN area calculations
BUG-A7-3-009: src/lib/store.ts:276 MEDIUM addClassification throws Error on empty name or invalid color while all other mutations silently return on invalid input — an uncaught throw from a store action during render crashes the React component tree
BUG-A7-3-010: src/hooks/use-feature-flag.ts:21 MEDIUM fetchFlags catch handler returns empty object {} and clears fetchPromise but not cachedFlags — all consumers call setEnabled(false) on any transient network error, silently disabling every feature flag with no retry or stale-while-revalidate fallback
BUG-A7-3-011: src/hooks/use-feature-flag.ts:42 MEDIUM useEffect deps array is [flag] with no TTL-expiry dependency — already-mounted components never re-run the effect after cache expires, so they display stale flag values indefinitely until unmount/remount
BUG-A7-3-012: src/hooks/useRealtimeSync.ts:15 MEDIUM connectedRef guard prevents reconnection if SSE connection is externally closed — if ws-client's disconnectFromProject() is called by another module, the hook's ref still equals projectId and skips reconnection until projectId prop changes
BUG-A7-3-013: src/lib/store.ts:306 LOW updateClassification mutates the incoming patch parameter directly (patch.name = nm) — callers retaining a reference to the patch object observe unexpected side-effect mutation
BUG-A7-3-014: src/lib/store.ts:507 LOW deleteSelectedPolygons fires N individual DELETE fetch requests in a forEach loop instead of a single batched API call — rapid multi-delete of 50+ polygons overwhelms the server with concurrent requests
BUG-A7-3-015: src/lib/store.ts:508 LOW deleteSelectedPolygons uses raw fetch() instead of the apiSync() helper used by all other mutations — error handling is inconsistent (console.error vs apiSync's standardized logging)
BUG-A7-3-016: src/lib/store.ts:888 LOW setGridSize accepts any value including 0 or negative without validation — gridSize <= 0 can cause infinite loop or division by zero in grid rendering code
BUG-A7-3-017: src/lib/store.ts:396 LOW addPolygon does not validate that classificationId exists in the classifications array — polygons can reference nonexistent classifications, becoming orphaned and invisible in the UI
BUG-A7-3-018: src/lib/store.ts:367 LOW mergeClassifications does not update repeatingGroups that may reference merged classification IDs — repeating groups become orphaned after a merge
BUG-A7-3-019: src/hooks/use-feature-flag.ts:30 LOW useState initializer returns false before fetch resolves — every feature-flagged component flashes from disabled to enabled on first page load
BUG-A7-3-020: src/hooks/use-feature-flag.ts:39 LOW useEffect has no cleanup function; setEnabled can fire after component unmounts if the shared fetchPromise resolves late — no abort controller or mounted-ref guard
BUG-A7-3-021: src/hooks/use-text-search.ts:36 LOW projectId is string-interpolated into the fetch URL without encodeURIComponent — IDs containing slashes or special characters produce malformed or exploitable URLs
BUG-A7-3-022: src/hooks/use-text-search.ts:32 LOW isLoading is set to true only inside the 300ms debounce setTimeout, not immediately on query change — UI displays stale results with no loading indicator during the debounce window
BUG-A7-3-023: src/hooks/useRealtimeSync.ts:18 LOW connectToProject call is not wrapped in try-catch — if EventSource constructor throws, connectedRef is already set to projectId, permanently preventing future reconnection attempts for that projectId
BUG-A7-3-024: src/hooks/useViewerPresence.ts:22 LOW viewerCount guard allows count of 0 (count >= 0) — the current user should always be counted so the minimum should be 1 to avoid displaying "0 viewers" in the UI

---

## Engineer E27 — DrawingTool + CanvasOverlay

BUG-A7-3-050: src/components/DrawingTool.tsx:88 HIGH getCoords returns {x:0,y:0} when container rect has zero dimensions instead of returning null/discarding click; silently places polygon vertex at PDF origin, corrupting polygon geometry
BUG-A7-3-051: src/components/DrawingTool.tsx:38 MEDIUM snapPolygons created via .filter() on every render without useMemo; new array reference each render invalidates useCallback memoization for getCoords (line 99), handleMouseMove (line 243), and handleClick (line 207), recreating all downstream callbacks every render
BUG-A7-3-052: src/components/DrawingTool.tsx:235 HIGH findNearestSnapPoint O(n×m) called on every mousemove with no requestAnimationFrame coalescing or debounce; with 500+ polygons on page, each mouse move iterates all polygon vertices causing visible input lag and UI freeze
BUG-A7-3-053: src/components/CanvasOverlay.tsx:202-213 HIGH updatePolygon (Zustand store mutation + undo snapshot push + API sync) called as side effect inside setDragPoints state updater callback; React 18 StrictMode double-invokes updaters, producing duplicate undo snapshots and double API sync requests on every drag-end
BUG-A7-3-054: src/components/CanvasOverlay.tsx:150-155 MEDIUM toSvgCoords divides by rect.width and rect.height without zero-guard; if wrapper element has zero dimensions during layout transition or unmount, produces Infinity/NaN coordinates fed into setDragPoints and polygon updates
BUG-A7-3-055: src/components/CanvasOverlay.tsx:533 MEDIUM selectedPolygons.includes(poly.id) is O(s) linear scan per polygon inside polygons.map() render loop; with n=1000 polygons and s=100 selections this is 100k string comparisons per render — should use a Set for O(1) lookup
BUG-A7-3-056: src/components/CanvasOverlay.tsx:412-416 MEDIUM batch reclassify calls updatePolygon individually per polygon in forEach loop; each call pushes a separate undo snapshot and fires a separate API sync, so Ctrl+Z after reclassifying 20 polygons undoes only the last one instead of the entire batch
BUG-A7-3-057: src/components/CanvasOverlay.tsx:982-983 MEDIUM floating toolbar IIFE calls querySelector('svg') and getBoundingClientRect() during render phase; forces synchronous layout reflow on every render cycle instead of deferring measurement to useLayoutEffect
BUG-A7-3-058: src/components/CanvasOverlay.tsx:984 MEDIUM floating toolbar guards baseDims.width===0 but not baseDims.height; line 986 computes svgRect.height/baseDims.height which is division by zero when height is 0, producing Infinity for scaleY and toolbar positioned off-screen
BUG-A7-3-059: src/components/CanvasOverlay.tsx:175-195 MEDIUM drag mousemove handler calls setDragPoints and setSnapIndicator on every raw mousemove event with no requestAnimationFrame coalescing; fast mouse movement queues excessive React state updates and re-renders during vertex drag
BUG-A7-3-060: src/components/CanvasOverlay.tsx:558-566 LOW inline arrow functions for onPointerEnter/onPointerMove/onPointerLeave created fresh per polygon per render; with 1000 polygons creates 3000 new closure instances each render cycle, preventing React reconciliation bailout
BUG-A7-3-061: src/components/CanvasOverlay.tsx:726 LOW calculateLinearFeet(poly.points, ppu, false) computed unconditionally for every polygon label; result only used when clsType==='linear', wasting O(m) vertex distance calculation per area/count polygon on every render
BUG-A7-3-062: src/components/CanvasOverlay.tsx:853-854 LOW hover tooltip for count polygons calls polygons.filter() and findIndex() inline during render on every pointer move; O(n) recomputation not memoized, runs on each hoveredPoly state update
BUG-A7-3-063: src/components/CanvasOverlay.tsx:464 LOW handleFloatingDuplicate offsets points by hardcoded +20 base PDF coordinate units; offset renders as wildly different screen distances depending on zoom — nearly invisible at high zoom, excessively far at low zoom
BUG-A7-3-064: src/components/CanvasOverlay.tsx:182 MEDIUM screenToBase calculation divides baseDims.width by rect.width without zero-check; if wrapperRef element has zero width during layout, produces Infinity snapThreshold that causes dragged vertex to snap to any vertex on the entire page
BUG-A7-3-065: src/components/CanvasOverlay.tsx:106 LOW baseDims falls back to {width:1,height:1} when pageBaseDimensions not yet loaded for current page; during page transitions all polygon SVG coordinates render against a 1×1 viewBox causing a brief visual flash of distorted geometry
BUG-A7-3-066: src/components/DrawingTool.tsx:32,94 MEDIUM baseDims defaults to {width:1,height:1} before page dimensions load; screenToBase becomes ~0.001 making snapRadiusBase ~0.015 base units — effectively disables vertex snapping until real page dimensions populate from PDF render
BUG-A7-3-067: src/components/DrawingTool.tsx:153-158 LOW performance.mark names 'polygon-draw-start' and 'polygon-draw-end' are global singletons; if two components or browser tabs execute commitPolygon concurrently, marks overwrite each other and performance.measure reports incorrect duration on window.__perfMarks
BUG-A7-3-068: src/components/DrawingTool.tsx:274-276 MEDIUM component only registers mouse event handlers (onClick, onMouseMove, onDoubleClick, onMouseDown); touch events (touchstart, touchmove, touchend) not handled, so rubber-band preview line and double-tap-to-close polygon do not work on touch/mobile devices
BUG-A7-3-069: src/components/CanvasOverlay.tsx:220-224 MEDIUM vertex drag handlers register only window 'mousemove' and 'mouseup' listeners; touch devices fire 'touchmove' and 'touchend' instead, so vertex dragging is completely non-functional on touch/mobile devices
BUG-A7-3-070: src/components/CanvasOverlay.tsx:260-265 LOW deletePolygon in keydown handler fires fire-and-forget fetch DELETE with no AbortController; rapid delete-then-navigate leaves orphaned network requests and if API fails, local state and server state silently diverge with only a console.error

---

## Engineer E28 — AnnotationTool + CutTool + CropOverlay

BUG-A7-3-100: src/components/AnnotationTool.tsx:58 MEDIUM commit can fire twice before React re-renders (rapid Enter or double-click "Add" button); the memoized closure captures the same non-null draft on both invocations, calling addAnnotation twice and creating a duplicate annotation
BUG-A7-3-101: src/components/AnnotationTool.tsx:66 LOW commit uses currentPage at commit-time but draft.x/draft.y were computed in the coordinate space of the page that was current at click-time; if the user navigates pages between pin placement and Enter, the annotation is stored on the wrong page with mismatched coordinates
BUG-A7-3-102: src/components/AnnotationTool.tsx:51-52 LOW handleCanvasClick divides by rect.width and rect.height without checking for zero; during layout transitions a zero-dimension container produces Infinity/NaN coordinates stored in the draft
BUG-A7-3-103: src/components/AnnotationTool.tsx:22 MEDIUM baseDims fallback {width:1,height:1} when pageBaseDimensions[currentPage] is not yet populated maps screen coords to the 0–1 range instead of PDF-space; annotations silently placed at near-zero coordinates (e.g. x=0.45 instead of x=275) with no user-visible error
BUG-A7-3-104: src/components/AnnotationTool.tsx:36-42 LOW popupStyle caches draft.screenX/screenY which are viewport-relative coordinates captured at click time; if the container scrolls or resizes before the user commits, the popup drifts away from the pin's actual PDF position
BUG-A7-3-105: src/components/CutTool.tsx:17 MEDIUM pagePolygons is computed via .filter() in the render body without useMemo; the new array reference on every render defeats useCallback memoization of findPolygonAt (line 31) and cascades to onClick (line 41) — all three callbacks are recreated on every render
BUG-A7-3-106: src/components/CutTool.tsx:45-46 LOW Rapid double-click on a polygon calls cutPolygon twice; the second call filters an already-removed ID (no-op) but still pushes a redundant undo snapshot and clears the redo stack, corrupting undo history
BUG-A7-3-107: src/components/CutTool.tsx:14 HIGH baseDims fallback {width:1,height:1} maps screen coordinates to 0–1 range while stored polygon points are in PDF-space (e.g. 0–612); pointInPolygon hit-test will never match, making CutTool completely non-functional when pageBaseDimensions is not yet populated
BUG-A7-3-108: src/components/CutTool.tsx:60-66 LOW Container div has tabIndex={0} but no role or aria-label; screen readers cannot identify the interactive tool region
BUG-A7-3-109: src/components/CutTool.tsx:41-51 LOW No touch event handlers; relies on synthetic onClick from browser touch-to-click synthesis which is unreliable on some mobile browsers and adds 300ms delay
BUG-A7-3-110: src/components/CropOverlay.tsx:136-162 MEDIUM Crop selection visual is inverted: the full-canvas dim rgba(0,0,0,0.3) at line 136 is overlaid by an additional rgba(0,0,0,0.3) fill on the first selection rect at line 146, making the selected region appear darker than the surrounding area — opposite of standard crop UX where the selection should be bright and the outside dimmed
BUG-A7-3-111: src/components/CropOverlay.tsx:91 HIGH baseDims fallback {width:1,height:1} maps all drag coordinates to 0–1 range; the minimum crop threshold width < 10 || height < 10 can never be satisfied in that coordinate space, causing every crop attempt to be silently rejected with no user feedback
BUG-A7-3-112: src/components/CropOverlay.tsx:39-44 LOW toBaseCoords does not guard against zero-dimension rect.width/rect.height (unlike CutTool's getCoords which checks rect.width === 0 || rect.height === 0); produces NaN/Infinity coordinates during layout transitions
BUG-A7-3-113: src/components/CropOverlay.tsx:105 MEDIUM onCropComplete in the effect dependency array [isDragging, baseDims, onCropComplete] causes the effect to re-run during an active drag if the parent re-renders with an unstable (non-memoized) callback reference, detaching and re-attaching window mousemove/mouseup listeners mid-drag
BUG-A7-3-114: src/components/CropOverlay.tsx:77-96 LOW After successful crop (onCropComplete called at line 96), startPoint and currentPoint are not reset to null; the stale crop rectangle remains rendered until the parent unmounts the component
BUG-A7-3-115: src/components/CropOverlay.tsx:49-57 MEDIUM handleMouseDown and window mousemove/mouseup listeners only handle MouseEvent; no touchstart/touchmove/touchend handlers exist, making the crop drag interaction completely non-functional on touch devices
BUG-A7-3-116: src/components/CropOverlay.tsx:119-121 LOW Container div has tabIndex={0} but no role or aria-label; screen readers cannot identify the crop overlay's interactive purpose
BUG-A7-3-117: src/components/CropOverlay.tsx:65-105 LOW If baseDims changes mid-drag (e.g. page switch by external action), the onMove/onUp handlers use the new baseDims while startPoint was captured with the old baseDims, producing a crop rect with inconsistent coordinate transforms between its start and end points

---

## Engineer E29 — FloorAreaMesh + MarkupTools + ManualCalibration + AutoScalePopup

BUG-A7-3-150: src/components/FloorAreaMesh.tsx:115 MEDIUM pointsToVec3 called twice in outlinePoints construction; second invocation allocates N Vector3 objects only to extract element [0] via .slice(0,1) — O(n) wasted allocation every render cycle
BUG-A7-3-151: src/components/FloorAreaMesh.tsx:115 HIGH outlinePoints array rebuilt on every render without useMemo; passes new array reference to drei Line component each cycle, forcing it to teardown and rebuild its internal Line2 BufferGeometry and re-upload to GPU
BUG-A7-3-152: src/components/FloorAreaMesh.tsx:111 MEDIUM new Color() constructed every render for fillColor; R3F reconciler sees new object reference and pushes redundant material uniform update to GPU even when color and selected props are unchanged
BUG-A7-3-153: src/components/FloorAreaMesh.tsx:136 MEDIUM new Color(color) and new Color('#000000') allocated inline in JSX every render for emissive prop; creates 2 Color objects per render regardless of whether selected changed
BUG-A7-3-154: src/components/FloorAreaMesh.tsx:146 LOW brighten(color) called inline in JSX for Line color prop every render when selected=true; brighten itself allocates 2 transient Color objects per call, and the result string is recomputed even though color prop hasn't changed
BUG-A7-3-155: src/components/FloorAreaMesh.tsx:87 MEDIUM normalizePoints always returns a fresh array via .map(); if parent re-renders and passes a new rawPoints reference with identical coordinates (common after unrelated store updates trigger parent re-render), downstream geometry useMemo at line 89 rebuilds ShapeGeometry and re-uploads vertex buffers to GPU
BUG-A7-3-156: src/components/FloorAreaMesh.tsx:60 LOW buildShape accepts 3+ collinear points that form a zero-area polygon; ShapeGeometry produces degenerate triangles with undefined normals that waste GPU draw calls and may cause z-fighting artifacts
BUG-A7-3-157: src/components/FloorAreaMesh.tsx:129 LOW onClick handler casts event via `as unknown as ThreeEvent` double-cast, bypassing TypeScript safety; R3F pointer events are ThreeEvent<PointerEvent> but prop declares bare ThreeEvent — consumer code accessing .nativeEvent or .pointer will get undefined at runtime
BUG-A7-3-158: src/components/ManualCalibration.tsx:199 LOW button missing type="button" attribute; defaults to type="submit" if any ancestor is a form element, causing unintended form submission on click
BUG-A7-3-159: src/components/ManualCalibration.tsx:209 LOW button missing type="button" — same implicit submit risk as BUG-A7-3-158
BUG-A7-3-160: src/components/ManualCalibration.tsx:232 LOW button missing type="button" — same implicit submit risk
BUG-A7-3-161: src/components/ManualCalibration.tsx:258 LOW button missing type="button" — same implicit submit risk
BUG-A7-3-162: src/components/ManualCalibration.tsx:310 LOW button missing type="button" — same implicit submit risk
BUG-A7-3-163: src/components/ManualCalibration.tsx:320 LOW button missing type="button" — same implicit submit risk
BUG-A7-3-164: src/components/ManualCalibration.tsx:420 LOW button missing type="button" — same implicit submit risk
BUG-A7-3-165: src/components/ManualCalibration.tsx:426 LOW button missing type="button" — same implicit submit risk
BUG-A7-3-166: src/components/ManualCalibration.tsx:7 MEDIUM DPI hardcoded to 72; if calibrationPoints are captured in screen-space pixels (CSS px) and user is zoomed in/out on the PDF, pixelDistance does not reflect true PDF-space distance, producing incorrect scale by a factor of the current zoom level
BUG-A7-3-167: src/components/ManualCalibration.tsx:72 LOW no minimum pixelDistance threshold; two near-coincident calibration clicks (e.g. accidental double-click) produce sub-pixel distance that passes the >0 guard but yields an extreme pixelsPerUnit value, silently corrupting project scale
BUG-A7-3-168: src/components/ManualCalibration.tsx:52 LOW useEffect with empty deps array reads mode, calibrationMode, and calibrationPoints only at mount; if component remounts while calibrationMode is already true in store (e.g. fast close/reopen), the guard !calibrationMode prevents re-entering calibration draw mode, leaving user unable to place points
BUG-A7-3-169: src/components/ManualCalibration.tsx:65 LOW useEffect clears calibrationPoints when mode switches away from draw-line, but clearCalibrationPoints also sets calibrationMode=false in the store, which mutates the effect's own dependency and triggers a redundant no-op re-execution of the effect
BUG-A7-3-170: src/components/AutoScalePopup.tsx:66 MEDIUM global keydown handler added to window calls e.preventDefault() on Enter; if user keyboard-navigates to the "Don't show again" checkbox and presses Enter, the native checkbox toggle is suppressed — scale is accepted without honoring the checkbox intent
BUG-A7-3-171: src/components/AutoScalePopup.tsx:76 MEDIUM keydown listener registered on window instead of the dialog element; if another modal or input exists in the DOM (e.g. opened via portal), Enter/Escape keypresses intended for that element are intercepted by this handler, dismissing or accepting the scale popup unexpectedly
BUG-A7-3-172: src/components/AutoScalePopup.tsx:50 MEDIUM useEffect auto-dismiss interval depends on [onDismiss]; if parent does not wrap onDismiss in useCallback, every parent re-render tears down and recreates the 50ms setInterval, causing progress bar visual stuttering and accumulated timing drift
BUG-A7-3-173: src/components/AutoScalePopup.tsx:52 LOW auto-dismiss countdown uses setInterval at 50ms (20 ticks/sec) instead of requestAnimationFrame; on battery-powered devices this prevents browser timer throttling and wastes CPU cycles for a cosmetic progress bar
BUG-A7-3-174: src/components/MarkupTools.tsx:55 HIGH activeTool, activeColor, and strokeWidth are local useState but never passed to any canvas drawing layer or store; selecting any tool, color, or stroke width in the toolbar has zero functional effect — the entire markup configuration UI is non-operational
BUG-A7-3-175: src/components/MarkupTools.tsx:87 LOW tool buttons lack aria-pressed attribute to convey active/selected state to screen readers; sighted users see visual highlight but assistive technology users cannot determine which tool is active
BUG-A7-3-176: src/components/MarkupTools.tsx:110 LOW color picker buttons lack aria-pressed attribute; selected color is only conveyed via visual border styling, invisible to screen readers

---

## Engineer E30 — Scale/Measurement/Merge/3D/Utils

BUG-A7-3-200: src/lib/polygon-utils.ts:108 HIGH Math.min(...xs) and Math.max(...xs) spread on polygon points array will throw RangeError (max call stack exceeded) for polygons with >~65k vertices
BUG-A7-3-201: src/components/FloorAreaMesh.tsx:94 CRITICAL geo.rotateX(-Math.PI/2) maps geometry vertex (x,y,0)→(x,0,-y) but outline at line 116 uses Vector3(p.x, outlineY, p.y) i.e. +y — fill mesh and outline are Z-mirrored, rendering in completely different locations
BUG-A7-3-202: src/components/ThreeDScene.tsx:46 HIGH useStore() without selector subscribes to entire store — every unrelated state change (tool switch, hover, selection) triggers re-render of heavy 3D composition component including .map() over all areas
BUG-A7-3-203: src/components/MergeSplitTool.tsx:113 HIGH split preview draws zero-length line (x2={splitPts[0].x} y2={splitPts[0].y} same as x1/y1) — user sees no visual feedback of the pending split line direction
BUG-A7-3-204: src/components/MergeSplitTool.tsx:67 HIGH no cursor position tracking during split mode — component has no onMouseMove handler so user cannot see where the split line endpoint will land before clicking
BUG-A7-3-205: src/components/ScaleCalibrationPanel.tsx:54 MEDIUM setTimeout(() => { onCalibrated?.(); onClose(); }, 1200) never cleared — if user closes panel before 1200ms, callbacks fire after unmount; double onClose() call
BUG-A7-3-206: src/components/ScaleCalibrationPanel.tsx:52 MEDIUM setScaleForPage(currentPage, cal) called without currentPage >= 1 guard — sets scale for page 0 or negative page when currentPage is default/uninitialized (contrast ScaleCalibration.tsx:125 which guards)
BUG-A7-3-207: src/components/ScaleCalibration.tsx:50 MEDIUM parseFraction("1/0") returns Infinity — no denominator-zero guard; propagates Infinity as pixelsPerUnit through the store
BUG-A7-3-208: src/components/ScaleCalibration.tsx:22 MEDIUM labelToPixelsPerUnit ratio case: DPI / ratio where ratio=0 for label "1 : 0" — returns Infinity, stored as scale
BUG-A7-3-209: src/components/ScaleCalibration.tsx:29 MEDIUM labelToPixelsPerUnit civil case: DPI / feet where feet=0 for label "1" = 0' 0"" — returns Infinity
BUG-A7-3-210: src/components/ScaleCalibration.tsx:188 MEDIUM handleManualSave hardcodes unit: 'ft' for all labels — metric ratio scales (e.g. "1 : 100") get unit='ft' instead of 'm'; handleSelectScale correctly resolves unit via ARCH_RATIOS_FT but this path does not
BUG-A7-3-211: src/components/MergeSplitTool.tsx:86 MEDIUM Escape handler is React onKeyDown only — requires div to have focus; no window-level keydown listener, so pressing Escape when focus is on a sidebar or toolbar element does not cancel merge/split
BUG-A7-3-212: src/components/MergeSplitTool.tsx:56 MEDIUM stale firstPolyId if polygon is deleted (undo/API) between first and second merge click — merge(firstPolyId, hit) receives an ID for a polygon that no longer exists in the store
BUG-A7-3-213: src/components/ThreeDScene.tsx:51 MEDIUM storeClassifications duplicates the identical selector subscription at line 44 (classifications) — two separate Zustand subscriptions to same slice, wasting a comparison cycle per store update
BUG-A7-3-214: src/components/ThreeDScene.tsx:80 MEDIUM useMemo deps include scale (via eslint-disable) but scale is never read inside the memo body — every scale change re-runs convertTakeoffTo3D unnecessarily
BUG-A7-3-215: src/components/FloorAreaMesh.tsx:111 MEDIUM new Color() objects constructed in render body (not memoized) — for 1000+ FloorAreaMesh instances, creates 4+ Color objects × 1000 polygons per render frame, significant GC pressure
BUG-A7-3-216: src/components/FloorAreaMesh.tsx:115 MEDIUM outlinePoints array of Vector3 objects plus duplicate pointsToVec3() call at line 117 — second call allocates full array then .slice(0,1) discards all but first element; entire outline array recreated every render
BUG-A7-3-217: src/lib/polygon-utils.ts:75 MEDIUM mergePolygons fallback return [...poly1, ...poly2] creates a geometrically invalid self-intersecting polygon by concatenating unrelated vertex arrays — downstream area/perimeter calculations will be wrong
BUG-A7-3-218: src/lib/polygon-utils.ts:38 MEDIUM calculateLinearFeet — negative pixelsPerUnit passes the || 1 guard (truthy), producing negative distances; only zero is guarded
BUG-A7-3-219: src/lib/snap-utils.ts:104 MEDIUM getGridSnapPoints generates (2*range+1)² candidates — with snapRadius=100 and gridSize=1, range=100, producing 40,401 points iterated per cursor move; causes UI jank
BUG-A7-3-220: src/lib/snap-utils.ts:34 MEDIUM getPolygonSnapPoints allocates a new SnapPoint object for every vertex and midpoint of every polygon — O(total_vertices) allocations per findNearestSnapPoint call on each mouse move
BUG-A7-3-221: src/lib/snap-utils.ts:88 MEDIUM snapToGrid(x, y, 0) computes Math.round(x/0) * 0 = NaN — exported function has no gridSize<=0 guard
BUG-A7-3-222: src/lib/auto-scale.ts:145 MEDIUM collectRatios hardcodes unit='ft' (via addCandidate line 78) for all ratio scales — metric ratio scales like "1:100" or "1:200" are mislabeled as feet; pixelsPerUnit is also computed as pixels-per-foot (PDF_DPI / (denominator / 12))
BUG-A7-3-223: src/components/MeasurementTool.tsx:90 MEDIUM pxDistance is computed in screen-space pixels via getBoundingClientRect() offsets but divided by scale.pixelsPerUnit which is in PDF-space pixels at 72 DPI — measurement is incorrect when canvas is zoomed (proportional to zoom factor)
BUG-A7-3-224: src/components/ThreeDScene.tsx:87 LOW visibilityHiddenIds is Array and .includes() at line 115 is O(n) per area — should be Set for O(1) lookup; quadratic with many classifications × many areas
BUG-A7-3-225: src/components/ScaleCalibrationPanel.tsx:95 LOW unit <select> only offers 'ft', 'm', 'in' — store ScaleCalibration type also supports 'cm' and 'mm' which users cannot select via calibration panel
BUG-A7-3-226: src/components/ScalePanel.tsx:94 LOW currentPage prop accepted in interface but never referenced in component body — dead prop, callers pass it unnecessarily
BUG-A7-3-227: src/components/MeasurementTool.tsx:35 LOW getCoords returns {x:0, y:0} when containerRef.current is null — click before ref attaches creates phantom measurement point at canvas origin
BUG-A7-3-228: src/components/ScaleCalibration.tsx:166 LOW handleSelectScale awaits dynamic import() then calls addToast and handleClose — if component unmounts during import, closures fire on stale component (harmless in React 18 but wastes work)
BUG-A7-3-229: src/lib/polygon-utils.ts:51 LOW pointInPolygon division guard (yj - yi) || 1e-10 is unreachable dead code — when yi === yj, the first condition (yi > p.y) !== (yj > p.y) is always false, short-circuiting before the division; near-zero denominators (yi ≈ yj) bypass the guard entirely
BUG-A7-3-230: src/lib/auto-scale.ts:139 LOW ratio regex 1\s*:\s*(\d{1,5}) can false-match non-scale text (e.g. "step 1 : 5 options") — confidence 0.75 partially mitigates but still pollutes candidate list
BUG-A7-3-231: src/lib/polygon-groups.ts:55 LOW getGroupStats does a full for (const polygon of polygons) scan per group — O(groups × polygons) when called per-group in a render loop; should index polygons by ID once
BUG-A7-3-232: src/components/FloorAreaMesh.tsx:160 LOW brighten() creates 2 new Color objects per invocation; called up to 2× per render (fill + outline color) — minor GC overhead multiplied by polygon count

---

## Critical Issues Requiring Immediate Action

1. **BUG-A7-3-201 (CRITICAL)** — FloorAreaMesh 3D geometry Z-axis mismatch: fill mesh and outline render at mirrored positions
2. **BUG-A7-3-001 (HIGH)** — cutPolygon silently deletes polygons instead of cutting them
3. **BUG-A7-3-174 (HIGH)** — MarkupTools toolbar state is entirely disconnected — markup tool selection has no effect
4. **BUG-A7-3-107 (HIGH)** — CutTool completely non-functional before pageBaseDimensions loads
5. **BUG-A7-3-111 (HIGH)** — CropOverlay completely non-functional before pageBaseDimensions loads
6. **BUG-A7-3-002 (HIGH)** — hydrateState leaks data from previous project on project switch
7. **BUG-A7-3-052 (HIGH)** — O(n×m) snap point scan on every mousemove causes UI freeze at scale
8. **BUG-A7-3-053 (HIGH)** — Store mutation inside React state updater causes double undo entries and double API calls
9. **BUG-A7-3-203/204 (HIGH)** — MergeSplitTool split preview is broken and has no cursor feedback
10. **BUG-A7-3-202 (HIGH)** — ThreeDScene subscribes to entire Zustand store without selector, rebuilds 3D scene on every unrelated state change
