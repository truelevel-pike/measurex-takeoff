# MeasureX Takeoff
AI-powered construction takeoff platform for extracting quantities from blueprint PDFs.

## What It Does
MeasureX Takeoff helps estimators and preconstruction teams perform digital takeoffs on plan sheets faster and more consistently. Users upload PDFs, set drawing scale, draw or generate polygons, and automatically compute area, linear, and count quantities. Results can be reviewed, classified, and exported for downstream estimating workflows.

## Tech Stack
- Next.js 15+ (App Router)
- TypeScript
- Supabase
- PDF.js (`pdfjs-dist`)
- Zustand
- Tailwind CSS

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` and set required variables:
   ```bash
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   OPENAI_API_KEY=your_openai_api_key
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`.

## Key Features
- PDF upload and page parsing for construction drawings
- AI-assisted takeoff and auto-detection workflows
- Interactive polygon drawing for area, linear, and count measurements
- Classification system for organized quantity groupings
- Quantity export to JSON and Excel
- Real-time project synchronization via SSE/WebSocket-style updates
- 3D visualization support for model-assisted review

## API Overview
Key endpoints under `src/app/api`:

| Endpoint | Methods | Purpose |
| --- | --- | --- |
| `/api/projects` | `GET`, `POST` | List projects and create a new project |
| `/api/projects/{id}` | `GET`, `PUT`, `PATCH`, `DELETE` | Fetch/update/delete a specific project |
| `/api/projects/{id}/upload` | `POST` | Upload a blueprint PDF |
| `/api/projects/{id}/pages` | `GET` | Retrieve parsed PDF page metadata |
| `/api/projects/{id}/classifications` | `GET`, `POST` | Manage measurement classifications |
| `/api/projects/{id}/polygons` | `GET`, `POST` | Create/read measurement polygons |
| `/api/projects/{id}/quantities` | `GET` | Read computed quantity totals |
| `/api/projects/{id}/scale` | `POST` | Set drawing scale for measurement conversion |
| `/api/projects/{id}/ai-takeoff` | `POST` | Run AI takeoff for a project |
| `/api/projects/{id}/ai-takeoff/apply` | `POST` | Apply AI takeoff results |
| `/api/projects/{id}/export/json` | `GET` | Export project quantities as JSON |
| `/api/projects/{id}/export/excel` | `GET` | Export project quantities as Excel |
| `/api/projects/compare` | `POST` | Compare takeoff data between projects |
| `/api/chat` | `POST` | AI assistant interactions |
| `/api/image-search` | `POST` | Image search for references/materials |
| `/api/vision-search` | `POST` | Vision-enabled search/analysis |
| `/api/ws` | `GET` | Real-time stream endpoint |

Additional routes also exist (for example `/api/projects/recent`, `/api/drawings`, `/api/polygons`, `/api/docs`). See `docs/openapi.yaml` and `src/app/api` for full coverage.

## AI Agent Integration
For full request/response examples, see [`docs/AI-AGENT-GUIDE.md`](docs/AI-AGENT-GUIDE.md).

Quick start for AI agents:
1. Create a project and upload a PDF (`POST /api/projects`, `POST /api/projects/{id}/upload`).
2. Configure scale, create classifications, and submit polygons (`/scale`, `/classifications`, `/polygons`).
3. Run AI takeoff and read/export final quantities (`/ai-takeoff`, `/quantities`, `/export/json` or `/export/excel`).

## Development
```bash
npm run dev
npm test
npm run storybook
npm run build
```
