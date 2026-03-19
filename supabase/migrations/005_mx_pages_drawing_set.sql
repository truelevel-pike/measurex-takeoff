-- GAP-005: Add drawing_set column to mx_pages for grouping pages by discipline
alter table mx_pages add column if not exists drawing_set text;
