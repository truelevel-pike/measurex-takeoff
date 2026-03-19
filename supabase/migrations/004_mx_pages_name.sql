-- Add sheet name column to mx_pages for auto-naming (GAP-001)
alter table mx_pages add column if not exists name text;
