# QA-ROUND-MORNING-A8

**Date:** 2026-03-19
**Tester:** Claude (Opus 4.6)
**Method:** Code review of all 5 feature areas

---

## TASK 1: Classification System Testing

**Status: PASS**

Tested by reviewing `QuantitiesPanel.tsx` (lines 537–1260):
- Classifications render with color swatches (3x3 rounded `div` with `backgroundColor: cls.color` and glow `boxShadow`)
- Type badges show correctly: `SF` / `LF` for area/linear via `AREA_UNIT_LABELS` / `LINEAR_UNIT_LABELS`, count shows `{count} EA`
- Edit button (Pencil icon) appears on hover, opens inline edit form with name, color picker (20 presets + hex input), and type dropdown
- Delete button (Trash2 icon) appears on hover, shows confirmation prompt before deleting
- Color picker has live preview swatch with hex input validation
- Shape indicators (circle/square/triangle/diamond) provide secondary visual differentiation

No bugs found in classification CRUD.

---

## TASK 2: Assemblies Tab Testing

**Status: PASS (1 bug found, fixed)**

Tested by reviewing `AssembliesPanel.tsx` and `AssemblyEditor.tsx`:
- Tab switching between Quantities/Assemblies/Estimate works correctly
- "Add Assembly" button opens `AssemblyEditor` modal
- Editor has: name, linked classification dropdown, scope (Library/Project), materials table (name, cost, waste%, coverage, unit, formula)
- Total cost computed correctly: `unitCost(assembly) * quantity(assembly)` where quantity comes from polygon measurements
- Grand total at bottom sums all assembly costs
- API sync on create/update/delete works

### BUG-A8-004: AssemblyEditor missing Escape key handler
- **Severity:** Low
- **What happened:** The AssemblyEditor modal has no keyboard handler for Escape. Users must click the X button or Cancel to close.
- **Fix:** Added `useEffect` with `keydown` listener for Escape key in `AssemblyEditor.tsx`

---

## TASK 3: Export Testing

**Status: FAIL (2 bugs found, fixed)**

### BUG-A8-001: ExportPanel never rendered in the application (CRITICAL)
- **Severity:** Critical
- **What happened:** `ExportPanel.tsx` (1065 lines) implements a full-featured export dialog with 8 export formats (Screen View Excel, Full Export Excel, Print, Contractor Report, JSON, IFC Stub, CSV Coordinates, Markdown Report), plus grouping, filtering, column visibility, and live preview. However, it was **never imported or rendered** in `page.tsx`. Users could only access two quick-export buttons (Excel/JSON) in the TopNavBar.
- **Fix:**
  - Added `const ExportPanel = dynamic(() => import('@/components/ExportPanel'), { ssr: false })` import in `page.tsx`
  - Added `showExport` state
  - Rendered `<ExportPanel>` conditionally in the JSX
  - Added `onExportPanel` prop to TopNavBar, wired to `setShowExport(true)`
  - Added new "Export" button with `FileSpreadsheet` icon in TopNavBar (desktop + mobile)

### BUG-A8-003: Two identical Download icons in TopNavBar — confusing UX
- **Severity:** Medium
- **What happened:** Both "Export JSON" and "Export to Excel" buttons in TopNavBar used the same `Download` icon (`<Download size={17} />`), making them visually indistinguishable.
- **Fix:** Replaced "Export JSON" button with the new "Export" button (FileSpreadsheet icon) that opens the full ExportPanel. Kept the quick Excel export button with the Download icon. Updated mobile menu similarly.

---

## TASK 4: Right-Click Context Menu Testing

**Status: PASS (1 bug found, fixed)**

Tested by reviewing `ContextMenu.tsx` (222 lines):
- Menu items present: Properties, Duplicate, Change Classification (with submenu), Delete (two-click confirm), Add to snapshot
- Fixed positioning with z-index 9999
- Keyboard navigation (ArrowUp/ArrowDown/Enter) works
- Scroll-to-close handler present
- Click outside closes via parent `page.tsx` onClick handler
- Classification submenu shows all classifications with color swatches

### BUG-A8-002: ContextMenu missing Escape key handler
- **Severity:** Medium
- **What happened:** The keyboard event handler in `ContextMenu.tsx` handled ArrowDown, ArrowUp, and Enter, but did NOT handle the Escape key. Users could not dismiss the context menu with Escape.
- **Fix:** Added `Escape` key case to the `onKeyDown` handler that calls `onClose()`, and added `onClose` to the `useEffect` dependency array.

---

## TASK 5: Compare Button Testing

**Status: PASS**

Tested by reviewing `ComparePanel.tsx` (398 lines) and its integration in `page.tsx`:
- "Compare" button in TopNavBar triggers `setShowCompare(true)`
- ComparePanel renders as fixed right sidebar (340px)
- Fetches project list from `/api/projects`, excludes current project
- Project selector dropdown for choosing comparison target
- "Compare" button calls `/api/projects/compare` POST with both project IDs
- Results show: Added (green), Removed (red), Unchanged (gray) with counts
- Total polygons computed
- "Clear" button resets overlay
- SVG overlay integration via `onOverlay` → `setCompareOverlay` → `CompareOverlaySVG`
- Loading states and error handling present

No bugs found in Compare functionality.

---

## Summary

| Task | Area | Status | Bugs Found |
|------|------|--------|------------|
| 1 | Classification System | PASS | 0 |
| 2 | Assemblies Tab | PASS | 1 (BUG-A8-004) |
| 3 | Export | FAIL → FIXED | 2 (BUG-A8-001, BUG-A8-003) |
| 4 | Context Menu | PASS | 1 (BUG-A8-002) |
| 5 | Compare Button | PASS | 0 |

**Total bugs found:** 4
**Total bugs fixed:** 4
**TypeScript check:** Clean (no errors)

### Bug Severity Breakdown
- Critical: 1 (BUG-A8-001 — ExportPanel unreachable)
- Medium: 2 (BUG-A8-002, BUG-A8-003)
- Low: 1 (BUG-A8-004)
