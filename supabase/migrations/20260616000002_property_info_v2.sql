-- ── Add 'maintenance' role ────────────────────────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'cleaner', 'maintenance'));

-- ── New columns on property_operational_info ───────────────────────────────────
ALTER TABLE property_operational_info
  ADD COLUMN IF NOT EXISTS trash_notes   TEXT,
  ADD COLUMN IF NOT EXISTS cleaner_notes TEXT;

-- ── vendor_contacts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category    TEXT        NOT NULL CHECK (category IN ('plumber','electrician','hvac','lawn_care','other')),
  name        TEXT        NOT NULL,
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users can read vendor_contacts"
  ON vendor_contacts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin cleaner can write vendor_contacts"
  ON vendor_contacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','cleaner')
    )
  );

-- ── property_info_changelog ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_info_changelog (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  changed_by_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  field_changed   TEXT        NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE property_info_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users can read changelog"
  ON property_info_changelog FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin cleaner can insert changelog"
  ON property_info_changelog FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','cleaner')
    )
  );

-- ── recurring_maintenance ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_maintenance (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  item_name           TEXT        NOT NULL,
  interval_days       INTEGER     NOT NULL DEFAULT 365,
  last_completed_date DATE,
  last_completed_by   TEXT,
  next_due_date       DATE,
  notes               TEXT,
  filter_size         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recurring_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users can read recurring_maintenance"
  ON recurring_maintenance FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin cleaner can write recurring_maintenance"
  ON recurring_maintenance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','cleaner')
    )
  );
