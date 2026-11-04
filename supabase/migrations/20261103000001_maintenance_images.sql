ALTER TABLE maintenance_issues
  ADD COLUMN IF NOT EXISTS images TEXT[];
