-- Bootstrap migration: creates _migrations tracking table and _exec_sql helper function.
-- This MUST be applied manually via the Supabase SQL Editor before running the migration script.
-- After applying, re-run: npm run migrate

CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION _exec_sql(sql_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_text;
END;
$$;

-- Record this bootstrap migration as applied
INSERT INTO _migrations (name) VALUES ('000_bootstrap.sql')
ON CONFLICT (name) DO NOTHING;
