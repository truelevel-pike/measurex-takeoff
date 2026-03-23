# MeasureX

AI-powered construction takeoff tool. Upload an architectural PDF, and MeasureX automatically detects and classifies rooms, walls, doors, and other elements using Gemini Vision — giving you area, linear, and count quantities instantly. Manual tools let you draw polygons and polylines for anything the AI misses, with real-time totals, Excel export, and shareable project links.

## Prerequisites

- Node.js 18+
- npm 9+
- Google Gemini API key (for AI Takeoff) — free at [aistudio.google.com](https://aistudio.google.com/app/apikey)
- Supabase project (for production persistent storage) — free tier at [supabase.com](https://supabase.com)

## Quick Start

```bash
git clone <repo>
cd measurex-takeoff
npm install
cp .env.example .env.local
# Edit .env.local — add GOOGLE_API_KEY at minimum
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_API_KEY` | **Yes** | Gemini API key for AI Takeoff. Get at [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `NEXT_PUBLIC_APP_HOST` | **Yes (prod)** | Your deployed URL, e.g. `https://app.measurex.io`. Required for share links and agent session URLs. |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes (prod)** | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes (prod)** | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes (prod)** | Supabase service role key (server-side only) |
| `OPENAI_API_KEY` | No | Enables GPT-4o / o4-mini models as alternative to Gemini |
| `API_KEY` | No | Protects all `/api/projects/*` endpoints with a shared secret |
| `ADMIN_SECRET` | No | Protects webhook registration and admin endpoints |

See `.env.example` for full documentation of every variable.

**Local dev without Supabase:** omit all `SUPABASE_*` vars. Data is stored in `./data/` as JSON files. This is not persistent on Vercel — use Supabase for production.

## Deploy to Vercel

1. Push to GitHub
2. Import project in [vercel.com/new](https://vercel.com/new)
3. Add environment variables in Vercel dashboard (Settings → Environment Variables):
   - `GOOGLE_API_KEY`
   - `NEXT_PUBLIC_APP_HOST` — set to your Vercel deployment URL
   - All `SUPABASE_*` vars
4. Deploy

The `vercel.json` in this repo pre-configures function timeouts and region (`iad1`).

## Agent Mode

Add `?agent=1` to any project URL to enable Agent Mode:

```
https://your-app.vercel.app/?agent=1
```

In agent mode:
- The Togal button fires a webhook event (`agent_takeoff_requested`) instead of calling the AI directly
- The `mx-agent-state` span (hidden, `id="mx-agent-state"`) exposes live state as `data-*` attributes for external agents to read
- Auto-scale popups, onboarding tooltips, and What's New modal are suppressed

Agent state attributes on `#mx-agent-state`:
| Attribute | Value |
|---|---|
| `data-current-page` | Current PDF page number |
| `data-total-pages` | Total pages in project |
| `data-active-tool` | Active drawing tool |
| `data-project-id` | Project UUID |
| `data-scale` | pixels-per-unit scale value |
| `data-scale-unit` | Scale unit (`ft`, `m`, etc.) |
| `data-canvas-width` | PDF page width in pixels |
| `data-canvas-height` | PDF page height in pixels |

## AI Takeoff API

| Endpoint | Method | Description |
|---|---|---|
| `/api/projects/:id/ai-takeoff` | POST | Run AI takeoff on a single page |
| `/api/projects/:id/ai-takeoff/all-pages` | POST | Run AI takeoff across all pages (sequential) |
| `/api/projects/:id/ai-takeoff/apply` | POST | Apply pre-detected elements to a page |

Single-page body: `{ page: 1, model?: "gemini-2.5-flash" }`

All-pages body: `{ model?: "gemini-2.5-flash" }`

Supported models: `gemini-2.5-flash` (default), `gemini-2.5-pro`, `gpt-4o`, `gpt-4.1`, `o4-mini`

## Development

```bash
npm run dev        # start dev server (Turbopack)
npm run build      # production build
npm test           # run tests
npm run test:watch # watch mode
npm run lint       # ESLint
```

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── api/projects/[id]/      # Project REST endpoints
│   │   ├── ai-takeoff/         # Gemini/GPT-4 vision takeoff
│   │   ├── upload/             # PDF upload + processing
│   │   ├── scale/              # Scale calibration
│   │   └── webhooks/           # Webhook registration + agent events
│   └── page.tsx                # Main takeoff canvas
├── components/                 # React UI components
│   ├── PDFViewer.tsx           # PDF rendering + pan/zoom
│   ├── TopNavBar.tsx           # Navigation + AI Takeoff button
│   ├── ReTogal.tsx             # Togal button (agent-mode webhook)
│   └── CoordInputPanel.tsx     # Agent coordinate input panel
├── lib/                        # Shared utilities
│   ├── store.ts                # Zustand state management
│   └── auto-scale.ts           # Scale detection from PDF text
└── server/                     # Server-only modules
    ├── ai-engine.ts            # Gemini / OpenAI API integration
    ├── pdf-processor.ts        # Server-side PDF parsing
    └── project-store.ts        # File-based or Supabase persistence
```

## License

Private — all rights reserved.
