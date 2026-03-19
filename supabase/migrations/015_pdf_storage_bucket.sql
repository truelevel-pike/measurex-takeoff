-- Create Supabase Storage bucket for PDF files.
-- Service-role key bypasses RLS, so no policies needed for server-side access.
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs', 'pdfs', false)
ON CONFLICT (id) DO NOTHING;
