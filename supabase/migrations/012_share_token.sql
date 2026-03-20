-- 012_share_token.sql
-- Idempotent re-application of share_token column + index (originally in 010)
-- Safe to run even if 010 was already applied — both statements use IF NOT EXISTS.
-- E26 — 2026-03-19

ALTER TABLE mx_projects ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mx_projects_share_token
  ON mx_projects(share_token) WHERE share_token IS NOT NULL;

-- BUG-A8-5-033 fix: add migration tracking
INSERT INTO _migrations (name) VALUES ('012_share_token.sql')
ON CONFLICT (name) DO NOTHING;
