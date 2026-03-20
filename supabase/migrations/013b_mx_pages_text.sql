-- 013b_mx_pages_text.sql (renamed from 013_mx_pages_text.sql — BUG-A8-5-031 fix: resolve duplicate prefix)
-- Add a proper `text` column to mx_pages for storing extracted PDF text content.
-- Previously, text was stored in the `pdf_url` column (misused); migrate that data over.

ALTER TABLE mx_pages ADD COLUMN IF NOT EXISTS text TEXT DEFAULT '';

-- Copy any existing text stored in pdf_url to the new text column
UPDATE mx_pages SET text = pdf_url WHERE pdf_url IS NOT NULL AND pdf_url != '' AND (text IS NULL OR text = '');

-- Track under both names so environments that already ran the old name don't re-run it
INSERT INTO _migrations (name) VALUES ('013_mx_pages_text.sql') ON CONFLICT (name) DO NOTHING;
INSERT INTO _migrations (name) VALUES ('013b_mx_pages_text.sql') ON CONFLICT (name) DO NOTHING;
