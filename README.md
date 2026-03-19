# MeasureX Takeoff

AI-powered construction takeoff tool — measure areas, count items, and extract quantities from architectural PDF plans.

## Features

- **PDF Viewer** — multi-page PDF rendering with zoom, pan, and page thumbnails
- **Drawing Tools** — polygon, polyline, and measurement tools for marking up plans
- **AI Takeoff** — GPT-4 Vision automatically detects and classifies elements across pages
- **Scale Calibration** — set scale from presets or draw-to-calibrate for precise measurements
- **Classifications** — custom types (area/linear/count) with color coding and visibility toggles
- **Quantities Panel** — real-time area, length, and count totals per classification
- **3D View** — extrude floor plans into a 3D model with wall heights
- **Export** — Excel export with per-sheet and total quantities
- **Collaboration** — real-time sync via SSE, share links, version history
- **Project Dashboard** — create, open, and manage multiple projects

## Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **State:** Zustand
- **PDF Rendering:** pdfjs-dist
- **UI:** Tailwind CSS v4 + shadcn/ui components
- **3D:** React Three Fiber (@react-three/fiber, @react-three/drei)
- **AI:** OpenAI GPT-4 Vision via `/api/ai-takeoff`
- **Backend:** File-based JSON storage (local dev) or Supabase (production)
- **TypeScript:** Strict mode

## Getting Started

### Prerequisites

- Node.js 20+
- OpenAI API key (for AI Takeoff feature)
- Supabase project (optional, for production storage)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
# Required for AI Takeoff
OPENAI_API_KEY=sk-...

# Optional: Supabase (omit to use local file storage)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## Storybook

```bash
# Start Storybook dev server
npm run storybook

# Build static Storybook
npm run build-storybook
```

## Project Structure

```
src/
├── app/                  # Next.js App Router pages + API routes
│   ├── api/              # REST API endpoints
│   │   ├── ai-takeoff/   # OpenAI Vision integration
│   │   ├── projects/     # Project CRUD
│   │   ├── polygons/     # Polygon CRUD
│   │   └── ws/           # SSE real-time updates
│   ├── page.tsx          # Main takeoff canvas
│   └── projects/         # Project dashboard
├── components/           # React UI components (60+)
│   ├── PDFViewer.tsx     # Core PDF rendering + interaction
│   ├── DrawingTool.tsx   # Canvas drawing engine
│   ├── TopNavBar.tsx     # Primary navigation + AI Takeoff
│   ├── QuantitiesPanel.tsx # Takeoff quantities sidebar
│   └── ...
├── lib/                  # Utilities, store, types
│   ├── store.ts          # Zustand state management
│   ├── polygon-utils.ts  # Geometry calculations
│   ├── sheet-namer.ts    # AI sheet name extraction
│   └── ws-client.ts      # SSE client
└── server/               # Server-only modules
    └── project-store.ts  # Project persistence (file/Supabase)
```

## API Reference

See [`docs/openapi.yaml`](./docs/openapi.yaml) for the full OpenAPI 3.0 spec.

Key endpoints:
- `GET /api/projects` — list projects
- `POST /api/projects` — create project
- `GET /api/projects/:id` — get project with state
- `PATCH /api/projects/:id` — update project metadata
- `POST /api/ai-takeoff` — run AI detection on a page image
- `GET /api/ws` — SSE stream for real-time updates

## License

Private — all rights reserved.
