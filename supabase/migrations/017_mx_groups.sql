create table if not exists mx_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mx_projects(id) on delete cascade,
  name text not null,
  page_number int not null default 1,
  bounding_box jsonb not null default '{}'::jsonb,
  repeat_count int not null default 1 check (repeat_count >= 1),
  classification_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mx_groups_project on mx_groups(project_id);

alter table mx_groups enable row level security;

create policy "groups_select" on mx_groups
  for select using (
    project_id in (select id from mx_projects where id = mx_groups.project_id)
  );

create policy "groups_insert" on mx_groups
  for insert with check (true);

create policy "groups_update" on mx_groups
  for update using (true);

create policy "groups_delete" on mx_groups
  for delete using (true);
