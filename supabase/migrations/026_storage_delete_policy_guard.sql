-- 026_storage_delete_policy_guard.sql
-- BUG-A8-5-011: Ensure storage DELETE policy for pdfs bucket is present.
-- The policy was added in 023_security_hardening.sql but this migration
-- re-asserts it idempotently to guard against environments where 023 was
-- partially applied or rolled back.

-- Drop and re-create to ensure policy is correct (idempotent)
DROP POLICY IF EXISTS "Users can delete own project PDFs" ON storage.objects;

CREATE POLICY "Users can delete own project PDFs" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM mx_projects WHERE owner_id = auth.uid()
    )
  );

INSERT INTO _migrations (name) VALUES ('026_storage_delete_policy_guard.sql')
ON CONFLICT (name) DO NOTHING;
