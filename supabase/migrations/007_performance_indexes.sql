-- Composite and single-column indexes for the most common project-scoped query patterns.

CREATE INDEX IF NOT EXISTS idx_mx_polygons_project_id ON mx_polygons(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_polygons_classification_id ON mx_polygons(classification_id);
CREATE INDEX IF NOT EXISTS idx_mx_polygons_page_number ON mx_polygons(project_id, page_number);
CREATE INDEX IF NOT EXISTS idx_mx_classifications_project_id ON mx_classifications(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_assemblies_project_id ON mx_assemblies(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_history_project_id ON mx_history(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_scales_project_id ON mx_scales(project_id);
CREATE INDEX IF NOT EXISTS idx_mx_pages_project_id ON mx_pages(project_id);
