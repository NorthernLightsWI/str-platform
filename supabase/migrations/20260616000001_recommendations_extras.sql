-- Add columns needed for AI-generated recommendations
ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS impact_statement TEXT,
  ADD COLUMN IF NOT EXISTS action_steps     TEXT[],
  ADD COLUMN IF NOT EXISTS is_completed     BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ;
