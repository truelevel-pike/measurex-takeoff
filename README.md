# MeasureX Takeoff

AI-powered construction PDF takeoff tool — upload blueprints, draw measurements, run AI detection, and export quantities.

## Project Structure

```
src/
├── app/                  # Next.js App Router pages & API routes
│   ├── api/              # REST endpoints (projects, polygons, ai-takeoff, etc.)
│   ├── projects/         # Project management pages
│   ├── settings/         # Settings pages
│   └── print/            # Print preview
├── components/           # React UI components (PDFViewer, CanvasOverlay, QuantitiesPanel, etc.)
├── hooks/                # Custom React hooks
├── lib/                  # Utilities, types, Zustand store, geometry engine
├── server/               # Server-side logic (project store, AI engine, PDF processor)
└── stories/              # Storybook component stories
supabase/                 # Database migrations
scripts/                  # E2E test scripts
docs/                     # OpenAPI spec & AI agent guide
```

## Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |

## Dev Setup

```bash
# Clone the repo
git clone <repo-url>
cd measurex-takeoff

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Test Commands

```bash
# Unit tests (Jest)
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Vitest
npx vitest

# E2E API tests
npm run test:e2e

# Storybook (component explorer)
npm run storybook
```

## Deploy to Vercel

1. Connect the repo to [Vercel](https://vercel.com).
2. Set environment variables in the Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy — Vercel auto-detects the Next.js framework.
