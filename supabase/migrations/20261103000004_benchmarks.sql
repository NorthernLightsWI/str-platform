-- Per-property benchmark overrides
ALTER TABLE properties ADD COLUMN IF NOT EXISTS benchmark_adr_override      NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS benchmark_occupancy_override NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS listing_type TEXT
  CHECK (listing_type IN ('nightly','weekly','monthly'));

-- Market defaults in app_settings (seed only if not already present)
INSERT INTO app_settings (key, value)
VALUES ('market_adr',       '207'),
       ('market_occupancy', '57')
ON CONFLICT (key) DO NOTHING;
