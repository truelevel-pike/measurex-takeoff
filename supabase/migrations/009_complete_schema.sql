-- 009_complete_schema.sql
-- Production-readiness: RLS policies, missing triggers, schema hardening
-- E38 — 2026-03-18

-- ============================================================
-- 1. Ensure all tables exist (idempotent — will not drop existing)
-- ============================================================

-- Core tables already created by 000–008. This section is a safety net
-- so the migration is self-contained if run on a fresh database.

CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mx_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mx_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES mx_projects(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  width FLOAT NOT NULL,
  height FLOAT NOT NULL,
  pdf_url TEXT,
  text TEXT DEFAULT '',
  name TEXT,
  drawing_set TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, page_number)
);

CREATE TABLE IF NOT EXISTS mx_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES mx_projects(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  pixels_per_unit FLOAT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('ft', 'in', 'm', 'cm', 'mm')),
  label TEXT DEFAULT 'Custom',
  source TEXT NOT NULL CHECK (source IN ('manual', 'auto', 'ai')),
  confidence FLOAT,
  calibrated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, page_number)
);

CREATE TABLE IF NOT EXISTS mx_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES mx_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('area', 'linear', 'count')),
  color TEXT NOT NULL DEFAULT '#3b82f6',
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  formula TEXT,
  formula_unit TEXT,
  formula_saved_to_library BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mx_polygons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES mx_projects(id) ON DELETE CASCADE,
  classification_id UUID NOT NULL REFERENCES mx_classifications(id) ON DELETE CASCADE,
  page_number INT NOT NULL DEFAULT 1,
  points JSONB NOT NULL DEFAULT '[]',
  area_pixels FLOAT NOT NULL DEFAULT 0,
  linear_pixels FLOAT NOT NULL DEFAULT 0,
  is_complete BOOLEAN NOT NULL DEFAULT TRUE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mx_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES mx_projects(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'delete')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('polygon', 'classification', 'scale')),
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mx_assemblies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES mx_projects(id) ON DELETE CASCADE,
  classification_id UUID NOT NULL REFERENCES mx_classifications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'SF',
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  quantity_formula TEXT NOT NULL DEFAULT 'area',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- ============================================================
-- 2. Indexes (idempotent — all use IF NOT EXISTS)
-- ============================================================

-- mx_pages
CREATE INDEX IF NOT EXISTS idx_mx_pages_project ON mx_pages(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_pages_page ON mx_pages(project_id, page_number);

-- mx_scales
CREATE INDEX IF NOT EXISTS idx_mx_scales_project ON mx_scales(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_scales_project_page ON mx_scales(project_id, page_number);

-- mx_classifications
CREATE INDEX IF NOT EXISTS idx_mx_classifications_project ON mx_classifications(project_id);

-- mx_polygons
CREATE INDEX IF NOT EXISTS idx_mx_polygons_project ON mx_polygons(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_polygons_classification ON mx_polygons(classification_id);
CREATE INDEX IF NOT EXISTS idx_mx_polygons_page ON mx_polygons(project_id, page_number);
CREATE INDEX IF NOT EXISTS idx_mx_polygons_project_page ON mx_polygons(project_id, page_number);

-- mx_history
CREATE INDEX IF NOT EXISTS idx_mx_history_project ON mx_history(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_history_created ON mx_history(project_id, created_at DESC);

-- mx_assemblies
CREATE INDEX IF NOT EXISTS idx_mx_assemblies_project ON mx_assemblies(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_assemblies_classification ON mx_assemblies(classification_id);

-- mx_estimates
CREATE INDEX IF NOT EXISTS idx_mx_estimates_project ON mx_estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_estimates_classification ON mx_estimates(classification_id);

-- ============================================================
-- 3. Trigger function: updated_at auto-set
-- ============================================================

CREATE OR REPLACE FUNCTION mx_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers (DROP + CREATE to be idempotent)
DROP TRIGGER IF EXISTS trg_mx_projects_updated_at ON mx_projects;
CREATE TRIGGER trg_mx_projects_updated_at
  BEFORE UPDATE ON mx_projects
  FOR EACH ROW EXECUTE FUNCTION mx_set_updated_at();

DROP TRIGGER IF EXISTS trg_mx_polygons_updated_at ON mx_polygons;
CREATE TRIGGER trg_mx_polygons_updated_at
  BEFORE UPDATE ON mx_polygons
  FOR EACH ROW EXECUTE FUNCTION mx_set_updated_at();

DROP TRIGGER IF EXISTS trg_mx_assemblies_updated_at ON mx_assemblies;
CREATE TRIGGER trg_mx_assemblies_updated_at
  BEFORE UPDATE ON mx_assemblies
  FOR EACH ROW EXECUTE FUNCTION mx_set_updated_at();

DROP TRIGGER IF EXISTS trg_mx_estimates_updated_at ON mx_estimates;
CREATE TRIGGER trg_mx_estimates_updated_at
  BEFORE UPDATE ON mx_estimates
  FOR EACH ROW EXECUTE FUNCTION mx_set_updated_at();

-- ============================================================
-- 4. Row Level Security — enable on all tables, allow-all policies
--    (restrict to authenticated users in a future migration)
-- ============================================================

ALTER TABLE mx_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON mx_projects;
CREATE POLICY "Allow all" ON mx_projects FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE mx_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON mx_pages;
CREATE POLICY "Allow all" ON mx_pages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE mx_scales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON mx_scales;
CREATE POLICY "Allow all" ON mx_scales FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE mx_classifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON mx_classifications;
CREATE POLICY "Allow all" ON mx_classifications FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE mx_polygons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON mx_polygons;
CREATE POLICY "Allow all" ON mx_polygons FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE mx_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON mx_history;
CREATE POLICY "Allow all" ON mx_history FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE mx_assemblies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON mx_assemblies;
CREATE POLICY "Allow all" ON mx_assemblies FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE mx_estimates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON mx_estimates;
CREATE POLICY "Allow all" ON mx_estimates FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 5. Record this migration
-- ============================================================

INSERT INTO _migrations (name) VALUES ('009_complete_schema.sql')
ON CONFLICT (name) DO NOTHING;
