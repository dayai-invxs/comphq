-- The bucket the logo endpoint writes to. The handler uploads with the
-- service role — no storage RLS needed for writes — and serves the file
-- through getPublicUrl, which only answers for a public bucket.
--
-- In a migration rather than clicked into the dashboard, so a fresh project
-- can serve POST /api/logo without someone remembering the bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;
