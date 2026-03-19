-- GAP-011: Ensure formula columns exist on mx_classifications
-- Idempotent fix for Supabase deployments where 006_mx_formula_fields.sql
-- may not have been applied (e.g. fresh projects seeded only from 001_mx_tables.sql
-- or 009_complete_schema.sql without the formula ALTER TABLE step).
-- Safe to run multiple times; IF NOT EXISTS guards are present.

ALTER TABLE mx_classifications ADD COLUMN IF NOT EXISTS formula TEXT;
ALTER TABLE mx_classifications ADD COLUMN IF NOT EXISTS formula_unit TEXT;
ALTER TABLE mx_classifications ADD COLUMN IF NOT EXISTS formula_saved_to_library BOOLEAN NOT NULL DEFAULT FALSE;

-- Notify PostgREST to reload its schema cache so the new columns are visible immediately.
NOTIFY pgrst, 'reload schema';
