# MeasureX Takeoff V14 — Full Rebuild Spec

## What This Is
Construction plan takeoff tool. Upload blueprint PDFs → draw/measure polygons → classify areas/lengths/counts → export to Excel. Dark theme (#1a1a2e), professional quality.

## Tech Stack
- Next.js 16 (App Router) + React 19 + TypeScript strict
- Zustand 5 state management
- pdfjs-dist (bundled, NO CDN script injection)
- Fabric.js 7 (canvas overlay for drawing)
- @turf/turf (polygon geometry operations)
- Supabase (project save/load)
- Tailwind CSS 4 + shadcn components
- lucide-react icons ONLY (no emoji in UI)
- xlsx for Excel export

## Architecture Rules
1. **Types first** — define all interfaces in `src/lib/types.ts` (shared across all sections)
2. **No `any`** — use proper types everywhere
3. **Single pdf.js strategy** — import from `pdfjs-dist` only, set workerSrc from CDN matching installed version
4. **Error boundaries** — all async operations get try/catch + user-facing error states
5. **Zustand actions return values** — addClassification returns the new ID, not void
6. **Undo/redo captures ALL mutations** — every store action that modifies polygons/classifications pushes to history
7. **ResizeObserver** on all containers that affect layout
8. **Keyboard handlers** check `document.activeElement` before firing (don't intercept input fields)

## Shared Types (src/lib/types.ts) — ALL SECTIONS USE THESE

```typescript
export interface Point { x: number; y: number }

export interface Polygon {
  id: string;
  points: Point[];
  classificationId: string;
  pageNumber: number;
  area: number; // in pixels, converted at display time via scale
  linearFeet: number;
  isComplete: boolean;
  label?: string;
}

export interface Classification {
  id: string;
  name: string;
  color: string; // hex color
  type: 'area' | 'linear' | 'count';
  visible: boolean;
}

export interface ScaleCalibration {
  pixelsPerUnit: number;
  unit: 'ft' | 'in' | 'm' | 'mm';
  label: string;
  source: 'manual' | 'auto' | 'ai';
  confidence?: number;
}

export interface ProjectState {
  classifications: Classification[];
  polygons: Polygon[];
  scale: ScaleCalibration | null;
  scales: Record<number, ScaleCalibration>; // per-page scales
  currentPage: number;
  totalPages: number;
}

export interface DetectedElement {
  name: string;
  type: 'area' | 'linear' | 'count';
  points: Point[];
  color?: string;
  confidence?: number;
}

export interface PDFViewerHandle {
  containerEl: HTMLDivElement | null;
  zoom: number;
  pan: Point;
  pageDimensions: { width: number; height: number };
  goToPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  fitToPage: () => void;
  getPageCanvas: () => HTMLCanvasElement | null;
}
```

---

## SECTION 1 — Core App + API (Admiral 5)
**Files to write:**
- `src/lib/types.ts` (shared types above)
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/projects/page.tsx`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/api/ai-takeoff/route.ts`
- `src/app/api/drawings/route.ts`
- `src/app/api/polygons/route.ts`

**Requirements:**
- layout.tsx: title "MeasureX Takeoff", description "Construction plan takeoff tool", themeColor "#1a1a2e"
- page.tsx: Main editor page. Upload PDF → render via PDFViewer → overlay drawing tools → right panel for classifications/quantities
  - Project load uses `store.hydrateState()` (preserves IDs, no re-generation)
  - AI screenshot targets `pdfViewerRef.current.getPageCanvas()` explicitly
  - Error handling on all fetch calls with user-facing status
  - File upload via drag-drop with proper a11y (aria-describedby, role)
  - Use lucide-react icons only (File, Upload, etc.)
- projects/page.tsx: Project list with create/open/delete, defensive null checks, aria-labels
- API routes: All routes validate input, return proper error shapes, use Supabase service client

**Key fix from audit:** hydrateState must set classifications, polygons, scale, and scales WITHOUT generating new IDs.

---

## SECTION 2 — PDF + Canvas Components (Admiral 6)
**Files to write:**
- `src/components/PDFViewer.tsx`
- `src/components/CanvasOverlay.tsx`
- `src/components/DrawingTool.tsx`
- `src/components/MergeSplitTool.tsx`
- `src/components/MeasurementTool.tsx`
- `src/components/ScaleCalibration.tsx`
- `src/components/ScalePopup.tsx`
- `src/components/ContextMenu.tsx`

**Requirements:**
- PDFViewer: Single pdf.js import (pdfjs-dist). No CDN script tag injection.
  - workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`
  - Render queue: track pendingRender, re-render after current completes if newer request exists
  - ResizeObserver on containerRef — debounced fitToPage recalc
  - Zoom-to-cursor: compute content point under mouse, adjust pan after zoom so cursor stays over same point
  - Pointer capture: handle pointercancel/pointerout to clear isPanning
  - Text extraction preserves newlines (join with \n not space)
  - Expose `getPageCanvas()` on imperative handle
  - Use proper pdfjs-dist types (PDFDocumentProxy, PDFPageProxy)
- CanvasOverlay: Fabric.js canvas synced with PDFViewer zoom/pan
- DrawingTool: Click-to-place points, close polygon on click near start, ESC to cancel
- MergeSplitTool: Wire to turf.js merge/split (from polygon-utils), push undo records
- MeasurementTool: Two-point distance measurement, shows real-world units based on scale
- ScaleCalibration: Click two points on drawing, enter known distance, compute pixelsPerUnit
- ScalePopup: Auto-detected scale display with accept/reject
- ContextMenu: Right-click polygon → reclassify, delete, properties, merge/split options

---

## SECTION 3 — UI Panels + Toolbar (Admiral 7)
**Files to write:**
- `src/components/TopNavBar.tsx`
- `src/components/LeftToolbar.tsx`
- `src/components/BottomStatusBar.tsx`
- `src/components/QuantitiesPanel.tsx`
- `src/components/PolygonProperties.tsx`
- `src/components/ui/button.tsx`

**Requirements:**
- TopNavBar: Project name, page nav (Prev/Next with page X of Y), zoom controls, save/load, export, AI takeoff button
- LeftToolbar: Tool selection — Select, Draw Area, Draw Linear, Draw Count, Measure, Calibrate Scale, Merge/Split, Pan
  - Active tool highlighted, tooltips, keyboard shortcuts shown
- BottomStatusBar: Current scale display, zoom %, coordinates under cursor, active tool name
- QuantitiesPanel: Right sidebar. Classification list with color swatch, visibility toggle, count/area/linear totals.
  - Add/edit/delete classifications
  - Name validation (no duplicates, trimmed)
  - Color picker
  - Type selector (area/linear/count)
  - Per-classification totals computed from polygons on current page AND all pages
  - Expandable: click classification → show individual polygons belonging to it
- PolygonProperties: Selected polygon details — area/length, classification, label, page number
- button.tsx: shadcn button component (keep existing)

---

## SECTION 4 — State + Logic (Admiral 8)
**Files to write:**
- `src/lib/store.ts`
- `src/lib/polygon-utils.ts`
- `src/lib/auto-scale.ts`
- `src/lib/ai-takeoff.ts`
- `src/lib/ai-results-loader.ts`
- `src/lib/export.ts`
- `src/lib/supabase.ts`
- `src/lib/utils.ts`

**Requirements:**
- store.ts: Zustand store with ALL of these actions returning proper values:
  - `addClassification` → returns new ID
  - `addPolygon` → returns new ID
  - `hydrateState(state: ProjectState)` → sets all state without generating new IDs
  - `undo/redo` — captures ALL mutations: add/delete/update polygon, add/delete/update classification, merge, split, cut, visibility toggle, reclassify
  - `setScaleForPage(page: number, scale: ScaleCalibration)` and `getScaleForPage(page: number)`
  - Classification CRUD with name normalization (trim, case-insensitive dedup check)
  - Color validation (must be valid hex)
  - `selectedPolygon` cleared when its polygon/classification is deleted
- polygon-utils.ts:
  - `mergePolygons` using turf.union (via featureCollection for v7)
  - `splitPolygonByLine` using turf.difference
  - `calculateArea(points)` — shoelace formula
  - `calculateLinearFeet(points, pixelsPerUnit, closed?)` — sum segment lengths, closed param controls last→first
  - `pointInPolygon(point, polygon)` — ray casting
  - All functions properly typed, no implicit any
- auto-scale.ts:
  - Parse imperial: handle en-dash, em-dash, no-space variants
  - Parse metric
  - Return `{ scale: ScaleCalibration, confidence: number, matchIndex: number }` or null
  - Document DPI assumptions (72 for PDF points)
- ai-takeoff.ts:
  - OpenAI vision call with retry (2 attempts, 3s delay)
  - Zod schema validation on response
  - Downscale image to max 2048px edge before sending
  - Return typed DetectedElement[]
  - Catch and surface meaningful errors
- ai-results-loader.ts:
  - NO setTimeout — zustand updates are synchronous
  - After addClassification, immediately read store.classifications to find new entry
  - Color: `el.color || '#3b82f6'` (no ternary bug)
  - Count markers scale with zoom
- export.ts:
  - Excel export with per-page grouping
  - Separate sheets or sections for area/linear/count
  - Totals row per type, not mixed
  - Proper unit conversion via scale
- supabase.ts: Expose `isConfigured()` for UI gating
- utils.ts: cn helper + any shared formatters

---

## Build Verification
After ALL sections are written, the build MUST pass:
```bash
cd measurex-takeoff && npx next build
```
Zero TypeScript errors. Zero warnings. Clean build or it's not done.
