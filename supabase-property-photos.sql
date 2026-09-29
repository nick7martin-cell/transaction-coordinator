-- Run once in Supabase SQL Editor (after supabase-enable-rls.sql).
-- Stores property card thumbnails in Storage instead of multi‑MB data URLs in worksheet JSONB.

ALTER TABLE transaction_meta
  ADD COLUMN IF NOT EXISTS property_photo_path TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-photos', 'property-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read for card thumbnails; uploads use service role from the Next.js API.
DROP POLICY IF EXISTS "property_photos_public_read" ON storage.objects;
CREATE POLICY "property_photos_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'property-photos');
