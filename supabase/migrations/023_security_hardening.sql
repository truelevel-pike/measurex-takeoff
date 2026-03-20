-- 023_security_hardening.sql
-- BUG-A8-4-012: Revoke anonymous SELECT on mx_classification_library
-- BUG-A8-4-013: Guard is_org promotion to service_role only
-- BUG-A8-4-014: Add storage RLS policies for pdfs bucket

-- ============================================================
-- BUG-A8-4-012: Revoke anon access to classification library
-- Unauthenticated visitors should not be able to read pricing data
-- ============================================================
REVOKE SELECT ON mx_classification_library FROM anon;

-- ============================================================
-- BUG-A8-4-013: Restrict is_org promotion to service_role
-- Any authenticated user could previously set is_org = true on their
-- own library entries, making them visible to all users.
-- ============================================================
DROP POLICY IF EXISTS "org_library_update" ON mx_classification_library;

-- Users can update their own entries but cannot set is_org = true
CREATE POLICY "org_library_update" ON mx_classification_library
  FOR UPDATE USING (auth.uid() = created_by)
  WITH CHECK (is_org = false OR auth.role() = 'service_role');

-- ============================================================
-- BUG-A8-4-014: Add storage RLS policies for pdfs bucket
-- Without these, any user can upload/download/list other users' PDFs.
-- Depends on 021 owner_id column on mx_projects.
-- ============================================================
CREATE POLICY "Users can upload own project PDFs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM mx_projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can read own project PDFs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM mx_projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own project PDFs" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM mx_projects WHERE owner_id = auth.uid()
    )
  );

INSERT INTO _migrations (name) VALUES ('023_security_hardening.sql')
ON CONFLICT (name) DO NOTHING;
