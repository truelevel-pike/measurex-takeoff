-- MeasureX normalized tables
-- Migration: 001_mx_tables.sql

-- 1. mx_projects
create table if not exists mx_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. mx_pages
create table if not exists mx_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mx_projects(id) on delete cascade,
  page_number int not null,
  width float not null,
  height float not null,
  pdf_url text,
  created_at timestamptz not null default now(),
  unique (project_id, page_number)
);

create index if not exists idx_mx_pages_project on mx_pages(project_id);
create index if not exists idx_mx_pages_page on mx_pages(project_id, page_number);

-- 3. mx_scales
create table if not exists mx_scales (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mx_projects(id) on delete cascade,
  page_number int not null,
  pixels_per_unit float not null,
  unit text not null check (unit in ('ft', 'in', 'm', 'mm')),
  label text default 'Custom',
  source text not null check (source in ('manual', 'auto', 'ai')),
  confidence float,
  created_at timestamptz not null default now(),
  unique (project_id, page_number)
);

create index if not exists idx_mx_scales_project on mx_scales(project_id);

-- 4. mx_classifications
create table if not exists mx_classifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mx_projects(id) on delete cascade,
  name text not null,
  type text not null check (type in ('area', 'linear', 'count')),
  color text not null default '#3b82f6',
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_mx_classifications_project on mx_classifications(project_id);

-- 5. mx_polygons
create table if not exists mx_polygons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mx_projects(id) on delete cascade,
  classification_id uuid not null references mx_classifications(id) on delete cascade,
  page_number int not null default 1,
  points jsonb not null default '[]',
  area_pixels float not null default 0,
  linear_pixels float not null default 0,
  is_complete boolean not null default true,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mx_polygons_project on mx_polygons(project_id);
create index if not exists idx_mx_polygons_classification on mx_polygons(classification_id);
create index if not exists idx_mx_polygons_page on mx_polygons(project_id, page_number);

-- updated_at triggers
create or replace function mx_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_mx_projects_updated_at
  before update on mx_projects
  for each row execute function mx_set_updated_at();

create trigger trg_mx_polygons_updated_at
  before update on mx_polygons
  for each row execute function mx_set_updated_at();
