ALTER TABLE maintenance_issues ADD COLUMN IF NOT EXISTS notes         TEXT;
ALTER TABLE maintenance_issues ADD COLUMN IF NOT EXISTS reporter_name TEXT;
