-- 022_rls_owner_scoped.sql
-- R-A8-002 fix: replace permissive "Allow all" (USING true) RLS policies on
-- all eight core tables with owner-scoped policies that check owner_id.
-- Depends on 021_add_owner_id_to_projects.sql (owner_id column).

-- ============================================================
-- mx_projects: owner_id = auth.uid()
-- ============================================================
DROP POLICY IF EXISTS "Allow all" ON mx_projects;

CREATE POLICY "projects_select" ON mx_projects
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "projects_insert" ON mx_projects
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "projects_update" ON mx_projects
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "projects_delete" ON mx_projects
  FOR DELETE USING (owner_id = auth.uid());

-- ============================================================
-- Child tables: project_id must belong to a project owned by auth.uid()
-- ============================================================

-- mx_pages
DROP POLICY IF EXISTS "Allow all" ON mx_pages;
CREATE POLICY "pages_select" ON mx_pages
  FOR SELECT USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "pages_insert" ON mx_pages
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "pages_update" ON mx_pages
  FOR UPDATE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "pages_delete" ON mx_pages
  FOR DELETE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));

-- mx_scales
DROP POLICY IF EXISTS "Allow all" ON mx_scales;
CREATE POLICY "scales_select" ON mx_scales
  FOR SELECT USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "scales_insert" ON mx_scales
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "scales_update" ON mx_scales
  FOR UPDATE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "scales_delete" ON mx_scales
  FOR DELETE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));

-- mx_classifications
DROP POLICY IF EXISTS "Allow all" ON mx_classifications;
CREATE POLICY "classifications_select" ON mx_classifications
  FOR SELECT USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "classifications_insert" ON mx_classifications
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "classifications_update" ON mx_classifications
  FOR UPDATE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "classifications_delete" ON mx_classifications
  FOR DELETE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));

-- mx_polygons
DROP POLICY IF EXISTS "Allow all" ON mx_polygons;
CREATE POLICY "polygons_select" ON mx_polygons
  FOR SELECT USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "polygons_insert" ON mx_polygons
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "polygons_update" ON mx_polygons
  FOR UPDATE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "polygons_delete" ON mx_polygons
  FOR DELETE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));

-- mx_history
DROP POLICY IF EXISTS "Allow all" ON mx_history;
CREATE POLICY "history_select" ON mx_history
  FOR SELECT USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "history_insert" ON mx_history
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "history_update" ON mx_history
  FOR UPDATE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "history_delete" ON mx_history
  FOR DELETE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));

-- mx_assemblies
DROP POLICY IF EXISTS "Allow all" ON mx_assemblies;
CREATE POLICY "assemblies_select" ON mx_assemblies
  FOR SELECT USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "assemblies_insert" ON mx_assemblies
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "assemblies_update" ON mx_assemblies
  FOR UPDATE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "assemblies_delete" ON mx_assemblies
  FOR DELETE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));

-- mx_estimates
DROP POLICY IF EXISTS "Allow all" ON mx_estimates;
CREATE POLICY "estimates_select" ON mx_estimates
  FOR SELECT USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "estimates_insert" ON mx_estimates
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "estimates_update" ON mx_estimates
  FOR UPDATE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));
CREATE POLICY "estimates_delete" ON mx_estimates
  FOR DELETE USING (project_id IN (SELECT id FROM mx_projects WHERE owner_id = auth.uid()));

INSERT INTO _migrations (name) VALUES ('022_rls_owner_scoped.sql')
ON CONFLICT (name) DO NOTHING;
