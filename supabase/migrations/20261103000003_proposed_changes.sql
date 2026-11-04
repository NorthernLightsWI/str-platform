-- Add PriceLabs mapping columns to properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS pricelabs_listing_id  TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS pricelabs_price_floor NUMERIC;

-- proposed_changes table
CREATE TABLE proposed_changes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  change_type       TEXT        NOT NULL CHECK (change_type IN (
                                  'price_base','price_min','price_override',
                                  'min_stay','title','description','photos',
                                  'amenity','other'
                                )),
  label             TEXT        NOT NULL,
  current_value     TEXT,
  proposed_value    TEXT,
  reason            TEXT,
  recommendation_id UUID        REFERENCES recommendations(id) ON DELETE SET NULL,
  risk_note         TEXT,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN (
                                    'pending','approved','rejected','applied','failed','expired'
                                  )),
  payload           JSONB,
  result            JSONB,
  created_by        UUID        REFERENCES auth.users(id),
  decided_by        UUID        REFERENCES auth.users(id),
  decided_at        TIMESTAMPTZ,
  applied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE proposed_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_proposed_changes"
  ON proposed_changes FOR ALL
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

CREATE INDEX proposed_changes_property_status_idx
  ON proposed_changes (property_id, status);

CREATE INDEX proposed_changes_created_at_idx
  ON proposed_changes (created_at DESC);

-- App settings seed rows for PriceLabs automation guardrails
INSERT INTO app_settings (key, value, description)
VALUES
  ('pricelabs_writes_enabled', to_jsonb(false), 'Enable live writes to PriceLabs API (dry-run when false)'),
  ('pricelabs_max_change_pct', to_jsonb(10),    'Maximum allowed price change percentage per proposal')
ON CONFLICT (key) DO NOTHING;
