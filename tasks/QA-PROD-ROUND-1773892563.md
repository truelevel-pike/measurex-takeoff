# QA Production Sprint — 2026-03-18

## Bugs Found

1. **BUG-1: Count/linear polygon labels never render on canvas overlay**
   - File: `src/components/CanvasOverlay.tsx:480`
   - Issue: `if (pts.length < 3) return null;` blocks labels for count polygons (1 point) and 2-point linear polygons
   - Status: **FIXED** — Now uses type-aware minimum: count=1, linear=2, area=3

2. **BUG-2: Classification groups not collapsible/expandable**
   - File: `src/components/QuantitiesPanel.tsx` (Groups section)
   - Issue: Groups always show all nested classifications with no way to collapse
   - Status: **FIXED** — Added `collapsedGroups` state with ChevronRight/ChevronDown toggle on group header

3. **BUG-3: Editing a group doesn't remove classifications from other groups**
   - File: `src/components/QuantitiesPanel.tsx:handleSaveGroup`
   - Issue: `updateGroup` directly sets `classificationIds` without calling `moveClassificationToGroup`, allowing a classification to appear in multiple groups simultaneously
   - Status: **FIXED** — Now uses `moveClassificationToGroup` for each selected classification and explicitly removes unchecked ones

## Features Implemented

4. **FEATURE-15: Ctrl+D to duplicate last polygon**
   - Files: `src/lib/store.ts`, `src/app/page.tsx`
   - Added `lastPolygon` (non-persisted) to Zustand store
   - `addPolygon` now sets `lastPolygon` to the polygon just added
   - Global Ctrl+D / Cmd+D handler: duplicates lastPolygon with +20px X/Y offset, shows "Polygon duplicated" toast
   - Status: **IMPLEMENTED**

## Components Audited (No Bugs)

- **DrawingTool.tsx** — Polygon drawing (area, linear, count), snap-to-vertex, double-click commit, close-on-first-point all working correctly
- **Undo/Redo (store.ts)** — Snapshot/restore cycle properly removes polygons from canvas after undo. HistorySnapshot captures all relevant state.
- **CanvasOverlay.tsx** — Renders completed polygons, vertex dragging, batch selection, context menus all working
