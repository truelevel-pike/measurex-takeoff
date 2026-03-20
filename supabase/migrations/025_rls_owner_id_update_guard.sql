-- 025_rls_owner_id_update_guard.sql
-- BUG-A8-5-010 fix: add WITH CHECK clause to mx_projects UPDATE policy to
-- prevent users from changing owner_id to another user's ID.
-- Previously the projects_update policy used only USING (owner_id = auth.uid())
-- which verified the row being updated belongs to the current user, but did NOT
-- prevent the user from setting owner_id = <another_user_uuid> in the same UPDATE,
-- effectively transferring ownership.
-- Fix: also assert WITH CHECK (owner_id = auth.uid()) so owner_id cannot be mutated.

-- Drop the existing update policy and recreate with WITH CHECK guard
DROP POLICY IF EXISTS "projects_update" ON mx_projects;

CREATE POLICY "projects_update" ON mx_projects
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Verify no other permissive policies remain on mx_projects that could bypass this
DO $$
DECLARE
  permissive_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO permissive_count
  FROM pg_policies
  WHERE tablename = 'mx_projects'
    AND cmd = 'UPDATE'
    AND permissive = 'PERMISSIVE'
    AND qual LIKE '%true%';

  IF permissive_count > 0 THEN
    RAISE EXCEPTION 'BUG-A8-5-010 guard: found % residual permissive UPDATE polic(ies) on mx_projects that allow unrestricted writes', permissive_count;
  END IF;
END $$;

INSERT INTO _migrations (name) VALUES ('025_rls_owner_id_update_guard.sql')
ON CONFLICT (name) DO NOTHING;
