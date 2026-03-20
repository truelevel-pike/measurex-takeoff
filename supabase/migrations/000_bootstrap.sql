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
SET search_path = public, pg_temp
AS $$
BEGIN
  EXECUTE sql_text;
END;
$$;

-- R-A8-001 fix: revoke PUBLIC execute on _exec_sql to prevent unauthenticated
-- arbitrary SQL execution via the Supabase API. Only service_role may call it.
REVOKE EXECUTE ON FUNCTION _exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _exec_sql(text) TO service_role;

-- Record this bootstrap migration as applied
INSERT INTO _migrations (name) VALUES ('000_bootstrap.sql')
ON CONFLICT (name) DO NOTHING;
