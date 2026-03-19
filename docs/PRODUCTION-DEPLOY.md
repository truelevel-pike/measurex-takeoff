# MeasureX Takeoff — Production Deployment Guide

## Prerequisites

- Node.js 18+ and npm
- A [Supabase](https://supabase.com) account (free tier works)
- An OpenAI API key (for AI takeoff features)
- A [Vercel](https://vercel.com) account (recommended) or any Node.js hosting

## Step 1: Clone and Install

```bash
git clone <your-repo-url> measurex-takeoff
cd measurex-takeoff
npm install
```

## Step 2: Create Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Note these values from **Settings → API**:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep secret — never expose client-side)

## Step 3: Set Environment Variables

Copy the example and fill in your values:

```bash
cp .env.example .env.local
```

Required variables in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...
```

## Step 4: Run Database Migrations

```bash
npm run migrate
```

This applies all SQL files in `supabase/migrations/` in order (000 through 009). The `_migrations` table tracks which have already been applied, so it is safe to run repeatedly.

To preview without applying:

```bash
npm run migrate:dry
```

## Step 5: Verify Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and confirm:
- You can create a project
- Upload a PDF page
- Draw polygons and see classifications

Run tests:

```bash
npm test
```

## Step 6: Deploy to Vercel

### Option A: Vercel CLI

```bash
npx vercel --prod
```

When prompted, set the environment variables listed in Step 3.

### Option B: Vercel Dashboard

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Add environment variables under **Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
3. Deploy.

## Step 7: Verify Production

Run the end-to-end smoke test against your deployed URL:

```bash
MEASUREX_URL=https://your-app.vercel.app npm run test:e2e
```

## Environment Variables (Vercel)

Below is the complete list of environment variables used by MeasureX. Set these in **Vercel → Settings → Environment Variables** (or your hosting provider's equivalent).

### Required

| Variable | Server/Client | Description |
|----------|---------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client | Supabase project URL (e.g. `https://xxxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client | Supabase anon/public API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Supabase service role key — **keep secret, never expose client-side** |
| `OPENAI_API_KEY` | Server only | OpenAI API key for AI takeoff, vision search, chat, and sheet naming |

### Optional (External Image Search)

| Variable | Description |
|----------|-------------|
| `BING_IMAGE_SEARCH_KEY` | Bing Image Search API subscription key |
| `BING_IMAGE_SEARCH_ENDPOINT` | Bing endpoint URL (defaults to `https://api.bing.microsoft.com/v7.0/images/search`) |
| `GOOGLE_CUSTOM_SEARCH_API_KEY` | Google Custom Search JSON API key |
| `GOOGLE_CUSTOM_SEARCH_CX` | Google Custom Search Engine ID |
| `UNSPLASH_ACCESS_KEY` | Unsplash API access key |

### Optional (App Config)

| Variable | Description |
|----------|-------------|
| `FEATURE_FLAGS` | JSON object of feature flags (e.g. `{"ai_takeoff":true}`) |
| `ADMIN_KEY` | Secret key for admin endpoints (`/api/admin/*`) |
| `NEXT_PUBLIC_OPENAI_API_KEY` | Client-side OpenAI key fallback — avoid in production; prefer server-only `OPENAI_API_KEY` |
| `ANALYZE` | Set to `true` to enable webpack bundle analyzer during build |

> **Tip:** After adding or changing env vars in Vercel, you must **redeploy** for changes to take effect.

---

## Health Check

After deploying, verify the app is running:

```bash
curl -s https://your-app.vercel.app/api/health | python3 -m json.tool
```

**Expected response** (HTTP 200):

```json
{
  "status": "ok",
  "timestamp": "2026-03-19T12:00:00.000Z",
  "uptime": 42,
  "supabaseConnected": true,
  "version": "0.1.0"
}
```

**What to check:**
- `status` is `"ok"`
- `supabaseConnected` is `true` — if `false`, your Supabase env vars are missing or incorrect
- `version` matches your expected release

If the endpoint returns a non-200 status or connection error, the deployment failed — check Vercel build logs.

---

## Troubleshooting

### "relation mx_projects does not exist"
Migrations haven't been applied. Run `npm run migrate` with your production `SUPABASE_SERVICE_ROLE_KEY` set.

### "new row violates row-level security policy"
RLS is enabled but the policy may not have been created. Re-run `npm run migrate` — migration 009 adds permissive RLS policies.

### Vercel build fails with "Module not found"
Run `npm install` locally and confirm `npm run build` succeeds before deploying. Check that all dependencies are in `dependencies` (not just `devDependencies`).

### Vercel function timeout
Long-running routes (AI takeoff, PDF upload) have extended timeouts in `vercel.json`. If you're on Vercel Hobby, the max is 60s — upgrade to Pro for up to 300s.

### Environment variables not loading
- Client-side vars **must** start with `NEXT_PUBLIC_`.
- Server-side vars (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`) should **not** have the `NEXT_PUBLIC_` prefix.
- After changing env vars in Vercel, redeploy.
