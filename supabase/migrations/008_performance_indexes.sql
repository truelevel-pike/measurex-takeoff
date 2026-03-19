/*
 * 008_performance_indexes.sql — MeasureX Wave 13
 *
 * Adds composite and single-column indexes on the four most-queried
 * tables to speed up project-scoped lookups:
 *
 *   idx_mx_polygons_project_page    — polygons filtered by project + page
 *   idx_mx_classifications_project  — classifications filtered by project
 *   idx_mx_scales_project_page      — per-page scale lookups
 *   idx_mx_pages_project            — pages filtered by project
 *
 * All use IF NOT EXISTS so the migration is safe to re-run.
 */

-- Polygons: most queries filter by project_id, often also by page_number
CREATE INDEX IF NOT EXISTS idx_mx_polygons_project_page
  ON mx_polygons (project_id, page_number);

-- Classifications: always fetched per-project
CREATE INDEX IF NOT EXISTS idx_mx_classifications_project
  ON mx_classifications (project_id);

-- Scales: looked up by project + page for per-page calibration
CREATE INDEX IF NOT EXISTS idx_mx_scales_project_page
  ON mx_scales (project_id, page_number);

-- Pages: listed per-project
CREATE INDEX IF NOT EXISTS idx_mx_pages_project
  ON mx_pages (project_id);
