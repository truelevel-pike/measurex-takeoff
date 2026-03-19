-- GAP-007: Add index + unique constraint for scale per (project_id, page_number)
-- Already exists from 001, but add comment documenting intent for getScale query fix
comment on table mx_scales is 'Per-page scale calibration. Query MUST filter by both project_id AND page_number.';
-- Track when scale was last calibrated
alter table mx_scales add column if not exists calibrated_at timestamptz default now();
