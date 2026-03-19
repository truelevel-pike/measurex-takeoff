-- Estimates table: stores per-project unit costs and estimate snapshots.
-- Replaces localStorage-based estimate-storage.ts for persistence across devices.

CREATE TABLE IF NOT EXISTS mx_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES mx_projects(id) ON DELETE CASCADE,
  classification_id UUID NOT NULL REFERENCES mx_classifications(id) ON DELETE CASCADE,
  unit TEXT NOT NULL DEFAULT 'SF',
  cost_per_unit NUMERIC(12,4) NOT NULL DEFAULT 0,
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal NUMERIC(16,4) GENERATED ALWAYS AS (cost_per_unit * quantity) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mx_estimates_project ON mx_estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_estimates_classification ON mx_estimates(classification_id);

-- Unique constraint: one estimate line per project+classification
ALTER TABLE mx_estimates
  ADD CONSTRAINT uq_mx_estimates_proj_class UNIQUE (project_id, classification_id);
