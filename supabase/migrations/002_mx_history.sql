create table if not exists mx_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mx_projects(id) on delete cascade,
  action_type text not null check (action_type in ('create', 'update', 'delete')),
  entity_type text not null check (entity_type in ('polygon', 'classification', 'scale')),
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_mx_history_project on mx_history(project_id);
create index if not exists idx_mx_history_created on mx_history(project_id, created_at desc);
