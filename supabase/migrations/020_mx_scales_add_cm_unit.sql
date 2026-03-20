-- GAP-020: Add 'cm' to mx_scales unit check constraint
-- The route and Zod schema already accept cm; the DB was missing it.

ALTER TABLE mx_scales DROP CONSTRAINT IF EXISTS mx_scales_unit_check;
ALTER TABLE mx_scales ADD CONSTRAINT mx_scales_unit_check
  CHECK (unit IN ('ft', 'in', 'm', 'cm', 'mm'));
