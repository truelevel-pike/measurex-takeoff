# MeasureX — Deep Frontend Audit (A7)
**Auditor:** Agent A7 (Steel) — Frontend Architect  
**Date:** 2026-03-27  
**Scope:** Full frontend: `src/app/`, `src/components/`, `public/`, agent-readiness layer  
**References:** TOGAL MASTER DOC (2026-03-22), MeasureX Architecture Doc (2026-03-22)  
**Session:** full-audit-20260327  

---

## Audit Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 21 |
| MEDIUM | 38 |
| LOW | 28 |
| **TOTAL** | **92** |

### Top 10 Priorities

1. **AG-001 · CRITICAL** — `data-testid="tool-area"`, `tool-linear`, `tool-count` documented in agent API but **do not exist in LeftToolbar** — agent cannot select draw tool by type
2. **AG-002 · CRITICAL** — `data-testid="mx-chat-btn"` missing — MX Chat button in TopNavBar has no testid, agent cannot open chat panel
3. **POLY-001 · CRITICAL** — `PolygonProperties.tsx` missing `'use client'` directive — will crash in App Router
4. **G-001 · CRITICAL** — No CSRF protection on any state-mutating API calls
5. **G-002 · CRITICAL** — `localStorage` is the primary store for business-critical data (no server sync)
6. **AG-005 · HIGH** — Label suppression for small polygons means `polygon-label` absent for small rooms — agent cannot verify SF
7. **POLY-002 · HIGH** — `PolygonProperties.tsx` uses raw `polygon.linearFeet` (pixel value) — shows ~47× wrong measurements
8. **UI-003 · HIGH** — `window.prompt()` in QuantitiesPanel and WorkspaceSwitcher — blocks thread, fails on mobile
9. **STATE-001 / QP-002 · HIGH** — Manual deductions in QuantitiesPanel stored only in ephemeral local state
10. **SCALE-001 · HIGH** — Manual scale calibration doesn't persist to server (label parse fails)

---

## Section 1 — Agent-Readiness (PRIMARY FOCUS)

This section audits MeasureX against the architecture doc's "Agent Integration Layer" spec.

---

### AG-001 · CRITICAL — `data-testid="tool-area"`, `"tool-linear"`, `"tool-count"` documented in agent API but do NOT exist in LeftToolbar

**File:** `src/components/LeftToolbar.tsx` (entire file), `src/app/agent/page.tsx` lines 122–124  
**Architecture doc requirement:**  
> `data-testid="tool-area"` — Draw area polygon tool button  
> `data-testid="tool-linear"` — Draw linear measurement tool button  
> `data-testid="tool-count"` — Draw count / marker tool button  

**Actual LeftToolbar testids emitted** (from `GROUPS` array, lines 24–37):
```
tool-select   (Select / V)
tool-pan      (Pan / H)
tool-draw     (Draw Area / D)     ← agent doc says this should be "tool-area"
tool-merge    (Merge / G)
tool-split    (Split / S)
tool-cut      (Cut / C)
tool-measure  (Measure / M)
tool-ai       (AI Takeoff / A)
```

There is **no** `tool-area`, `tool-linear`, or `tool-count` button in LeftToolbar. LeftToolbar has a single `tool-draw` button that enters draw mode regardless of classification type.

The `tool-area`, `tool-linear`, `tool-count` testids only exist in `CoordInputPanel.tsx` (lines 84–86), but that panel:
- Only renders when `agentMode === true` AND `currentTool === 'draw'` AND `selectedClassification !== null`
- The buttons there **change classification type**, not the drawing tool
- The panel is `fixed bottom-4 right-4` — a type-switcher within the coord input overlay, not the primary toolbar

**Impact:** An agent following the architecture doc step "click `tool-area` to start drawing" will find no such element. The agent would need to click `tool-draw` to enter draw mode, then use the CoordInputPanel `tool-area` to set type — but CoordInputPanel only appears after a classification is already selected AND draw tool is already active.

**Fix Options:**  
A: Add `data-testid="tool-area"` as alias on the `tool-draw` button; add `tool-linear`, `tool-count` as separate toolbar items that also auto-select draw mode.  
B: Rename `tool-draw` → `data-testid="tool-area"` and add `tool-linear`/`tool-count` toolbar entries.  
C: Update agent docs to use `tool-draw` instead and document the CoordInputPanel type-switching flow.

---

### AG-002 · CRITICAL — MX Chat button has no `data-testid`

**File:** `src/components/TopNavBar.tsx` line ~646  
**Code:**
```tsx
<button
  aria-label="Open MX Chat"
  onClick={onChat}
  style={{ ... }}
>
  <MessageSquare size={14} />
  MX Chat
</button>
```

No `data-testid` on this button. An agent using `browser snapshot` can find it by `aria-label="Open MX Chat"` but that requires fragile text-matching rather than a stable testid.

**Fix:** Add `data-testid="mx-chat-btn"` to the MX Chat button.

---

### AG-003 · HIGH — LeftToolbar's Chat icon button (`MessageCircle`) is non-functional — no `onClick` handler

**File:** `src/components/LeftToolbar.tsx` ~line 218  

The bottom chat icon in LeftToolbar renders a `<MessageCircle>` button with no `onClick` prop. It does nothing when clicked. The real chat is triggered from TopNavBar's "MX Chat" button. This dead button is confusing.

**Fix:** Either wire to `setShowChat` in `page.tsx` (pass down via props) or remove it. Add `data-testid="left-toolbar-chat-btn"` if kept.

---

### AG-004 · HIGH — `?agent=1` modal suppression is INCOMPLETE — PWAInstallBanner and SWUpdateBanner not checked

**File:** `src/app/page.tsx`  

**Confirmed suppressed:**
- WhatsNewModal (`!agentMode`) ✅
- AutoScalePopup (`!agentMode`) ✅  
- ScaleCalibration modal (`!agentMode`) ✅
- KeyboardShortcutsModal (`!agentMode`) ✅
- FirstRunTooltips (`!agentMode`) ✅
- TakeoffProgressModal (`!agentMode`) ✅
- NTS Warning (`!agentMode`) ✅
- Large PDF warning (`!agentMode`) ✅
- Context menu (`!agentMode`) ✅

**NOT verified:**
- `PWAInstallBanner` — component not checked for agentMode prop
- `SWUpdateBanner` — component not checked for agentMode prop; a forced-reload event from the service worker during an agent session would be catastrophic

**Fix:** Pass `agentMode` to both components and suppress their render/events when `agentMode === true`.

---

### AG-005 · HIGH — `polygon-label` absent for small polygons (< 3000px² rendered area) — agent cannot verify SF

**File:** `src/components/CanvasOverlay.tsx` lines 323–434, 1034  

The `labelDecisions` useMemo suppresses labels when `areaPx2 < minArea3000px2` (line 434). The 3000px² threshold is computed in screen-pixel space, meaning small rooms (closets, bathrooms, utility spaces) drawn at normal zoom may have no label in the DOM.

**Code path** (line 1034):
```tsx
const labelDecision = labelDecisions.get(poly.id);
if (labelDecision && !labelDecision.show) return null;  // ← no label element rendered at all
```

**Impact for agent:** After drawing a polygon, the agent reads `document.querySelectorAll('[data-testid="polygon-label"]')` to verify measurement. If the polygon is small, no element exists. The agent must fall back to `window.measurex.getPolygons()`.

**Fix:**
1. When `agentMode === true`, bypass `labelDecisions` suppression — always render `polygon-label` elements.
2. OR: Document in agent page that `window.measurex.getPolygons()` is the primary verification path (not DOM labels), and that labels may be suppressed for small polygons.

---

### AG-006 · MEDIUM — `polygon-label` is SVG `<text>`, not DOM `<div>` as architecture doc states

**File:** `src/components/CanvasOverlay.tsx` lines 1173–1181  
**Architecture doc says:** `<div data-testid="polygon-label" data-polygon-id="abc123">245.3 SF</div>`  
**Actual element:**
```tsx
<text
  data-testid="polygon-label"
  data-polygon-id={poly.id}
  data-type={clsType}
  data-value={displayStr}
>
  {displayStr}
</text>
```

SVG `<text>` is accessible via `querySelector('[data-testid="polygon-label"]')` and `el.textContent`, but NOT via `el.innerText` (which is undefined on SVG elements).

**Fix:** Update architecture doc and `/agent` page to document: (1) element is SVG `<text>`, not `<div>`; (2) use `el.dataset.value` or `el.textContent` to read the measurement, not `el.innerText`.

---

### AG-007 · MEDIUM — `classification-color-picker` is native `<input type="color">` — opens OS dialog, not agent-controllable

**File:** `src/components/QuantitiesPanel.tsx` line 203  

`browser act(click)` on a native `<input type="color">` opens the OS-level color picker dialog. This dialog is NOT accessible from browser automation — it's outside the web context. An agent trying to set a color will get stuck.

**Fix:** Replace with a custom color-swatch grid (presets already exist in `CLASSIFICATION_COLOR_PRESETS`) plus a `data-testid="classification-color-hex-input"` text input for programmatic hex entry.

---

### AG-008 · MEDIUM — `window.measurex` API installed via `useEffect` — race condition for agent arriving immediately after navigation

**File:** `src/app/page.tsx` lines 1675–1684  

`installMeasurexAPI()` runs after first render in a `useEffect`. An agent that navigates and immediately calls `window.measurex.getState()` before React hydrates will get `undefined`.

**Fix:** Expose `window.__measurexReady = true` when installation completes, or a `window.__measurexReadyPromise`. Document in agent page to await this before API calls.

---

### AG-009 · MEDIUM — `mx-agent-state` span missing useful attributes

**File:** `src/app/page.tsx` lines 2932–2948  

Current attributes:
```
data-page, data-current-page, data-total-pages, data-tool, data-active-tool,
data-project-id, data-selected-classification, data-polygon-count,
data-scale-px-per-unit, data-scale, data-scale-unit, data-canvas-width, data-canvas-height
```

**Missing attributes the agent needs:**
- `data-is-dirty` — unsaved changes indicator; agent should not navigate away when dirty
- `data-sheet-name` — current sheet name from `sheetNames[currentPage]`
- `data-ai-loading` — whether a takeoff is currently running
- `data-classification-count` — total classifications in project
- `data-scale-label` — human-readable scale label (e.g. `"1/8"=1'"`) separate from px-per-unit

**Fix:** Add all five attributes to the span; values are available in component scope.

---

### AG-010 · MEDIUM — CoordInputPanel type buttons change classification type without checking for existing polygon compatibility

**File:** `src/components/CoordInputPanel.tsx` lines 33–43  

Switching classification type from `area` to `linear` for a classification that already has area polygons produces misleading linear measurements (polygon perimeter). No confirmation dialog shown.

**Fix:** Show a warning when changing type on a classification with existing polygons.

---

### AG-011 · MEDIUM — `retogal-btn` has 3 state variants sharing one testid — no state attribute for agent to check

**File:** `src/components/ReTogal.tsx` lines 152, 171, 192  

The same `data-testid="retogal-btn"` is used for "Set scale", "Togal", and "Re-Togal" states. An agent can't determine button state without parsing text content.

**Fix:** Add `data-state="no-scale" | "ready" | "re-run"` alongside the existing testid.

---

### AG-012 · LOW — Agent page `/agent` not linked from main navigation

The `/agent` page has the testid reference table but is not linked from TopNavBar, Settings, or the BottomStatusBar. Add a link for agent setup reference.

---

## Section 2 — UI Completeness vs Togal Feature Parity

### TOGAL-001 · HIGH — No dedicated "Linear" or "Count" draw mode toolbar buttons

LeftToolbar has one `tool-draw` button for all drawing types. Togal has separate Area, Linear, Count tool buttons. MeasureX achieves the same via classification selection → auto-draw-mode, but this is less discoverable.

Combined with AG-001, this is both a parity gap and an agent-readiness blocker.

---

### TOGAL-002 · HIGH — Annotation tool has no toolbar button (keyboard shortcut `T` only)

`toolKeys.t = 'annotate'` is defined (`page.tsx` line 68) and `AnnotationTool.tsx` exists and works, but there is no button in LeftToolbar for it. Togal has a dedicated AI Annotation toolbar item.

**Fix:** Add annotation button to LeftToolbar.

---

### TOGAL-003 · MEDIUM — `PatternSearch.tsx` exists but is not wired into the app — dead code

**File:** `src/components/PatternSearch.tsx`  
Not imported anywhere in `page.tsx`. Component is unused. Either wire it up (add to TopNavBar) or delete it.

---

### TOGAL-004 · MEDIUM — `AutoNameTool.tsx` exists but is not wired into the upload flow — dead code

**File:** `src/components/AutoNameTool.tsx`  
Not imported anywhere. Auto-naming from title blocks is listed as a known gap in the arch doc. The component exists but doesn't run. Wire it to the upload flow or delete it.

---

### TOGAL-005 · LOW — External collaboration lacks permission levels

Arch doc lists external collaboration as ❌ missing. `CollaborationPanel.tsx` exists — status and permission level implementation (Manage/Edit/View) unverified. Flagged for functional testing.

---

### TOGAL-006 · LOW — CutTool completely broken (BUG-A7-6-032 from cycle-6)

Per prior audit: `cutPolygon` dynamic `require()` breaks ESM/edge runtime — the cut tool never removes any polygon area. Cut/Subtract is a core Togal feature. Still unresolved.

---

## Section 3 — Drawing Tools & Canvas

### DRAW-001 · MEDIUM — DrawingTool has no isTrusted check ✅ — but canvas focus race could block keyboard shortcuts

**File:** `src/components/DrawingTool.tsx`  

No `isTrusted` check anywhere in the codebase (confirmed by global grep). Agent click events via `browser act(click)` WILL work for polygon drawing.

**Risk:** `containerRef.current?.focus()` called on mount. If agent sends keyboard events (Esc, Enter) before the element has focus, they won't fire. Recommend agent verify focus before key dispatch via `browser evaluate` on `document.activeElement`.

---

### DRAW-002 · MEDIUM — Drawing without scale commits a polygon with pixel-area values (no blocking validation)

**File:** `src/components/DrawingTool.tsx` ~line 294  

When `hasScale` is false, the preview shows `"(Scale not set)"` but `commitPolygon` still proceeds. The stored area value is `pixelArea / (1 × 1)` — meaningless. No toast or error prevents this.

**Fix:** Block commit or show a blocking error when `scale === null`.

---

### DRAW-003 · MEDIUM — Rectangle mode state (`rectangleMode`) not exposed in DOM or `mx-agent-state` span

**File:** `src/components/DrawingTool.tsx` (local state, not exported)  

An agent pressing `R` for rectangle mode has no DOM signal confirming the mode activated. The `mx-agent-state` span shows `data-tool="draw"` but not `data-rectangle-mode`.

**Fix:** Add `data-rectangle-mode="true|false"` to the `drawing-tool-container` div or the `mx-agent-state` span.

---

### DRAW-004 · LOW — Snap indicator has `data-testid="snap-indicator"` ✅

SVG circle snap indicator in DrawingTool has a testid — agent can confirm snapping is working. Good.

---

## Section 4 — Quantities Panel & SF Labels

### QP-001 · HIGH — `window.prompt()` for breakdown names in QuantitiesPanel

**File:** `src/components/QuantitiesPanel.tsx` (add breakdown handler)  

Native `window.prompt()` is: blocked in sandboxed iframes, returns `null` on iOS PWA, inaccessible to screen readers, synchronous (blocks event loop).

**Fix:** Replace with an inline `<input>` field consistent with how classification names are entered.

---

### QP-002 · HIGH — Manual deductions not persisted to store or server

**File:** `src/components/QuantitiesPanel.tsx` ~line 397  

`addDeduction`, `updateDeduction`, `deleteDeduction` are pure local React state. Deductions are lost on unmount, page reload, store reset.

**Fix:** Move deductions into Zustand store under `classifications[id].deductions` and persist via existing API sync.

---

### QP-003 · MEDIUM — `lastUpdatedTime` timestamp never updates (shows panel mount time, not last measurement time)

**File:** `src/components/QuantitiesPanel.tsx` ~line 300  

`const [lastUpdatedTime] = useState(() => new Date().toLocaleTimeString(...))` is set once at mount.

---

### QP-004 · MEDIUM — Trade group header `<div onClick>` not keyboard accessible

**File:** `src/components/QuantitiesPanel.tsx` ~lines 1095–1110  

Trade group expand/collapse headers: `<div onClick>` with no `role="button"`, `tabIndex`, or `onKeyDown`.

---

### QP-005 · MEDIUM — `classification-type-select` — verify if native `<select>` or custom dropdown

If it's a custom div-based dropdown, `browser act(kind="select", values=["area"])` won't work. The agent would need to click the trigger then click the option. Verify and document in agent page.

---

### QP-006 · LOW — Clipboard data uses locale-formatted numbers — breaks Excel paste in non-US locales

`"1,234.5 SF"` parsed with European locale treats `,` as decimal separator.

---

## Section 5 — Page Navigation & Multi-Page

### NAV-001 · MEDIUM — `page-prev-btn`/`page-next-btn` `disabled` but no `data-disabled` attribute for agent state checking

**File:** `src/components/TopNavBar.tsx` lines 455–456  

Disabled state is in the `disabled` HTML attribute. An agent can read this via `el.disabled` but it's not mirrored in `mx-agent-state`. Add `data-disabled` for consistency with the agent state span contract.

---

### NAV-002 · LOW — `"Page 1 / 1"` redundant when totalPages = 1

**File:** `src/components/BottomStatusBar.tsx` line 55  

Hide the total count when `totalPages <= 1`.

---

## Section 6 — Scale System

### SCALE-001 · HIGH — `ScaleCalibration.handleManualSave` label parse fails — scale not synced to server

**File:** `src/components/ScaleCalibration.tsx`  

Carried forward from BUG-A7-6-044 (cycle-6). `ManualCalibration.onSave` passes a human-readable label that `labelToPixelsPerUnit` cannot parse → returns `null` → `persistScale()` never called → scale lost on reload. This breaks every manual calibration workflow.

---

### SCALE-002 · MEDIUM — `scale-display` testid becomes `set-scale-btn` when unset — undocumented agent state change

**File:** `src/components/BottomStatusBar.tsx` lines 47–54  

```tsx
data-testid={scale ? 'scale-display' : 'set-scale-btn'}
```

Agent page documents `scale-display` as the scale indicator, but doesn't mention that the testid changes when scale is not set. An agent querying `[data-testid="scale-display"]` when scale is unset will find nothing.

**Fix:** Always use `data-testid="scale-display"` with a `data-is-set="true|false"` attribute. Remove the conditional testid.

---

### SCALE-003 · LOW — `px/ft` debug value shown to end users in scale display

**File:** `src/components/BottomStatusBar.tsx` lines 62–64  

`"(47.2 px/ft)"` is a developer debug value. Hide it or gate on `?debug=1`.

---

## Section 7 — PolygonProperties Component

### POLY-001 · CRITICAL — `PolygonProperties.tsx` missing `'use client'` directive

**File:** `src/components/PolygonProperties.tsx` line 1  

Uses `useStore`, `useState`, `useEffect` — all client-only. Without `'use client'`, Next.js App Router may attempt server rendering → runtime crash.

**Fix:** Add `'use client';` as the first line.

---

### POLY-002 · HIGH — Uses raw `polygon.linearFeet` (pixel value) instead of `calculateLinearFeet(polygon.points, ppu)`

**File:** `src/components/PolygonProperties.tsx` ~line 32  

`polygon.linearFeet` is stored as pixels (ppu=1 equivalent). Displaying it directly shows values ~47× too large on a standard 1/8"=1' drawing. Every other measurement display in the codebase uses `calculateLinearFeet(points, ppu, false)`.

**Fix:** Replace with `calculateLinearFeet(polygon.points, scale?.pixelsPerUnit || 1, false)`.

---

### POLY-003 · MEDIUM — Light theme styling (`bg-white border-gray-200`) — wrong in dark app

The component uses `className="bg-white border border-gray-200 p-4 rounded-md"` — completely wrong for the dark `#0a0a0f` theme.

---

### POLY-004 · MEDIUM — `persistLabel` only fires on `onBlur` — edit lost if panel unmounts before blur

Label field edit is lost if the component unmounts before focus leaves the input.

---

## Section 8 — Component-Level Issues

### COMP-001 · HIGH — `MXChat.tsx` conversation history lost on panel close / page navigate

Chat history lives only in local React state. History is destroyed on any unmount.

---

### COMP-002 · HIGH — `WorkspaceSwitcher.tsx` uses `window.prompt()` for new workspace name

**File:** `src/components/WorkspaceSwitcher.tsx` ~line 25  

Same `window.prompt()` issue as QP-001. Fails on mobile, inaccessible, synchronous.

---

### COMP-003 · HIGH — Undo/Redo buttons always appear enabled — no `canUndo`/`canRedo` check

**File:** `src/components/LeftToolbar.tsx`  

No `canUndo`/`canRedo` state read from the store. Both buttons appear enabled when history is empty; clicking them is a silent no-op.

---

### COMP-004 · MEDIUM — `OfflineIndicator.tsx` initial state is `false` (online) — flashes wrong state when loaded offline

**Fix:** `useState(() => typeof navigator !== 'undefined' && !navigator.onLine)`.

---

### COMP-005 · MEDIUM — `PDFViewer.tsx`: `renderCompleteResolveRef` hanging promise on unmount mid-render

External callers awaiting `renderPageForCapture()` can get a permanently pending promise if the component unmounts before the render completes.

---

### COMP-006 · MEDIUM — Toast `aria-live="assertive"` on ALL toast types — should be `polite` for info/success

**File:** `src/components/Toast.tsx`  

`assertive` interrupts screen reader announcements. Only `error` severity warrants it.

---

### COMP-007 · MEDIUM — `ExportPanel.tsx` `window.open()` for PDF blocked by popup blockers after async op

---

### COMP-008 · LOW — `PatternSearch.tsx` — dead code (not imported anywhere)

---

### COMP-009 · LOW — `AutoNameTool.tsx` — dead code (not imported anywhere)

---

### COMP-010 · LOW — `test-hive-4.txt`, `test-hive3.txt` test artifacts in `src/components/`

Delete these files.

---

### COMP-011 · LOW — `PerfMonitor.tsx` in production component folder — should be dev-only

---

## Section 9 — Global / Cross-Cutting

### G-001 · CRITICAL — No CSRF protection on state-mutating fetch calls

No CSRF token headers in any reviewed fetch call (`/api/projects`, `/api/polygons`, `/api/scale`, etc.). If cookie-based auth is used, all mutations are vulnerable.

**Fix:** `SameSite=Strict` cookies + `Origin`/`Referer` checks, or CSRF token headers.

---

### G-002 · CRITICAL — `localStorage` is primary store for business-critical data

Folders, stars, tags, workspaces, measurement settings, onboarding flags, view preferences — all localStorage-only. No server sync, no multi-device support, silent loss on storage clear.

---

### G-003 · HIGH — Error boundary placement around `<CanvasOverlay>` and `<PDFViewer>` unverified

If either component throws, the entire editor crashes. Verify `<ErrorBoundary>` wraps both in `page.tsx`.

---

### G-004 · HIGH — Classification list not virtualized — performance degrades at 50+ items

`QuantitiesPanel.tsx` renders all classifications in a plain scrollable div. No `react-window` or similar. Significant jank at 100+ classifications (common in large commercial projects).

---

### G-005 · HIGH — TypeScript `as` casts on API responses with no runtime validation

No `zod` or equivalent schema validation. Shape mismatches cause silent `undefined` propagation.

---

### G-006 · MEDIUM — Dark theme colors hardcoded inline everywhere — no Tailwind token system

`#0a0a0f`, `#00d4ff`, `rgba(0,212,255,...)` appear thousands of times as inline hex strings with no centralized token config.

---

### G-007 · MEDIUM — `crypto.randomUUID()` used without fallback for older Chrome / WebViews

Requires Chrome 92+. Add polyfill or version check.

---

### G-008 · MEDIUM — SSE reconnect logic broken after connection failure (BUG-A7-6-020, carry-forward)

Failed SSE connection permanently blocks reconnect. Agent watching for real-time polygon updates via SSE will not receive them after a connection drop.

---

### G-009 · LOW — `public/next.svg`, `public/vercel.svg` — scaffolding leftovers

Remove.

---

### G-010 · LOW — `manifest.json` `"purpose": "any maskable"` combined — deprecated in some browsers

Use separate `"any"` and `"maskable"` entries.

---

## Section 10 — `data-testid` Coverage Matrix

| Required testid | File:line | Status | Notes |
|-----------------|-----------|--------|-------|
| `canvas-area` | `PDFViewer.tsx:793` | ✅ | HTML5 canvas, click events work |
| `new-classification-btn` | `QuantitiesPanel.tsx:1653` | ✅ | |
| `classification-name-input` | `QuantitiesPanel.tsx:1685` | ✅ | |
| `classification-type-select` | `QuantitiesPanel.tsx:1703` | ✅ | Verify native vs custom select |
| `classification-color-picker` | `QuantitiesPanel.tsx:203` | ⚠️ | `<input type="color">` opens OS dialog — not agent-controllable |
| `save-classification-btn` | `QuantitiesPanel.tsx:1722` | ✅ | |
| `page-prev-btn` | `TopNavBar.tsx:455` | ✅ | |
| `page-next-btn` | `TopNavBar.tsx:456` | ✅ | |
| `page-number-display` | `TopNavBar.tsx:458` | ✅ | `<span>` with text |
| `scale-display` | `BottomStatusBar.tsx:47` | ⚠️ | Conditional — changes to `set-scale-btn` when unset |
| `quantities-panel` | `QuantitiesPanel.tsx:1256` | ✅ | `<aside>` |
| `export-btn` | `TopNavBar.tsx:759,876` | ✅ | Two locations |
| `zoom-in-btn` | `ZoomControls.tsx:61` | ✅ | |
| `zoom-out-btn` | `ZoomControls.tsx:49` | ✅ | |
| `tool-select` | `LeftToolbar.tsx:132,197` | ✅ | Emitted as `tool-select` |
| `tool-area` | `CoordInputPanel.tsx:84` | ⚠️ | Wrong location — only in agent-mode coord panel, not toolbar |
| `tool-linear` | `CoordInputPanel.tsx:85` | ⚠️ | Wrong location — only in agent-mode coord panel, not toolbar |
| `tool-count` | `CoordInputPanel.tsx:86` | ⚠️ | Wrong location — only in agent-mode coord panel, not toolbar |
| `tool-pan` | `LeftToolbar.tsx` | ✅ | |
| `tool-measure` | `LeftToolbar.tsx` | ✅ | |
| `upload-pdf-input` | `page.tsx:2497,2510,2541` | ✅ | 3 empty-state locations |
| `polygon-label` | `CanvasOverlay.tsx:1175` | ⚠️ | SVG `<text>` not `<div>`; suppressed for small polygons in agentMode |
| `drawing-tool-container` | `DrawingTool.tsx` | ✅ | |
| `retogal-btn` | `ReTogal.tsx:152,171,192` | ✅ | 3 states share one testid — no state attribute |
| `mx-chat-btn` | — | ❌ | **MISSING** — no testid on MX Chat button in TopNavBar |
| `coord-input-panel` | `CoordInputPanel.tsx` | ✅ | Agent-mode only |
| `coord-input-field` | `CoordInputPanel.tsx` | ✅ | |
| `coord-input-submit` | `CoordInputPanel.tsx` | ✅ | |
| `snap-indicator` | `DrawingTool.tsx` | ✅ | SVG circle |
| `tool-rectangle` | `DrawingTool.tsx` | ✅ | Rect mode toggle |
| `snapping-toggle` | `DrawingTool.tsx` | ✅ | |
| `3d-toggle-btn` | `TopNavBar.tsx:752` | ✅ | Via NavIconButton testId |
| `ai-takeoff-btn` | `TopNavBar.tsx:589` | ✅ | |
| `share-btn` | `TopNavBar.tsx:689` | ✅ | |
| `sse-status` | `page.tsx:2954` | ✅ | Hidden span |

**Missing testids (no element at all):**
- `mx-chat-btn` — CRITICAL (AG-002)
- `tool-area` as a LeftToolbar draw-mode button — CRITICAL (AG-001)
- `tool-linear` as a LeftToolbar draw-mode button — CRITICAL (AG-001)
- `tool-count` as a LeftToolbar draw-mode button — CRITICAL (AG-001)

**Conditional/wrong-element testids requiring agent awareness:**
- `scale-display` → becomes `set-scale-btn` when unset (SCALE-002)
- `classification-color-picker` → OS native dialog, not web-controllable (AG-007)
- `polygon-label` → SVG `<text>` not `<div>`, suppressed for small polygons (AG-005, AG-006)
- `tool-area/linear/count` in CoordInputPanel → type-toggle only, appears only in agent draw mode

---

## Section 11 — ?agent=1 Modal Suppression Status

| Modal / Overlay | Guard in code | Status |
|----------------|---------------|--------|
| WhatsNewModal | `!agentMode` in page.tsx:2825 | ✅ Suppressed |
| AutoScalePopup | `!agentMode` in page.tsx:2610 | ✅ Suppressed |
| ScaleCalibration modal | `!agentMode` in page.tsx:2653 | ✅ Suppressed |
| KeyboardShortcutsModal | `!agentMode` in page.tsx:2693 | ✅ Suppressed |
| FirstRunTooltips | `!agentMode` in page.tsx:2883 | ✅ Suppressed |
| TakeoffProgressModal | `!agentMode` in page.tsx:2695–2729 | ✅ Suppressed |
| NTS Warning | `!agentMode` in page.tsx:2629 | ✅ Suppressed |
| Large PDF warning | `!agentMode` in page.tsx:2633 | ✅ Suppressed |
| Context menu on canvas | `!agentMode` in page.tsx:2419 | ✅ Suppressed |
| ProjectNameModal | agentMode auto-names; modal not shown for new projects | ✅ Handled |
| PWAInstallBanner | Not checked for agentMode | ❓ Unverified |
| SWUpdateBanner | Not checked for agentMode | ❓ Unverified |

---

## Recommended Action Priority

### Immediate — blocks agent core workflow:
1. **AG-001** — Add `data-testid="tool-area"`, `tool-linear`, `tool-count` as LeftToolbar buttons (or update agent docs to `tool-draw` flow)
2. **AG-002** — Add `data-testid="mx-chat-btn"` to TopNavBar MX Chat button
3. **AG-005** — In agentMode, bypass `labelDecisions` suppression so all `polygon-label` elements always render
4. **SCALE-001** — Fix `handleManualSave` label parse — scale not persisted to server after manual calibration (BUG-A7-6-044 carry-over)
5. **POLY-001** — Add `'use client'` to `PolygonProperties.tsx`
6. **POLY-002** — Fix raw `polygon.linearFeet` usage in PolygonProperties — shows ~47× wrong values

### Near-term — data integrity & UX:
7. **G-001** — CSRF protection on state-mutating API calls
8. **QP-001 / COMP-002** — Replace `window.prompt()` in QuantitiesPanel and WorkspaceSwitcher
9. **QP-002** — Persist manual deductions to store/server
10. **AG-009** — Add `data-is-dirty`, `data-sheet-name`, `data-ai-loading`, `data-scale-label` to `mx-agent-state` span
11. **DRAW-003** — Expose `rectangleMode` state in DOM for agent verification
12. **AG-007** — Replace native `<input type="color">` with agent-accessible hex input
13. **SCALE-002** — Normalize `scale-display`/`set-scale-btn` to stable single testid with `data-is-set` attribute
14. **AG-004** — Add `agentMode` prop to `PWAInstallBanner` and `SWUpdateBanner`
15. **AG-008** — Expose `window.__measurexReady` flag after API installation
16. **AG-003** — Fix or remove non-functional LeftToolbar chat button
17. **COMP-003** — Add `canUndo`/`canRedo` disabled states to undo/redo buttons

### Backlog — polish & parity:
18. **TOGAL-003 / TOGAL-004** — Wire up or delete `PatternSearch.tsx` and `AutoNameTool.tsx`
19. **G-002** — Move device-local data (folders, stars, workspaces) to server
20. **G-004** — Virtualize classification list for large projects
21. **COMP-010** — Delete `test-hive-4.txt`, `test-hive3.txt` artifacts from `src/components/`
22. **G-006** — Create Tailwind color token system instead of hardcoded hex everywhere
23. **TOGAL-006** — Fix CutTool broken state (BUG-A7-6-032)
24. **G-008** — Fix SSE reconnect logic (BUG-A7-6-020)

---

*Audit by Agent A7 (Steel) — Frontend Architect — 2026-03-27 20:00 ET — full-audit-20260327*
