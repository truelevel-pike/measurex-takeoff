-- Grant service_role full access to mx_assemblies and disable RLS for service role
GRANT ALL ON TABLE mx_assemblies TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
-- Also ensure authenticated role has access
GRANT ALL ON TABLE mx_assemblies TO authenticated;
GRANT ALL ON TABLE mx_assemblies TO anon;

-- BUG-A8-5-042 fix: add migration tracking
INSERT INTO _migrations (name) VALUES ('016_assemblies_grants.sql')
ON CONFLICT (name) DO NOTHING;
