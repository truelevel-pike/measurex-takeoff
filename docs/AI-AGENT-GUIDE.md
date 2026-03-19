# MeasureX Takeoff — AI Agent Quick-Start Guide

This guide shows AI agents how to perform construction takeoffs via the MeasureX API.
The full OpenAPI spec is in [`openapi.yaml`](./openapi.yaml).

**Base URL:** `http://localhost:3000`

---

## Workflow Overview

1. **Create a project** → get `projectId`
2. **Upload a PDF** → get page count and dimensions
3. **Set the scale** → convert pixels to real-world units
4. **Create classifications** → define what you're measuring (walls, flooring, etc.)
5. **Add polygons** → draw measurements on the blueprint
6. **Read quantities** → get computed areas/lengths/counts
7. *(Optional)* **Run AI takeoff** → auto-detect elements from the blueprint

---

## Step 1: Create a Project

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Building A — Floor 1"}'
```

Response:
```json
{
  "project": {
    "id": "fe7314a6-f985-4dfc-8e99-63cc68b8b3c9",
    "name": "Building A — Floor 1",
    "totalPages": 0,
    "createdAt": "2026-03-18T...",
    "updatedAt": "2026-03-18T..."
  }
}
```

Save the `id` — you'll use it as `PROJECT_ID` in all subsequent calls.

---

## Step 2: Upload a PDF

```bash
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/upload \
  -F "file=@blueprint.pdf"
```

Response:
```json
{
  "pages": 3,
  "dimensions": [
    {"page": 1, "width": 3400, "height": 2200},
    {"page": 2, "width": 3400, "height": 2200},
    {"page": 3, "width": 3400, "height": 2200}
  ],
  "sheetNames": {"1": "A-101 FLOOR PLAN", "2": "A-102 ELEVATIONS", "3": "A-103 SECTIONS"},
  "detectedScale": {
    "pixelsPerUnit": 28.35,
    "unit": "ft",
    "description": "1/4\" = 1'-0\""
  }
}
```

If `detectedScale` is returned, you can use it directly in Step 3.

---

## Step 3: Set the Scale

The scale converts pixel measurements to real-world units. Without it, quantities are meaningless.

```bash
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/scale \
  -H "Content-Type: application/json" \
  -d '{
    "pixelsPerUnit": 28.35,
    "unit": "ft",
    "label": "1/4\" = 1'\''–0\"",
    "source": "auto",
    "pageNumber": 1
  }'
```

Common architectural scales:
| Scale | Approx pixelsPerUnit (at 300 DPI) |
|-------|----------------------------------|
| 1/8" = 1'-0" | 14.17 |
| 1/4" = 1'-0" | 28.35 |
| 3/8" = 1'-0" | 42.52 |
| 1/2" = 1'-0" | 56.69 |

---

## Step 4: Create Classifications

Classifications define *what* you're measuring. Types: `area`, `linear`, `count`.

```bash
# Area classification (e.g., flooring)
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/classifications \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Carpet Flooring",
    "type": "area",
    "color": "#3b82f6"
  }'

# Linear classification (e.g., walls)
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/classifications \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Interior Walls",
    "type": "linear",
    "color": "#ef4444"
  }'

# Count classification (e.g., doors)
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/classifications \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Doors",
    "type": "count",
    "color": "#22c55e"
  }'
```

Save each `classification.id` for polygon creation.

---

## Step 5: Add Polygons

Polygons are measurement shapes drawn on the blueprint. Points are in **pixel coordinates** matching the PDF page dimensions from Step 2.

```bash
# Area polygon (closed shape — 4+ points)
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/polygons \
  -H "Content-Type: application/json" \
  -d '{
    "classificationId": "CLASSIFICATION_ID",
    "pageNumber": 1,
    "points": [
      {"x": 500, "y": 400},
      {"x": 1200, "y": 400},
      {"x": 1200, "y": 900},
      {"x": 500, "y": 900}
    ]
  }'

# Linear polygon (open path — 2+ points)
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/polygons \
  -H "Content-Type: application/json" \
  -d '{
    "classificationId": "WALL_CLASSIFICATION_ID",
    "pageNumber": 1,
    "points": [
      {"x": 500, "y": 400},
      {"x": 1200, "y": 400},
      {"x": 1200, "y": 900}
    ]
  }'

# Count polygon (single point)
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/polygons \
  -H "Content-Type: application/json" \
  -d '{
    "classificationId": "DOOR_CLASSIFICATION_ID",
    "pageNumber": 1,
    "points": [{"x": 750, "y": 650}]
  }'
```

Area and perimeter are auto-computed from the points.

---

## Step 6: Read Quantities

```bash
curl http://localhost:3000/api/projects/$PROJECT_ID/quantities
```

Response:
```json
{
  "quantities": [
    {
      "classificationId": "...",
      "name": "Carpet Flooring",
      "type": "area",
      "color": "#3b82f6",
      "count": 2,
      "area": 1250.5,
      "linearFeet": 0,
      "unit": "SF"
    },
    {
      "classificationId": "...",
      "name": "Interior Walls",
      "type": "linear",
      "color": "#ef4444",
      "count": 5,
      "area": 0,
      "linearFeet": 87.3,
      "unit": "FT"
    },
    {
      "classificationId": "...",
      "name": "Doors",
      "type": "count",
      "color": "#22c55e",
      "count": 12,
      "area": 0,
      "linearFeet": 0,
      "unit": "EA"
    }
  ],
  "scale": {
    "pixelsPerUnit": 28.35,
    "unit": "ft"
  }
}
```

Quantities are always recalculated from geometry — never stale.

---

## Automated AI Takeoff (Optional)

Let the AI detect elements automatically, then apply them:

```bash
# 1. Detect elements on page 1
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/ai-takeoff \
  -H "Content-Type: application/json" \
  -d '{"page": 1}'

# Response: { "elements": [ { "name": "Concrete Slab", "type": "area", "points": [...], "color": "#..." }, ... ] }

# 2. Apply detected elements (creates classifications + polygons)
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/ai-takeoff/apply \
  -H "Content-Type: application/json" \
  -d '{
    "elements": [
      {"name": "Concrete Slab", "type": "area", "points": [{"x":100,"y":200},{"x":500,"y":200},{"x":500,"y":600},{"x":100,"y":600}], "color": "#8b5cf6"}
    ],
    "page": 1
  }'

# Response: { "created": { "classifications": 1, "polygons": 1 }, "skipped": 0 }
```

The apply endpoint deduplicates: classifications by name (case-insensitive), polygons by 80% point overlap.

---

## Real-Time Updates (SSE)

Subscribe to project changes:

```bash
curl -N "http://localhost:3000/api/ws?projectId=$PROJECT_ID"
```

Events: `polygon:created`, `polygon:updated`, `polygon:deleted`, `classification:created`, `classification:updated`, `classification:deleted`, `scale:updated`, `assembly:created`, `assembly:updated`, `assembly:deleted`

Pass `lastEventId` query param to replay missed events (up to 50 buffered).

---

## Cost Assemblies

Link cost data to classifications:

```bash
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/assemblies \
  -H "Content-Type: application/json" \
  -d '{
    "classificationId": "FLOORING_CLASSIFICATION_ID",
    "name": "Carpet Installation",
    "unit": "SF",
    "unitCost": 4.50,
    "quantityFormula": "area"
  }'
```

---

## Export

```bash
# Excel export (3-sheet workbook: Summary, Quantities, Assemblies)
curl -o takeoff.xlsx http://localhost:3000/api/projects/$PROJECT_ID/export/excel

# JSON export (full project data)
curl -o takeoff.json http://localhost:3000/api/projects/$PROJECT_ID/export/json
```

---

## Key Concepts

- **Points are in pixel coordinates** — they match the PDF page dimensions returned by the upload endpoint
- **Scale is required** for meaningful quantities — without it, measurements stay in pixels
- **Quantities are always recomputed** from geometry — you never need to store calculated values
- **All mutations broadcast SSE events** — use the `/api/ws` endpoint to stay in sync
- **AI takeoff is two-step**: detect → apply. You can filter/modify elements between steps
- **Classifications are typed**: `area` (SF), `linear` (FT), `count` (EA)
