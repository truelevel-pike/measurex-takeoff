# Admiral 5 — Master Audit Report
**Date:** 2026-03-18  
**Engineers:** E6, E7, E8, E9, E10  
**Total Issues:** 48  

---

## CRITICAL (3)

| # | Engineer | File | Line | Issue |
|---|----------|------|------|-------|
| C1 | E8 | `src/app/api/projects/[id]/route.ts` | 7 | `id` path param never validated/sanitized before file-path use — path traversal risk |
| C2 | E8 | `src/app/api/projects/[id]/pdf/route.ts` | 16 | Unsanitized `id` interpolated into filesystem path for PDF reads — path traversal |
| C3 | E9 | `src/lib/store.ts` | 213 | Store mutations are purely local — no API sync contract; classifications/polygon updates never persisted to REST, lost on reload |

---

## HIGH (20)

### DrawingTool (E6)
- **H1** `DrawingTool.tsx:11` — Edge snapping hard-disabled (`edges: false`, `grid: false`); user snap toggles from store are completely ignored
- **H2** `DrawingTool.tsx:11` — Snapping never reads `snappingEnabled`/`gridEnabled`/`gridSize` from store — user settings have zero effect
- **H3** `DrawingTool.tsx:75` — Linear measurements computed as closed perimeters (last→first included) — wrong for open linear takeoffs

### CanvasOverlay (E7)
- **H4** `CanvasOverlay.tsx:98` — Vertex drag never recomputes `area`/`linearFeet` — measurements go stale after any drag edit
- **H5** `CanvasOverlay.tsx:258` — Polygon labels use `poly.area` for ALL classification types — linear and count classes show wrong values/units

### API Routes (E8)
- **H6** `api/projects/[id]/route.ts:70` — PUT returns 200 with `{ project: null }` for missing project; should be 404
- **H7** `api/projects/[id]/route.ts:81` — DELETE always returns 200; missing 404 for absent project
- **H8** `api/projects/[id]/pages/route.ts:8` — GET /pages doesn't verify project exists; returns 200 empty for nonexistent project
- **H9** `api/projects/[id]/upload/route.ts:10` — Upload never verifies project exists; throws 500 instead of 404
- **H10** `api/projects/[id]/upload/route.ts:10` — No file MIME type/extension/size validation — accepts non-PDF payloads
- **H11** `api/projects/[id]/upload/route.ts:18` — PDF stored at `data/uploads/{id}.pdf`; AI route expects `data/projects/{id}/drawing.pdf` — path mismatch breaks AI takeoff after upload
- **H12** `api/projects/[id]/polygons/route.ts:23` — No validation for points array shape, min vertex count, numeric coords, page bounds
- **H13** `api/projects/[id]/polygons/route.ts:23` — No verification `classificationId` exists — orphan polygons can be created
- **H14** `api/projects/[id]/ai-takeoff/route.ts:14` — AI takeoff accepts NaN/fractional/invalid page values
- **H15** `api/projects/[id]/ai-takeoff/route.ts:38` — AI path `data/projects/{id}/drawing.pdf` inconsistent with upload storage path
- **H16** `api/projects/[id]/ai-takeoff/apply/route.ts:61` — No per-element schema validation on AI output; malformed AI response corrupts persisted data
- **MISSING** — No multi-scale endpoints (per-page calibration); single scale object can't support multi-page plans
- **MISSING** — No AI job lifecycle endpoints (POST job, poll status, cancel/retry) — forces blocking synchronous AI calls

### Store (E9)
- **H17** `store.ts:276` — SSE/server updates use same mutating actions as user edits, polluting undo/redo history with remote events
- **H18** `store.ts:20` — Undo snapshots exclude groups, assemblies, sheetNames, markups, snapping — undo behavior is incomplete
- **H19** `store.ts:375` — `setCurrentPage` doesn't reconcile scale with `scales[page]`; multi-page projects use stale scale after navigation
- **H20** `store.ts:145` — `pageBaseDimensions` is a single global, not page-keyed; multi-page PDFs with different sizes break coordinate transforms

### page.tsx (E10)
- **H21** `page.tsx:403` — `A` keyboard shortcut fires `handleAITakeoff()` instead of switching to AI tool — conflicts with `toolKeys.a = 'ai'`
- **H22** `page.tsx:782` — `currentTool === 'ai'` is never wired to any rendered panel — AI tool selection changes state but does nothing visible
- **H23** `page.tsx:266` — `hydrateProject` has no cancellation/staleness guard; overlapping loads can overwrite newer state with older response
- **H24** `page.tsx:521` — `ensureProject` races on rapid uploads before `setProjectId` resolves — can create duplicate projects
- **H25** `page.tsx:600` — Scale acceptance uses `currentPageNum` at click time; navigating before accepting saves calibration to wrong page
- **H26** `page.tsx:482` — Individual polygon POSTs race with autosave PUT — dual-write can produce duplicate-key conflicts

---

## MEDIUM (19)

### DrawingTool (E6)
- **M1** `DrawingTool.tsx:57` — Snap candidate set not page-scoped; passes all polygons including other pages to snap engine
- **M2** `DrawingTool.tsx:66` — Linear measurement mode incomplete: `commitPolygon` requires ≥3 points, so 2-point lines can't be committed
- **M3** `DrawingTool.tsx:221` — Measurement preview is area-only; no live length preview for linear classifications
- **M4** `DrawingTool.tsx:123` — Double-click drops the final vertex (deferred click strategy cancels pending point before `commitPolygon`)
- **M5** `DrawingTool.tsx:43` — Close threshold hard-coded at 25px; no configurability or zoom-context sensitivity

### CanvasOverlay (E7)
- **M6** `CanvasOverlay.tsx:253` — Label anchor uses vertex-average centroid; can land outside concave/complex polygons
- **M7** `CanvasOverlay.tsx:61` — Coordinate normalization divides by `rect.width/height` without zero-guard; can produce NaN/Infinity coords on drag
- **M8** `CanvasOverlay.tsx:68` — Vertex dragging is mouse-only; no pointer/touch support — broken on tablet/pen input
- **M9** `CanvasOverlay.tsx:47` — `pageBaseDimensions` can lag on page switch; polygons briefly render with prior-page dimensions

### API Routes (E8)
- **M10** `api/projects/[id]/route.ts:17` — JSON parse failures return 500 instead of 400
- **M11** `api/projects/[id]/upload/route.ts:24` — Re-upload with fewer pages leaves stale old page records
- **M12** `api/projects/[id]/scale/route.ts:22` — Scale POST accepts negative values and invalid types
- **M13** `api/projects/[id]/classifications/route.ts:22` — No enum validation for `type`, no color format validation, no dupe-name guard
- **M14** `api/projects/[id]/export/json/route.ts:18` — JSON export omits assemblies/costs/history — incomplete for full takeoff portability
- **MISSING** — No batch polygon endpoints (bulk create/update/delete) for AI apply and high-volume edits
- **MISSING** — No estimate summary endpoints (quantities + assemblies + unit costs → bid totals)

### Store (E9)
- **M15** `store.ts:48` — Visibility in two systems (`classification.visible` + `hiddenClassificationIds`); can desync
- **M16** `store.ts:46` — `selectedPolygon` and `selectedPolygonId` duplicate same concept; drift risk
- **M17** `store.ts:276` — History pushed on no-op mutations; no max bound — unbounded memory growth
- **M18** `store.ts:582` — Persist `partialize` omits `markups` and page geometry — lost on reload

### page.tsx (E10)
- **M19** `page.tsx:440` — PDF texture capture fires before PDF is ready; missed on first load if doc still null at 500ms
- **M20** `page.tsx:394` — Delete/Backspace doesn't call `preventDefault()` — browser navigation can fire during polygon delete
- **M21** `page.tsx:466` — Autosave fingerprint uses full `JSON.stringify` on classifications/polygons — expensive for large takeoffs

---

## LOW (6)

- **L1** `DrawingTool.tsx:140` — Double-click finalizes from anywhere; no proximity-to-start guard
- **L2** `DrawingTool.tsx:66` — `commitPolygon` uses `scale` but omits it from `useCallback` deps — stale scale on linear conversion
- **L3** `CanvasOverlay.tsx:296` — Calibration overlays not page-scoped; markers appear on unrelated pages after navigation
- **L4** `CanvasOverlay.tsx:209` — No defensive finite-number validation on polygon points; malformed data yields invalid SVG
- **L5** `page.tsx:545` — Non-PDF file input silently ignored; no user feedback on upload validation failure
- **L6** `page.tsx:625` — New project save uses blocking `prompt()` — bad UX, broken on mobile

---

## Missing Endpoints Summary (E8)
- Multi-scale per-page CRUD
- AI job lifecycle (create/poll/cancel/retry/feedback)
- Batch polygon CRUD
- Assembly library/template catalog
- Estimate summary (quantities + assemblies + costs)
- CSV + PDF estimate exports
- Undo/redo via history API
- Measurement CRUD beyond polygon-centric storage

---

*Report compiled by Admiral 5 from E6–E10 audit outputs.*
