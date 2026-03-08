-- Supabase schema for MeasureX Takeoff platform

-- Projects table
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc', now())
);

-- Drawing sets (a group of PDF plans)
CREATE TABLE drawing_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc', now())
);

-- Drawings (individual PDF pages)
CREATE TABLE drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_set_id uuid REFERENCES drawing_sets(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  name text,
  page_number integer NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc', now())
);

-- Polygons (all measured geometry)
CREATE TABLE polygons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid REFERENCES drawings(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'area', 'line', or 'count'
  coordinates jsonb NOT NULL,
  classification_id uuid REFERENCES classifications(id),
  created_at timestamp with time zone DEFAULT timezone('utc', now())
);

-- Classifications (labels/folders/types with color)
CREATE TABLE classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  parent_id uuid REFERENCES classifications(id),
  created_at timestamp with time zone DEFAULT timezone('utc', now())
);

-- Calibration (pixels per foot/meters per page)
CREATE TABLE calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid REFERENCES drawings(id) ON DELETE CASCADE,
  pixels_per_unit float8 NOT NULL,
  unit text DEFAULT 'ft',
  created_at timestamp with time zone DEFAULT timezone('utc', now())
);