# QA Round — Morning Sprint (2026-03-19)

**Tester**: QA Engineer (Claude)
**Dev server**: http://127.0.0.1:3000
**Project**: kirkland (3d174adc-4130-4861-bdf2-ac6eca079ef8)

---

## QA TASK 1: DRAW TOOL

### Checked
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | D key bound to activate draw tool | PASS | `page.tsx` toolKeys maps `d: 'draw'`, keyboard handler at ~line 700 |
| 2 | Click canvas creates polygon points | PASS | `DrawingTool.tsx` handleClick converts coords, snaps, adds point |
| 3 | Polygon closing logic | PASS | 3 methods: Enter key, double-click, click near first point (25px) |
| 4 | POST to /api/projects/:id/polygons | PASS | `commitPolygon()` → store → sync effect → `api.createPolygon()` |
| 5 | Classification color on polygon | PASS | CanvasOverlay uses `getPolygonColor()`, falls back to #3b82f6 |
| 6 | Shows in QuantitiesPanel | PASS | Aggregates by classification, expandable per-polygon detail |

### API Test
```
GET /api/projects/3d174adc.../polygons → 200, returns 4 polygons
POST /api/projects/3d174adc.../polygons (invalid UUID) → 400 validation error (correct)
```

### Bugs Found: None

---

## QA TASK 2: AI TAKEOFF

### Checked
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Calls OpenAI | PASS | Two routes: `/api/ai-takeoff` uses gpt-4o, `/api/projects/[id]/ai-takeoff` uses gpt-4o-mini via ai-engine.ts |
| 2 | Valid prompt | PASS | Detailed system prompt with COUNT/AREA/LINEAR categorization |
| 3 | Parses polygons from response | PASS | JSON array extraction, type filtering, confidence/color assignment |
| 4 | SSE events | PASS | Broadcasts `ai-takeoff:started` and `ai-takeoff:complete` (fixed in round 2) |
| 5 | Creates classifications + polygons in DB | PASS | Full persistence via store + deduplication logic |

### API Test
```
POST /api/projects/3d174adc.../ai-takeoff {"page":3} → requires OPENAI_API_KEY
```
Note: Route expects `page` field (not `pageNumber`).

### Bugs Found & Fixed

**BUG-QA-001**: Linear distance in apply route only used first 2 points
- **File**: `src/app/api/projects/[id]/ai-takeoff/apply/route.ts:124`
- **Problem**: `euclidean(element.points[0], element.points[1])` ignored all intermediate polyline vertices. Multi-segment walls/beams would have incorrect linear footage.
- **Fix**: Loop through all segments and sum distances
- **Commit**: `a6b47df`

**BUG-QA-002**: AI takeoff main route missing SSE broadcast events
- **File**: `src/app/api/projects/[id]/ai-takeoff/route.ts`
- **Problem**: No `ai-takeoff:started` or `ai-takeoff:complete` SSE events sent to connected clients. UI had no way to show progress during analysis.
- **Fix**: Added `broadcastToProject()` calls before and after `analyzePageImage()`
- **Commit**: `842382d`

---

## QA TASK 3: MX CHAT

### Checked
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Chat component exists | PASS | MXChat.tsx (primary, SSE streaming) + TogalChat.tsx (secondary) |
| 2 | API route at /api/chat | PASS | SSE streaming, GPT-4o, builds context from classifications |
| 3 | Uses OpenAI with project context | PASS | System prompt includes quantities, classifications |
| 4 | MX Chat button in page.tsx | PASS | MXChat rendered at line ~1567 |

### API Test
```
POST /api/chat {"message":"..."} → 503 (OPENAI_API_KEY not set — correct behavior)
POST /api/projects/3d174adc.../chat {"message":"..."} → was 404, now 503 (correct after fix)
```

### Bugs Found & Fixed

**BUG-QA-003**: No project-scoped chat route
- **File**: `src/app/api/projects/[id]/chat/` (did not exist)
- **Problem**: Only `/api/chat` existed, which requires client-side context injection. No way to call chat with automatic server-side project data (polygons, classifications, scale). Curl testing at `/api/projects/:id/chat` returned 404.
- **Fix**: Created `src/app/api/projects/[id]/chat/route.ts` that fetches polygons, classifications, and scale from DB server-side, builds context, and calls OpenAI with full project awareness. Returns non-streaming JSON for API/curl use.
- **Commit**: `e0419ea`

---

## QA TASK 4: SCALE CALIBRATION

### Checked
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | ScaleCalibration component | PASS | Orchestrator with presets + manual modes |
| 2 | "No scale — tap to set" button | PASS | `BottomStatusBar.tsx:54`, orange AlertTriangle icon, calls `onScaleClick` |
| 3 | Opens scale panel | PASS | Connected to `setShowScaleCalibPanel` in page.tsx |
| 4 | POST /api/projects/:id/scale | PASS | Sets scale, broadcasts `scale:updated` via SSE |
| 5 | QuantitiesPanel recalculates | PASS | Uses `getPixelsPerUnitForPage()` → area/(ppu²), linear/ppu |

### API Test
```
POST /api/projects/3d174adc.../scale {"pixelsPerUnit":48,"unit":"ft","pageNumber":3} → 200 ✓
```

### Bugs Found & Fixed

**BUG-QA-004**: Scale POST used raw body instead of validated data
- **File**: `src/app/api/projects/[id]/scale/route.ts:32`
- **Problem**: Destructured `pixelsPerUnit`, `unit`, `pageNumber` from raw `body` instead of `bodyResult.data`. Zod validation ran but its sanitized output was ignored — unvalidated data passed to `setScale()`.
- **Fix**: Use `bodyResult.data` for validated fields (`pixelsPerUnit`, `unit`, `pageNumber`). Extract `label` and `source` from raw body with type guards since they aren't in the schema.
- **Commit**: `d467e38`

---

## Summary

| Bug ID | Severity | Component | Description | Fixed | Commit |
|--------|----------|-----------|-------------|-------|--------|
| BUG-QA-001 | MEDIUM | AI Takeoff Apply | Linear distance only used first 2 of N polyline points | Yes | `a6b47df` |
| BUG-QA-002 | LOW | AI Takeoff | No SSE broadcast events during analysis | Yes | `842382d` |
| BUG-QA-003 | MEDIUM | MX Chat | No project-scoped chat route — 404 on `/api/projects/:id/chat` | Yes | `e0419ea` |
| BUG-QA-004 | LOW | Scale | POST used raw body instead of Zod-validated data | Yes | `d467e38` |

### Build Verification
- `npx tsc --noEmit` — clean, no errors
- All 4 fixes committed individually
- Dev server responding correctly on all tested routes

### Environment Note
- `OPENAI_API_KEY` is not configured in `.env.local` — AI features (chat, takeoff) return 503 until set
