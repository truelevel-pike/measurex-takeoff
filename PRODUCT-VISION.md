# MeasureX — Product Vision & Purpose
*Written by P.I.K.E. — 2026-03-20*

## What MeasureX Actually Is

MeasureX is a **Togal.ai competitor** — AI-powered construction takeoff software for contractors.

**The end-to-end flow:**

```
1. Takeoff order submitted (client/contractor)
        ↓
2. Takeoff OpenClaw Agent (on N2) receives it
        ↓
3. Agent creates the project automatically via:
   - Sandbox browser control (draws polygons directly in the UI), OR
   - API calls (POST /api/projects, upload PDF, run AI takeoff), OR
   - Both — AI does the rough pass, sandbox refines it
        ↓
4. Agent sends the project link to the assigned engineer
        ↓
5. Engineer opens the link in their browser
   - Reviews the AI-generated takeoff
   - Edits/fixes polygons manually using the drawing tools
   - Adjusts classifications, measurements, scale
        ↓
6. Engineer exports → PDF report with:
   - Plan sheets with polygon overlays
   - Square footage in the corner of each sheet
   - Classification totals (like Togal output)
   - Professional contractor-ready format
```

## The Core User: The Engineer in the Sandbox

**The engineer IS the primary user of the UI.**

They open the link, and they need to:
- Click to draw polygons reliably — every click lands where they expect
- Edit existing polygons (drag vertices)
- See measurements update in real-time
- Export a clean PDF that looks like a Togal takeoff

**The drawing tools must work perfectly.** This is not a nice-to-have. This is the product.

## What "Works Perfectly" Means

1. **Click accuracy** — click coordinates map exactly to where the cursor is on the PDF
2. **Polygon close** — clicking near the first point closes the polygon cleanly
3. **Scale** — measurements in sq ft / LF are accurate given the set scale
4. **PDF export** — outputs a professional PDF with overlay + measurements per sheet
5. **Sandbox-compatible** — X-Frame-Options and CSP must NOT block the sandbox browser

## Current Blockers (CRITICAL — Fix First)

### BLOCKER-001: X-Frame-Options DENY
`next.config.ts` sets `X-Frame-Options: DENY` globally.
The OpenClaw sandbox browser renders pages in a frame/controlled browser context.
**This header prevents the app from loading at all in the sandbox.**
Fix: Allow the OpenClaw sandbox origin (or use `SAMEORIGIN` with frame-ancestors CSP instead of DENY).

### BLOCKER-002: No frame-ancestors in CSP
CSP has no `frame-ancestors` directive.
Without it, even fixing X-Frame-Options may not be enough depending on sandbox implementation.
Fix: Add `frame-ancestors 'self' <sandbox-origin>` to the Content-Security-Policy.

### BLOCKER-003: PDF Export Quality
The PDF export must match Togal output quality:
- Each plan sheet as a page
- Polygon overlays rendered on the sheet
- Sq ft / measurement labels in the corner
- Classification legend
- Professional formatting

## Priority Order for All Engineering Work

1. **Sandbox compatibility** (BLOCKER-001, BLOCKER-002) — nothing else matters if it can't load
2. **Drawing tool reliability** — click accuracy, polygon close, vertex drag
3. **PDF export quality** — Togal-level output
4. **AI takeoff accuracy** — auto-detect elements correctly
5. **API workflow** — programmatic project creation for the agent flow
6. Everything else

## Reference: Togal.ai
Togal.ai is the gold standard competitor. Their output:
- PDF with colored polygon overlays on plan sheets
- Square footage labeled per area
- Per-page measurement summaries
- Classification-based color coding
- Export ready for bid submission

MeasureX must match this quality. That is the bar.
