-- Migration: add mx_perf_events table for web vitals tracking
create table if not exists public.mx_perf_events (
  id uuid default gen_random_uuid() primary key,
  name text not null check (name in ('CLS','FCP','INP','LCP','TTFB')),
  value numeric not null,
  rating text not null check (rating in ('good','needs-improvement','poor')),
  delta numeric not null,
  id text,                   -- web-vitals metric id string (e.g. "v3-1234-...")
  timestamp bigint,
  navigationType text,
  created_at timestamptz default now()
);

-- Enable RLS (no user auth, so just allow anon inserts)
alter table public.mx_perf_events enable row level security;
create policy "anon insert perf events" on public.mx_perf_events
  for insert to anon with check (true);

-- Grant insert to anon role
grant insert on public.mx_perf_events to anon;
