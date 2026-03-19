create table if not exists mx_classification_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('area', 'linear', 'count')),
  color text not null default '#3B82F6',
  unit_cost numeric(12,2) not null default 0,
  is_org boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table mx_classification_library enable row level security;

-- Org templates visible to all authenticated users
create policy "org_library_read" on mx_classification_library
  for select using (is_org = true or auth.uid() = created_by);

create policy "org_library_insert" on mx_classification_library
  for insert with check (auth.uid() = created_by);

create policy "org_library_update" on mx_classification_library
  for update using (auth.uid() = created_by);

create policy "org_library_delete" on mx_classification_library
  for delete using (auth.uid() = created_by);

-- Seed 10 common construction classifications as org templates
-- Using a system/null created_by for seeded org templates
insert into mx_classification_library (name, type, color, unit_cost, is_org, created_by) values
  ('Concrete Slab',       'area',   '#6B7280', 8.50,  true, null),
  ('Exterior Wall',       'linear', '#92400E', 45.00, true, null),
  ('Interior Wall',       'linear', '#D97706', 28.00, true, null),
  ('Roof',                'area',   '#1D4ED8', 12.00, true, null),
  ('Window',              'count',  '#60A5FA', 350.00,true, null),
  ('Door',                'count',  '#7C3AED', 280.00,true, null),
  ('Electrical Outlet',   'count',  '#F59E0B', 85.00, true, null),
  ('Plumbing Fixture',    'count',  '#10B981', 420.00,true, null),
  ('Column',              'count',  '#EF4444', 1200.00,true,null),
  ('Stair',               'count',  '#8B5CF6', 2500.00,true,null);
