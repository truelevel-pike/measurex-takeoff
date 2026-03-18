create table if not exists mx_assemblies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mx_projects(id) on delete cascade,
  classification_id uuid not null references mx_classifications(id) on delete cascade,
  name text not null,
  unit text not null default 'SF',
  unit_cost numeric(12,4) not null default 0,
  quantity_formula text not null default 'area',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mx_assemblies_project on mx_assemblies(project_id);
create index if not exists idx_mx_assemblies_classification on mx_assemblies(classification_id);
