-- GAP-006: Add formula fields to mx_classifications (AUDIT-A6 E17 #4-6)
-- Fixes data loss: formula, formulaUnit, formulaSavedToLibrary were dropped on Supabase writes
alter table mx_classifications add column if not exists formula text;
alter table mx_classifications add column if not exists formula_unit text;
alter table mx_classifications add column if not exists formula_saved_to_library boolean not null default false;
