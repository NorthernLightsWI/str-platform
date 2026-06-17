-- ── New columns on property_operational_info ───────────────────────────────
ALTER TABLE property_operational_info
  ADD COLUMN IF NOT EXISTS lockbox_location TEXT,
  ADD COLUMN IF NOT EXISTS lockbox_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS entry_notes TEXT;

-- ── property-photos storage bucket ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-photos',
  'property-photos',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ──────────────────────────────────────────────────────
CREATE POLICY "Auth users can read property photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'property-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admin and cleaner can upload property photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'property-photos' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','cleaner')
    )
  );

CREATE POLICY "Admin and cleaner can update property photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'property-photos' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','cleaner')
    )
  );

CREATE POLICY "Admin and cleaner can delete property photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'property-photos' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','cleaner')
    )
  );
