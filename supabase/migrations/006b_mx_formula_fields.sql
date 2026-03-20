-- GAP-006: Add formula fields to mx_classifications (AUDIT-A6 E17 #4-6)
-- Fixes data loss: formula, formulaUnit, formulaSavedToLibrary were dropped on Supabase writes
alter table mx_classifications add column if not exists formula text;
alter table mx_classifications add column if not exists formula_unit text;
alter table mx_classifications add column if not exists formula_saved_to_library boolean not null default false;

-- BUG-A8-5-030 fix: renamed from 006_mx_formula_fields.sql to resolve duplicate prefix.
-- Track under both names so environments that already ran the old name don't re-run it.
INSERT INTO _migrations (name) VALUES ('006_mx_formula_fields.sql') ON CONFLICT (name) DO NOTHING;
INSERT INTO _migrations (name) VALUES ('006b_mx_formula_fields.sql') ON CONFLICT (name) DO NOTHING;
