-- 018_mx_groups_rls_fix.sql
-- BUG-A8-008 fix: Replace permissive (true) RLS policies on mx_groups with
-- owner-scoped policies that tie group access to project ownership.
-- The previous policies used WITH CHECK (true) / USING (true) which effectively
-- allowed any authenticated user to insert, update, or delete any group.

-- Drop the permissive policies from 017_mx_groups.sql
DROP POLICY IF EXISTS "groups_select" ON mx_groups;
DROP POLICY IF EXISTS "groups_insert" ON mx_groups;
DROP POLICY IF EXISTS "groups_update" ON mx_groups;
DROP POLICY IF EXISTS "groups_delete" ON mx_groups;

-- Re-create with proper owner-scoped checks:
-- Users may only access groups belonging to projects they own.

CREATE POLICY "groups_select" ON mx_groups
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM mx_projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "groups_insert" ON mx_groups
  FOR INSERT WITH CHECK (
    project_id IN (
      SELECT id FROM mx_projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "groups_update" ON mx_groups
  FOR UPDATE USING (
    project_id IN (
      SELECT id FROM mx_projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "groups_delete" ON mx_groups
  FOR DELETE USING (
    project_id IN (
      SELECT id FROM mx_projects WHERE owner_id = auth.uid()
    )
  );

INSERT INTO _migrations (name) VALUES ('018_mx_groups_rls_fix.sql')
ON CONFLICT (name) DO NOTHING;
