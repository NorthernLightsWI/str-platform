-- Add rule_key for idempotent generation and refreshed_at for freshness display
ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS rule_key     TEXT,
  ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ;

-- Partial index for fast lookup of active recs by property + rule
CREATE INDEX IF NOT EXISTS recommendations_active_rule_key_idx
  ON recommendations(property_id, rule_key)
  WHERE rule_key IS NOT NULL
    AND is_dismissed = false
    AND is_completed = false;
