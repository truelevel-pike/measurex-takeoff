-- 021_add_owner_id_to_projects.sql
-- R-A8-003 fix: add owner_id column to mx_projects so RLS policies can
-- scope rows to the authenticated user. Without this column, the
-- groups RLS policies in 018_mx_groups_rls_fix.sql silently return zero rows.

ALTER TABLE mx_projects ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_mx_projects_owner_id ON mx_projects(owner_id);

-- Backfill: existing rows get NULL owner_id. The application layer must
-- set owner_id = auth.uid() on INSERT going forward.

INSERT INTO _migrations (name) VALUES ('021_add_owner_id_to_projects.sql')
ON CONFLICT (name) DO NOTHING;
