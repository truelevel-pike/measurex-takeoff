-- 010_share_tokens.sql
-- Add share_token column to mx_projects for shareable read-only links
-- E37 — 2026-03-19

-- Add nullable share_token column (UUID, generated on demand via API)
ALTER TABLE mx_projects ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT NULL;

-- Unique index so we can look up projects by share_token efficiently
CREATE UNIQUE INDEX IF NOT EXISTS idx_mx_projects_share_token
  ON mx_projects(share_token) WHERE share_token IS NOT NULL;

-- Record this migration
INSERT INTO _migrations (name) VALUES ('010_share_tokens.sql')
ON CONFLICT (name) DO NOTHING;
