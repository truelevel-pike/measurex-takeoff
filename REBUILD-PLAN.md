# MeasureX Takeoff — API Layer Upgrade Plan

## The Goal

Keep the existing UI (humans can still draw, click, edit) but add an API layer so OpenClaw agents can do the same things programmatically. Both humans AND AI operate the same workspace. An OpenClaw agent needs to:

1. Upload a blueprint PDF
2. Detect/set the scale
3. Identify rooms, walls, doors, windows, fixtures
4. Draw polygons around detected areas
5. Classify each polygon (area/linear/count)
6. Calculate quantities (sq ft, linear ft, counts)
7. Export to Excel

The agent does ALL of this. The website is the **workspace** the agent operates in — like how a human estimator uses Togal, but the "estimator" is an AI.

## Architecture: API-First + Visual Workspace

### Layer 1: REST API (The Agent Interface)

Every action the UI can do, the API can do. This is how OpenClaw agents interact.

```
POST /api/projects                    → Create project
POST /api/projects/:id/upload         → Upload PDF (returns pages, detected scale)
GET  /api/projects/:id/pages          → List pages with dimensions
GET  /api/projects/:id/pages/:num     → Get page image/data

POST /api/projects/:id/scale          → Set scale (manual or confirm auto-detected)
GET  /api/projects/:id/scale          → Get current scale

POST /api/projects/:id/classifications → Create classification (name, type, color)
GET  /api/projects/:id/classifications → List classifications
PUT  /api/projects/:id/classifications/:id → Update
DELETE /api/projects/:id/classifications/:id → Delete

POST /api/projects/:id/polygons       → Draw polygon (points[], classificationId, page)
GET  /api/projects/:id/polygons       → List all polygons
PUT  /api/projects/:id/polygons/:id   → Update polygon (reclassify, adjust points)
DELETE /api/projects/:id/polygons/:id → Delete polygon

POST /api/projects/:id/ai-takeoff     → Run AI detection on page (returns detected elements)
POST /api/projects/:id/ai-takeoff/apply → Apply AI results (creates polygons + classifications)

GET  /api/projects/:id/quantities     → Get computed quantities (areas, linear, counts)
GET  /api/projects/:id/export/excel   → Download Excel export
GET  /api/projects/:id/export/json    → Download JSON export

POST /api/projects/:id/merge          → Merge polygons
POST /api/projects/:id/split          → Split polygon by line
```

### Layer 2: Real-Time WebSocket (Live State Sync)

The website shows live state. When an agent creates a polygon via API, it appears on the canvas instantly.

```
ws://localhost:3000/api/ws?projectId=xxx

Events (server → client):
  polygon:created    { polygon }
  polygon:updated    { polygon }
  polygon:deleted    { id }
  classification:created { classification }
  scale:updated      { scale }
  ai-takeoff:started { page }
  ai-takeoff:complete { results }
  page:changed       { pageNum }

Events (client → server):
  subscribe          { projectId }
  page:view          { pageNum }
```

### Layer 3: Visual Workspace (The Dashboard)

The UI is a **monitoring/override dashboard** — it shows what the AI is doing in real-time, and lets humans intervene when needed.

**What the UI shows:**
- PDF rendering with polygon overlays (canvas)
- Live polygon creation as AI draws them
- Classification list with quantities updating in real-time
- AI activity log ("AI detected 25 areas on page 3...")
- Scale calibration display
- Export controls

**What humans can do (override):**
- Adjust polygon vertices the AI drew wrong
- Reclassify a polygon the AI misidentified
- Manually draw a polygon the AI missed
- Accept/reject AI suggestions
- Set scale if auto-detection fails

### Layer 4: AI Agent Workflow (The Orchestrator)

An OpenClaw agent (or any agent) runs the full takeoff:

```python
# Agent workflow pseudocode
project = POST /api/projects { name: "123 Main St ADU" }
upload = POST /api/projects/{id}/upload  [pdf file]

for page in upload.pages:
    # Auto-detect scale
    if page.detectedScale:
        POST /api/projects/{id}/scale { ...page.detectedScale, page: page.num }
    
    # Run AI takeoff
    results = POST /api/projects/{id}/ai-takeoff { page: page.num }
    
    # Review results (agent decides what to keep)
    for element in results.detected:
        if element.confidence > 0.7:
            POST /api/projects/{id}/ai-takeoff/apply { elements: [element] }
    
    # Agent can also draw manually if AI missed something
    POST /api/projects/{id}/polygons {
        points: [{x:100,y:200}, {x:300,y:200}, {x:300,y:400}, {x:100,y:400}],
        classificationId: "living-room-id",
        page: page.num
    }

# Get final quantities
quantities = GET /api/projects/{id}/quantities
excel = GET /api/projects/{id}/export/excel
```

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── projects/
│   │   │   ├── route.ts                    # CRUD projects
│   │   │   └── [id]/
│   │   │       ├── route.ts                # Get/update/delete project
│   │   │       ├── upload/route.ts         # PDF upload + processing
│   │   │       ├── pages/route.ts          # List pages
│   │   │       ├── pages/[num]/route.ts    # Page image/data
│   │   │       ├── scale/route.ts          # Scale CRUD
│   │   │       ├── classifications/route.ts # Classification CRUD
│   │   │       ├── polygons/route.ts       # Polygon CRUD
│   │   │       ├── ai-takeoff/route.ts     # AI detection
│   │   │       ├── quantities/route.ts     # Computed quantities
│   │   │       ├── export/excel/route.ts   # Excel export
│   │   │       ├── export/json/route.ts    # JSON export
│   │   │       └── merge/route.ts          # Merge/split operations
│   │   └── ws/route.ts                     # WebSocket endpoint
│   ├── page.tsx                            # Main editor (visual workspace)
│   ├── projects/page.tsx                   # Project list
│   └── layout.tsx
├── components/
│   ├── PDFViewer.tsx                       # PDF render (read-only display)
│   ├── PolygonOverlay.tsx                  # Canvas overlay showing polygons
│   ├── QuantitiesPanel.tsx                 # Right panel — live quantities
│   ├── AIActivityLog.tsx                   # What the AI is doing right now
│   ├── ClassificationList.tsx             # Classification management
│   ├── ScaleIndicator.tsx                  # Scale display + manual override
│   ├── TopNavBar.tsx                       # Navigation + controls
│   ├── PageNavigator.tsx                   # Page thumbnails + nav
│   └── ExportControls.tsx                  # Export buttons
├── lib/
│   ├── types.ts                            # Shared types
│   ├── store.ts                            # Zustand (client state)
│   ├── api-client.ts                       # API helper for components
│   ├── polygon-utils.ts                    # Geometry calculations
│   ├── auto-scale.ts                       # Scale detection
│   ├── ai-takeoff.ts                       # AI vision processing
│   ├── export.ts                           # Excel/JSON export
│   └── ws-client.ts                        # WebSocket client
└── server/
    ├── project-store.ts                    # Server-side project state (Supabase or file)
    ├── pdf-processor.ts                    # PDF → page images, text extraction
    └── geometry-engine.ts                  # Server-side area/length calculations
```

## Key Design Principles

1. **API-first:** Every feature is an API endpoint FIRST, UI component SECOND
2. **Real-time:** WebSocket pushes state changes to all connected clients
3. **Stateless agents:** Any agent can pick up any project — all state is in the DB
4. **Human override:** UI lets humans fix what AI gets wrong
5. **Confidence scores:** AI results include confidence — agents/humans decide threshold
6. **Idempotent operations:** Re-running AI takeoff on same page replaces, doesn't duplicate
7. **Multi-page aware:** Scale, polygons, classifications all scoped per-page where needed

## What We Keep vs Add

| Keep (Existing) | Add (New) |
|-----------------|-----------|
| Full UI — all drawing tools, panels, toolbar | REST API for every action |
| Zustand client state | Server-side persistence (Supabase) synced with Zustand |
| PDF rendering in browser (pdfjs) | Server-side PDF processing for API uploads |
| Manual polygon drawing tools | API polygon creation (agent draws via endpoints) |
| Manual classification CRUD | API classification CRUD |
| Canvas overlay system | WebSocket live sync (API changes → canvas updates) |
| Human can draw, edit, delete, reclassify | Agent can do the same via API |
| AI Takeoff button (browser-side) | AI Takeoff API endpoint (server-side) |

**The UI stays fully functional for humans.** The API makes it equally functional for agents.

## Admiral Assignments

### A5 — API Layer (Core CRUD)
- All REST endpoints: projects, pages, scale, classifications, polygons
- Request validation, error handling, proper HTTP status codes
- Supabase integration for persistence
- File upload handling (PDF → stored, pages extracted)

### A6 — Real-Time + Visual Workspace  
- WebSocket server/client implementation
- PolygonOverlay component (renders API polygons on canvas)
- AIActivityLog component (shows live AI actions)
- Wire UI to consume API instead of local-only state

### A7 — PDF Processing + Geometry Engine
- Server-side PDF processing (extract pages as images, text, dimensions)
- Geometry engine (area calculation, linear measurement, point-in-polygon)
- Multi-page navigation with server-rendered page images
- Scale detection from PDF text (server-side)

### A8 — AI Pipeline + Export
- Server-side AI takeoff (OpenAI vision or alternative)
- AI result → polygon/classification mapping
- Confidence scoring and filtering
- Excel/JSON export from server state
- Classification presets and auto-naming

## Phase 1 (Today): API skeleton + core endpoints
## Phase 2: Wire UI to API + WebSocket
## Phase 3: AI pipeline + export
## Phase 4: Polish + agent workflow testing
