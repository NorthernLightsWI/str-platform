CREATE TABLE listing_changes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  change_type       TEXT        NOT NULL CHECK (change_type IN (
                                  'price_base','price_min','price_override',
                                  'min_stay','title','description','photos',
                                  'amenity','other'
                                )),
  label             TEXT        NOT NULL,
  before_value      TEXT,
  after_value       TEXT,
  reason            TEXT,
  recommendation_id UUID        REFERENCES recommendations(id) ON DELETE SET NULL,
  source            TEXT        NOT NULL DEFAULT 'manual'
                                  CHECK (source IN ('manual','pricelabs_api','agent')),
  applied_at        DATE        NOT NULL,
  applied_by        UUID        REFERENCES auth.users(id),
  status            TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','reverted')),
  reverted_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE listing_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_listing_changes"
  ON listing_changes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE INDEX listing_changes_property_applied_idx
  ON listing_changes (property_id, applied_at);
