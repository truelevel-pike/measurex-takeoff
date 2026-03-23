# MeasureX — AI Construction Takeoff

Upload architectural blueprints (PDF), measure areas/walls/counts with AI or manual drawing tools, and export to Excel. Built for estimators.

## Quick Start

```bash
git clone <repo> && cd measurex-takeoff
npm install
cp .env.example .env.local   # add GOOGLE_API_KEY at minimum
npm run dev                   # http://localhost:3000
```

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_API_KEY` | **Yes** | Gemini Vision key for AI Takeoff — [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `NEXT_PUBLIC_APP_HOST` | Prod | Your Vercel URL, e.g. `https://app.measurex.io`. Needed for share links. |
| `NEXT_PUBLIC_SUPABASE_URL` | Prod | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Prod | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Prod | Supabase service-role key (server only) |
| `OPENAI_API_KEY` | No | Enables GPT-4o / o4-mini models |
| `API_KEY` | No | Protects all `/api/projects/*` endpoints |
| `ADMIN_SECRET` | No | Protects webhook registration |
| `DISABLE_RATE_LIMIT` | **Never in prod** | Bypasses rate limits for E2E tests only |

See `.env.example` for full documentation and security notes.

**Local dev without Supabase:** omit all `SUPABASE_*` vars. Data lives in `./data/` as JSON. Not persistent on Vercel — use Supabase for production.

## Deploy to Vercel

1. Push to GitHub
2. [vercel.com/new](https://vercel.com/new) → import repo
3. Add env vars in Vercel dashboard (Settings → Environment Variables)
4. Deploy — `vercel.json` pre-configures function timeouts and region (`iad1`)

## Agent Mode

Append `?agent=1` to any project URL to activate agent mode:

- Suppresses all modals and onboarding UI
- Togal button fires a webhook (`agent_takeoff_requested`) instead of calling AI directly
- `#mx-agent-state` span exposes live state via `data-*` attributes
- `window.measurex` API available for programmatic control

```
https://your-app.vercel.app/?project=<id>&agent=1
```

Full agent API reference: `/agent` page in the running app.

## Development

```bash
npm run dev        # dev server
npm run build      # production build
npm test           # run tests
npm run lint       # ESLint
```

## Tech Stack

Next.js 16 · React · TypeScript · Tailwind · Supabase · Gemini Vision · PDF.js · Zustand · XLSX

## License

Private — all rights reserved.
