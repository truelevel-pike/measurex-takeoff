-- 019_assemblies_anon_grant_fix.sql
-- BUG-A8-009 fix: Remove GRANT ALL ON mx_assemblies TO anon.
-- The previous migration (016_assemblies_grants.sql) gave unauthenticated
-- users full read/write/delete access to the assemblies table, which is
-- almost certainly unintentional.  Revoke write permissions from anon;
-- preserve SELECT if read access by anonymous visitors is needed.

REVOKE INSERT, UPDATE, DELETE ON TABLE mx_assemblies FROM anon;

-- anon may still SELECT (read) assemblies if the app exposes public read.
-- If anonymous read should also be disallowed, uncomment the line below:
-- REVOKE ALL ON TABLE mx_assemblies FROM anon;

INSERT INTO _migrations (name) VALUES ('019_assemblies_anon_grant_fix.sql')
ON CONFLICT (name) DO NOTHING;
