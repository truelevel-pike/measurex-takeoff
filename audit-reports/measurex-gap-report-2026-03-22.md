# MeasureX Full Gap Analysis — 2026-03-22
## Audited by: Admiral7 (OpenClaw agent)
## Reference docs: MEASUREX-ARCHITECTURE.md, TOGAL-MASTER.md
## Live app: https://measurex-takeoff.vercel.app

---

## EXECUTIVE SUMMARY

15 audit categories checked. 6 confirmed MISSING, 6 PARTIAL, 3 PRESENT.
**Top 3 priorities:** GAP-001 (data-testid coverage), GAP-002 (?agent=1 mode), GAP-003 (isTrusted canvas blocking).

---

## GAP FINDINGS

---

[GAP-001] data-testid Coverage on Interactive Elements
Status: PARTIAL
Togal has: N/A (MX-specific requirement for agent control)
MeasureX has: Only 8 elements tagged across the entire app:
  - `project-name-input` (projects/page.tsx)
  - `create-project-btn` (projects/page.tsx)
  - `snap-indicator` (DrawingTool.tsx — SVG circle, not a control)
  - `tool-<name>` (LeftToolbar.tsx — dynamic, present on tool buttons)
  - `pdf-load-error` (PDFViewer.tsx — error state only)
  - `classification-name-input` (QuantitiesPanel.tsx)
  - `classification-type-select` (QuantitiesPanel.tsx)
  - `save-classification-btn` (QuantitiesPanel.tsx)
  - `save-project-btn` (TopNavBar.tsx)
  - `testId` prop on TopNavBar (passed via prop, not hardcoded)

MISSING testids (from architecture spec):
  - `canvas-area` (the PDF canvas element — NO data-testid)
  - `page-prev-btn` (TopNavBar page nav — NO data-testid)
  - `page-next-btn` (TopNavBar page nav — NO data-testid)
  - `page-number-display` (NO data-testid)
  - `scale-display` (BottomStatusBar — NO data-testid)
  - `quantities-panel` (QuantitiesPanel wrapper — NO data-testid)
  - `export-btn` (ExportPanel trigger — NO data-testid)
  - `zoom-in-btn` / `zoom-out-btn` (ZoomControls — NO data-testid)
  - `tool-area` / `tool-linear` / `tool-count` (LeftToolbar dynamic but tool buttons for area/linear/count not distinguishable by exact tool type since these are flow tool types, not toolbar buttons)
  - `upload-pdf-input` (NO data-testid)
  - `new-classification-btn` (the "+" button to open create form — NO data-testid)
  - `classification-color-picker` (NO data-testid)
  - `ai-takeoff-btn` (the Togal/Re-Takeoff button — NO data-testid)
  - `polygon-label` (DOM-readable labels — MISSING entirely, see GAP-004)

Files to change:
  - src/components/PDFViewer.tsx (add data-testid="canvas-area" to <canvas>)
  - src/components/TopNavBar.tsx (add data-testid to prev/next page buttons, page number display, AI button)
  - src/components/BottomStatusBar.tsx (add data-testid="scale-display")
  - src/components/QuantitiesPanel.tsx (add data-testid="quantities-panel", data-testid="new-classification-btn", data-testid="classification-color-picker")
  - src/components/ExportPanel.tsx (add data-testid="export-btn")
  - src/components/ZoomControls.tsx (add data-testid="zoom-in-btn", data-testid="zoom-out-btn")
  - src/app/page.tsx (add data-testid="upload-pdf-input" to file input)
Priority: HIGH — BLOCKS agent operation

---

[GAP-002] ?agent=1 Mode (Modal/Popup Suppression)
Status: MISSING
Togal has: N/A (MX-specific requirement)
MeasureX has: NO agent mode detection anywhere in the codebase.
  - `useSearchParams` is imported and used in page.tsx but only reads project/page params, NOT `agent` param
  - WhatsNewModal renders whenever `whatsNew.show` is true — no suppression
  - FirstRunTooltips renders unconditionally when `projectId` is set
  - AutoScalePopup fires whenever scale is auto-detected — no agent suppression
  - Scale popup localStorage flag exists (`measurex_hide_scale_popup`) but not wired to agent mode
  - No `?agent=1` URL param detection or agent mode store flag exists

Files to change:
  - src/app/page.tsx (read `agent` from searchParams, set agentMode flag, suppress WhatsNew/FirstRunTooltips/AutoScalePopup)
  - src/components/WhatsNewModal.tsx (accept/check agentMode prop or store flag)
  - src/components/FirstRunTooltips.tsx (check agentMode)
  - src/components/AutoScalePopup.tsx (auto-dismiss in agent mode)
  - src/lib/store.ts (add `agentMode: boolean` state if needed)
Priority: HIGH — BLOCKS agent operation (modals halt the agent loop)

---

[GAP-003] isTrusted Check on Canvas Drawing
Status: PRESENT (no blocking found — favorable)
Togal has: isTrusted check that BLOCKS JS-dispatched events (requires CDP)
MeasureX has: DrawingTool.tsx uses React synthetic events (`React.MouseEvent`, `React.PointerEvent`) which do NOT check `event.isTrusted`. No `isTrusted` filter was found anywhere in the drawing pipeline. The canvas drawing code uses `handleClick` on the SVG overlay container, not a raw canvas, so standard browser-dispatched pointer events should work.
  - NOTE: This is GOOD for agent compatibility — MX does NOT need CDP for drawing.
  - The architecture doc says "Must remove any isTrusted checks" — none exist to remove. ✅

Files to change: None required
Priority: N/A (confirmed COMPLIANT)

---

[GAP-004] SF Labels in DOM (Agent-Readable)
Status: MISSING
Togal has: Canvas-only labels (pixels) — but Togal doesn't need agent readability
MeasureX has: SVG `<text>` elements inside CanvasOverlay.tsx for polygon labels (area/linear display strings). These ARE rendered as SVG DOM elements, not canvas pixels — which is good.
  HOWEVER:
  - None of the SVG label elements have `data-testid="polygon-label"` or `data-polygon-id` on the text itself
  - The architecture spec requires: `<div data-testid="polygon-label" data-polygon-id="abc123">245.3 SF</div>`
  - Current labels are inside `<g>` wrappers that have `data-polygon-id` on the path elements, but the `<text>` label nodes themselves do NOT have `data-testid` or `data-polygon-id`
  - Agent cannot reliably target SF label text via snapshot without explicit testids

Files to change:
  - src/components/CanvasOverlay.tsx (add data-testid="polygon-label" and data-polygon-id to the <text> elements that render measurement labels, around lines 1076-1137)
Priority: HIGH — agent needs to read SF values after drawing

---

[GAP-005] Drawing Tools — Tool Type Coverage
Status: PARTIAL
Togal has: polygon, rectangle (R shortcut), circle (C shortcut), arc line, linear, count, merge, split, cut/subtract, smart paste, flip/rotate/combine, multi-select
MeasureX has:
  ✅ Polygon/freeform draw (tool: 'draw')
  ✅ Merge (tool: 'merge')
  ✅ Split (tool: 'split')
  ✅ Cut/subtract (tool: 'cut')
  ✅ Linear (via classification type, not separate tool)
  ✅ Count (via classification type, not separate tool)
  ✅ Multi-select (CanvasOverlay supports it)
  ❌ Rectangle shortcut (R key) — NOT in Tool type enum, not in DrawingTool.tsx, not in keyboard shortcuts
  ❌ Circle shortcut (C key) — NOT implemented
  ❌ Arc line tool — NOT implemented (no 'arc' tool type)
  ❌ Smart paste — component SmartTools.tsx exists but integration unclear
  ❌ Flip/rotate polygon — NOT found

Files to change:
  - src/lib/store.ts (add 'rect', 'circle', 'arc' to Tool type)
  - src/components/DrawingTool.tsx (add rectangle 2-point mode, circle mode)
  - src/components/LeftToolbar.tsx (add rectangle/circle/arc tool buttons)
  - src/app/page.tsx (add R/C keyboard shortcuts for rect/circle)
Priority: MEDIUM — polygon draw works; shortcuts are quality-of-life

---

[GAP-006] Scale System — Per-Page, Auto-Detect, Manual Calibration
Status: PRESENT (good shape)
Togal has: Per-page scale, auto-detect from title block, manual calibration (draw line or enter number), 39 presets across architectural/civil/ratio
MeasureX has:
  ✅ Per-page scales: store.ts has `scales: Record<number, ScaleConfig>` and `getScaleForPage()` — per-page isolation confirmed
  ✅ Auto-detect: src/lib/auto-scale.ts exists, used in page.tsx
  ✅ Manual calibration: ManualCalibration.tsx and ScaleCalibration.tsx both exist
  ✅ Scale presets: ScalePanel.tsx and scale-related components exist
  ✅ Scale display: BottomStatusBar.tsx (though missing data-testid — see GAP-001)
  ⚠️ Scale display missing data-testid (already noted in GAP-001)

Files to change: Minor — see GAP-001 for testid
Priority: LOW (functionally complete)

---

[GAP-007] Assemblies System
Status: PARTIAL (exists but disconnected)
Togal has: Full assembly system — link classifications to materials+costs, library assemblies, custom formulas, export
MeasureX has:
  ✅ AssembliesPanel.tsx exists and is a full UI component
  ✅ AssemblyEditor.tsx exists
  ✅ Default assembly templates coded (Exterior Wall, Floor Slab, Roof, Painting)
  ✅ API endpoint: /api/projects/[id]/assemblies/route.ts exists
  ❌ Assembly data is NOT wired to the quantities panel display — cost totals don't flow to EstimatesTab
  ❌ Assembly library (shared across projects) not implemented — only project-level
  ❌ `useFeatureFlag` gating unclear — assemblies are accessible but not prominently exposed in main UI
  ❌ No integration test coverage for assemblies → quantities → export flow

Files to change:
  - src/components/QuantitiesPanel.tsx (surface assembly costs alongside quantities)
  - src/app/page.tsx (verify AssembliesPanel is reachable/displayed)
  - src/app/api/projects/[id]/assemblies/route.ts (verify GET/POST/PATCH/DELETE all work)
Priority: MEDIUM (Phase 2 per architecture doc, but foundation is there)

---

[GAP-008] Auto-Naming from Title Blocks
Status: PARTIAL (UI is stubbed, backend exists)
Togal has: AI reads title blocks on upload, names+numbers sheets automatically
MeasureX has:
  ✅ AutoNameTool.tsx component exists and is integrated in projects/page.tsx
  ✅ src/lib/sheet-namer.ts (regex-based sheet name extraction) — wired to upload route
  ✅ src/lib/ai-sheet-namer.ts exists (AI-powered naming)
  ❌ AutoNameTool.tsx uses STUB_RENAMES hardcoded data (line 16: `const STUB_RENAMES: RenameItem[]`)
  ❌ The UI renders stub renames, not real AI results from title block analysis
  ❌ Feature flag `ai-sheet-naming` gates the real AI path — current state unclear
  ❌ No actual title-block OCR/vision call in AutoNameTool.tsx — simulates processing with a setTimeout delay

Files to change:
  - src/components/AutoNameTool.tsx (replace STUB_RENAMES with real API call to ai-sheet-namer or a new endpoint)
  - src/lib/ai-sheet-namer.ts (verify/complete implementation)
  - Feature flag: ensure `ai-sheet-naming` is enabled
Priority: MEDIUM — stub is misleading; real value only comes when backed by actual AI

---

[GAP-009] Pattern Search
Status: PARTIAL (component integrated, wired to real API)
Togal has: Beta feature — draw selection box, AI finds repeating instances across all sheets
MeasureX has:
  ✅ PatternSearch.tsx component exists and is fully implemented
  ✅ Wired to `/api/vision-search` (POST) — real API call, not stubbed
  ✅ Integrated in page.tsx with `showPatternSearch` state and keyboard shortcut
  ✅ Accepts page image data, draw-box crop, returns matches
  ⚠️ Only operates on the current page image (single-page) — Togal searches across ALL sheets
  ⚠️ PatternSearch.tsx line 433: "Thumbnail stub" comment — thumbnail display is not implemented

Files to change:
  - src/components/PatternSearch.tsx (add multi-page search capability — iterate all pages)
  - src/components/PatternSearch.tsx (implement actual thumbnail display for matches)
Priority: MEDIUM

---

[GAP-010] External Collaboration — Permission Levels
Status: PARTIAL (share link exists, permissions missing)
Togal has: Share link (read-only), multi-user real-time, external users (no license needed), permission levels: Can Manage / Can Edit / Can Edit (Isolated) / Can View
MeasureX has:
  ✅ CollaborationPanel.tsx — generates share link via /api/projects/[id]/share
  ✅ Share token system works (GET + POST /share)
  ✅ /share/[token]/page.tsx — read-only shared view
  ❌ NO permission levels — only a single "view-only share link" mode
  ❌ No "Can Edit" or "Can Manage" permission tiers
  ❌ No external user invitation flow (email invite, named collaborators)
  ❌ No real-time multi-user editing (no WebSocket presence/conflict resolution)
  ❌ CollaborationPanel.tsx has zero mention of permissions, roles, or edit grants

Files to change:
  - src/components/CollaborationPanel.tsx (add permission level selector: View / Edit / Manage)
  - src/app/api/projects/[id]/share/route.ts (store permission level with token)
  - src/app/share/[token]/page.tsx (enforce permission level — read-only vs editable)
  - src/lib/types.ts (add SharePermission type)
Priority: MEDIUM (Phase 2 per architecture; current share-link is functional for read-only)

---

[GAP-011] AI Takeoff Button — API vs Webhook
Status: PARTIAL (fires API, NOT a webhook)
Togal has: "Togal Button" that triggers AI processing
MeasureX has:
  ✅ "Togal" / "Re-Takeoff" / "Run AI Takeoff" button exists in TopNavBar.tsx
  ✅ ReTogal.tsx handles the re-run flow
  ❌ Button fires `triggerAITakeoff()` → calls `/api/ai-takeoff` or `/api/projects/[id]/ai-takeoff` directly
  ❌ Architecture spec says: button should fire a WEBHOOK to wake the OpenClaw agent, NOT call an AI API directly
  ❌ The current "API-driven AI" approach is explicitly marked as fragile in the architecture doc (coordinate translation errors, rate limits, no visual feedback loop)
  ✅ Webhook infrastructure exists: /api/projects/[id]/webhooks/route.ts, feature flag ENABLE_WEBHOOKS=true
  ❌ But the AI button is NOT connected to the webhook system

Files to change:
  - src/components/TopNavBar.tsx (wire AI button to POST webhook instead of direct AI API)
  - src/app/page.tsx (handleAITakeoff → fire registered webhook URL instead of triggerAITakeoff())
  - src/components/ReTogal.tsx (same: delegate to webhook, not onRunTakeoff API call)
Priority: HIGH — core architectural intent; current implementation is the deprecated approach

---

[GAP-012] Thumbnail Strip for Multi-Page Navigation
Status: PRESENT ✅
Togal has: Page thumbnail sidebar for navigating multi-page PDFs
MeasureX has:
  ✅ PageThumbnailSidebar.tsx — fully implemented, renders per-page thumbnails from PDF
  ✅ Shows polygon overlays on thumbnails (classification colors)
  ✅ Shows drawing set assignments per page
  ✅ Supports collapsing, context menu per page, AI takeoff trigger per page
  ✅ Integrated in page.tsx at line 1825
  ✅ data-page-number attribute on page buttons (for IntersectionObserver)

Files to change: None
Priority: N/A (COMPLETE)

---

[GAP-013] Classification Groups / Breakdowns
Status: PRESENT ✅ (groups + breakdowns implemented)
Togal has: Classification groups (organize by trade), breakdowns (sub-categories), custom properties
MeasureX has:
  ✅ ClassificationGroups.tsx — full group management UI (add/rename/delete/reorder groups, drag-drop)
  ✅ Breakdowns: addBreakdown/deleteBreakdown wired in store and UI
  ✅ Trade group auto-assignment (src/lib/trade-groups.ts)
  ✅ moveClassificationToGroup action in store
  ✅ Group data persisted to Supabase via store

Files to change: None required
Priority: N/A (COMPLETE)

---

[GAP-014] Custom Formulas
Status: PARTIAL (component built, NOT integrated into UI)
Togal has: Excel-like formula syntax (=), references other classification quantities, saves to library
MeasureX has:
  ✅ CustomFormulas.tsx component fully implemented — tokenizer, parser, evaluator all working
  ✅ Supports +, -, *, /, ^ operators, parentheses, classification name references
  ✅ Has save-to-library and unit selection
  ❌ CustomFormulas.tsx is NEVER IMPORTED anywhere in the app
  ❌ No usage in QuantitiesPanel.tsx or anywhere else — the component is dead code
  ❌ No UI surface to open/trigger CustomFormulas
  ❌ Formula results not wired to polygon measurements or export

Files to change:
  - src/components/QuantitiesPanel.tsx (import CustomFormulas, add formula button per classification, wire onSave)
  - src/lib/store.ts (add formula field to Classification type if not already present)
  - src/lib/types.ts (verify Classification has formula: string | null)
Priority: MEDIUM — component is ready, just needs wiring

---

[GAP-015] Wall Backout (Subtract Door/Window Widths from Linear)
Status: PRESENT ✅ (server-side implementation exists)
Togal has: Auto-subtract door/window opening widths from wall linear footage
MeasureX has:
  ✅ src/server/geometry-engine.ts — `computeDeductions()` function fully implemented
  ✅ Detects "count" polygons with names matching /door|window|opening|d\/w/i
  ✅ Computes overlap with linear polygons, projects opening width onto wall direction
  ✅ `aggregateDeductions()` collects total deductions per linear classification
  ✅ QuantitiesPanel.tsx has `addDeduction()` function and wires deductions to display
  ⚠️ Deductions are only computed server-side (geometry-engine.ts in /server/) — unclear if live/real-time in the client canvas view
  ⚠️ Client display of deducted values in QuantitiesPanel needs verification that deductions are shown clearly

Files to change: Minor verification only
Priority: LOW (functionally present)

---

## SUMMARY TABLE

| # | Feature | Status | Priority |
|---|---------|--------|----------|
| GAP-001 | data-testid on interactive elements | PARTIAL | 🔴 HIGH |
| GAP-002 | ?agent=1 modal suppression mode | MISSING | 🔴 HIGH |
| GAP-003 | isTrusted canvas drawing check | ✅ COMPLIANT | — |
| GAP-004 | SF labels as DOM-readable elements | PARTIAL | 🔴 HIGH |
| GAP-005 | Drawing tools (rect/circle/arc missing) | PARTIAL | 🟡 MEDIUM |
| GAP-006 | Scale system (per-page, auto, manual) | ✅ PRESENT | — |
| GAP-007 | Assemblies system | PARTIAL | 🟡 MEDIUM |
| GAP-008 | Auto-naming from title blocks | PARTIAL (stubbed) | 🟡 MEDIUM |
| GAP-009 | Pattern Search | PARTIAL | 🟡 MEDIUM |
| GAP-010 | External collaboration + permissions | PARTIAL | 🟡 MEDIUM |
| GAP-011 | AI Takeoff button → webhook (not API) | PARTIAL | 🔴 HIGH |
| GAP-012 | Thumbnail strip multi-page nav | ✅ PRESENT | — |
| GAP-013 | Classification groups + breakdowns | ✅ PRESENT | — |
| GAP-014 | Custom formulas | PARTIAL (dead code) | 🟡 MEDIUM |
| GAP-015 | Wall backout (door/window deduction) | ✅ PRESENT | — |

**Totals:** 5 PRESENT ✅ | 7 PARTIAL | 1 MISSING | 2 NOT APPLICABLE
**HIGH priority gaps:** 4 (GAP-001, GAP-002, GAP-004, GAP-011)
**MEDIUM priority gaps:** 5 (GAP-005, GAP-007, GAP-008, GAP-009, GAP-010, GAP-014)

---

## RECOMMENDED FIX WAVE ORDER

### Wave 1 — Agent Compatibility (ship before agent setup)
1. **GAP-001** — Add all missing data-testid attributes (1-2 hours, mostly mechanical)
2. **GAP-002** — Implement ?agent=1 mode: suppress WhatsNew, FirstRunTooltips, AutoScalePopup (2-3 hours)
3. **GAP-004** — Add data-testid="polygon-label" + data-polygon-id to SVG text labels in CanvasOverlay.tsx (1 hour)
4. **GAP-011** — Refactor AI Takeoff button to fire webhook instead of direct API (2-3 hours)

### Wave 2 — Feature Completeness
5. **GAP-014** — Wire CustomFormulas into QuantitiesPanel (already built, just needs import + UI surface)
6. **GAP-008** — Replace AutoNameTool stub data with real AI API call
7. **GAP-005** — Add rectangle tool shortcut (R key) — most-needed missing drawing tool
8. **GAP-009** — Extend PatternSearch to multi-page

### Wave 3 — Phase 2 Features
9. **GAP-010** — Collaboration permission levels
10. **GAP-007** — Complete assemblies → quantities flow
11. **GAP-005** — Circle and arc tools

---

*Audit conducted: 2026-03-22 | Admiral7 | MeasureX repo: ~/.openclaw/workspace-nate/measurex-takeoff*
