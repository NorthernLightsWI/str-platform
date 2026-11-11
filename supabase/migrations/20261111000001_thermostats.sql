-- ==========================================================
-- Thermostat Automation — Phase 1
-- ==========================================================

-- ── thermostats ───────────────────────────────────────────
CREATE TABLE thermostats (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  seam_device_id  TEXT        NOT NULL,
  label           TEXT        NOT NULL DEFAULT 'Main floor',
  capabilities    JSONB,
  last_seen       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seam_device_id)
);

CREATE INDEX thermostats_property_id_idx ON thermostats(property_id);

CREATE TRIGGER set_thermostats_updated_at
  BEFORE UPDATE ON thermostats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── thermostat_settings (one row per property) ────────────
CREATE TABLE thermostat_settings (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id             UUID    NOT NULL REFERENCES properties(id) ON DELETE CASCADE UNIQUE,
  enabled                 BOOLEAN NOT NULL DEFAULT false,
  dry_run                 BOOLEAN NOT NULL DEFAULT true,
  occupied_heat           INTEGER NOT NULL DEFAULT 68,
  occupied_cool           INTEGER NOT NULL DEFAULT 74,
  vacant_heat             INTEGER NOT NULL DEFAULT 58,
  vacant_cool             INTEGER NOT NULL DEFAULT 82,
  freeze_floor            INTEGER NOT NULL DEFAULT 55,
  warmup_minutes          INTEGER NOT NULL DEFAULT 180,
  checkout_buffer_minutes INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_thermostat_settings_updated_at
  BEFORE UPDATE ON thermostat_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── thermostat_schedules ──────────────────────────────────
CREATE TABLE thermostat_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  thermostat_id    UUID NOT NULL REFERENCES thermostats(id) ON DELETE CASCADE,
  booking_id       UUID REFERENCES bookings(id) ON DELETE SET NULL,
  seam_schedule_id TEXT,
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned','active','done','cancelled','failed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX thermostat_schedules_property_id_idx ON thermostat_schedules(property_id);
CREATE INDEX thermostat_schedules_thermostat_id_idx ON thermostat_schedules(thermostat_id);
CREATE INDEX thermostat_schedules_status_idx ON thermostat_schedules(status);
CREATE INDEX thermostat_schedules_starts_at_idx ON thermostat_schedules(starts_at);

-- ── thermostat_events ─────────────────────────────────────
-- Logs every attempted or performed action (including dry runs)
CREATE TABLE thermostat_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID REFERENCES properties(id) ON DELETE CASCADE,
  thermostat_id UUID REFERENCES thermostats(id) ON DELETE SET NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  action        TEXT NOT NULL,
  request       JSONB,
  response      JSONB,
  source        TEXT NOT NULL CHECK (source IN ('cron','manual','webhook')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX thermostat_events_property_id_idx  ON thermostat_events(property_id);
CREATE INDEX thermostat_events_occurred_at_idx  ON thermostat_events(occurred_at DESC);
CREATE INDEX thermostat_events_thermostat_id_idx ON thermostat_events(thermostat_id);

-- ── RLS ───────────────────────────────────────────────────
ALTER TABLE thermostats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE thermostat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE thermostat_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE thermostat_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_thermostats"          ON thermostats
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_thermostat_settings"  ON thermostat_settings
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_thermostat_schedules" ON thermostat_schedules
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_thermostat_events"    ON thermostat_events
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ── visible_* views ───────────────────────────────────────
CREATE OR REPLACE VIEW visible_thermostats
  WITH (security_invoker = true)
AS
  SELECT t.* FROM thermostats t
  JOIN properties p ON p.id = t.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_thermostat_settings
  WITH (security_invoker = true)
AS
  SELECT ts.* FROM thermostat_settings ts
  JOIN properties p ON p.id = ts.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_thermostat_schedules
  WITH (security_invoker = true)
AS
  SELECT ts.* FROM thermostat_schedules ts
  JOIN properties p ON p.id = ts.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_thermostat_events
  WITH (security_invoker = true)
AS
  SELECT te.* FROM thermostat_events te
  LEFT JOIN properties p ON p.id = te.property_id
  WHERE te.property_id IS NULL OR NOT p.is_hidden;

-- ── app_settings seed rows ────────────────────────────────
INSERT INTO app_settings (key, value, description)
VALUES
  ('seam_api_key',                  to_jsonb(''::text),    'Seam API key (sandbox or production)'),
  ('seam_workspace_mode',           to_jsonb('sandbox'::text), 'Seam workspace mode: sandbox | production'),
  ('thermostat_automation_enabled', to_jsonb(false),        'Master kill switch for all thermostat automation'),
  ('default_checkin_time',          to_jsonb('16:00:00'::text), 'Default property check-in time (HH:MM:SS)'),
  ('default_checkout_time',         to_jsonb('11:00:00'::text), 'Default property check-out time (HH:MM:SS)'),
  ('thermostat_timezone',           to_jsonb('America/Chicago'::text), 'IANA timezone for thermostat schedule calculations')
ON CONFLICT (key) DO NOTHING;
