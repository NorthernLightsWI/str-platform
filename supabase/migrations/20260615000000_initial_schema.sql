-- ==========================================================
-- STR Platform — Initial Schema
-- ==========================================================

-- ==========================================================
-- EXTENSIONS
-- ==========================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================================
-- UTILITY: updated_at auto-stamp
-- ==========================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================================
-- PROFILES  (extends auth.users)
-- ==========================================================
CREATE TABLE profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  full_name    TEXT,
  role         TEXT        NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'cleaner')),
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create a profile row whenever a user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- PROPERTIES
-- ==========================================================
CREATE TABLE properties (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- OwnerRez fields
  ownerrez_id    TEXT         UNIQUE,
  external_name  TEXT         NOT NULL,
  internal_name  TEXT,
  max_guests     INTEGER,
  public_url     TEXT,
  -- Location
  address        TEXT,
  city           TEXT,
  state          TEXT,
  zip            TEXT,
  country        TEXT         NOT NULL DEFAULT 'US',
  -- Details
  bedrooms       INTEGER,
  bathrooms      NUMERIC(3,1),
  square_feet    INTEGER,
  description    TEXT,
  thumbnail_url  TEXT,
  is_active      BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX properties_owner_id_idx ON properties(owner_id);

CREATE TRIGGER set_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- BOOKINGS
-- ==========================================================
CREATE TABLE bookings (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  -- OwnerRez fields
  ownerrez_id    TEXT         UNIQUE,
  arrival        DATE         NOT NULL,
  departure      DATE         NOT NULL,
  total_amount   NUMERIC(10,2),
  listing_site   TEXT,
  is_block       BOOLEAN      NOT NULL DEFAULT false,
  -- Guest
  guest_name     TEXT,
  guest_email    TEXT,
  guest_phone    TEXT,
  num_guests     INTEGER,
  -- Financial breakdown
  base_amount    NUMERIC(10,2),
  cleaning_fee   NUMERIC(10,2),
  taxes          NUMERIC(10,2),
  platform_fee   NUMERIC(10,2),
  net_revenue    NUMERIC(10,2),
  -- Status
  status         TEXT         NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  booked_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT bookings_dates_check CHECK (departure > arrival)
);

CREATE INDEX bookings_property_id_idx ON bookings(property_id);
CREATE INDEX bookings_arrival_idx      ON bookings(arrival);
CREATE INDEX bookings_departure_idx    ON bookings(departure);
CREATE INDEX bookings_status_idx       ON bookings(status);

CREATE TRIGGER set_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- PRICING
-- ==========================================================
CREATE TABLE pricing (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  date          DATE         NOT NULL,
  base_price    NUMERIC(10,2) NOT NULL,
  min_stay      INTEGER,
  is_available  BOOLEAN      NOT NULL DEFAULT true,
  source        TEXT         NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (property_id, date)
);

CREATE INDEX pricing_property_date_idx ON pricing(property_id, date);

CREATE TRIGGER set_pricing_updated_at
  BEFORE UPDATE ON pricing
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- OCCUPANCY SNAPSHOTS
-- ==========================================================
CREATE TABLE occupancy_snapshots (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  snapshot_date    DATE         NOT NULL,
  occupancy_rate   NUMERIC(5,2),
  nights_booked    INTEGER,
  nights_available INTEGER,
  nights_blocked   INTEGER,
  adr              NUMERIC(10,2),
  revpar           NUMERIC(10,2),
  revenue          NUMERIC(10,2),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (property_id, snapshot_date)
);

CREATE INDEX occupancy_snapshots_property_date_idx ON occupancy_snapshots(property_id, snapshot_date);

-- ==========================================================
-- REVIEWS
-- ==========================================================
CREATE TABLE reviews (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  booking_id            UUID         REFERENCES bookings(id) ON DELETE SET NULL,
  ownerrez_id           TEXT         UNIQUE,
  listing_site          TEXT,
  reviewer_name         TEXT,
  overall_rating        NUMERIC(3,1),
  cleanliness_rating    NUMERIC(3,1),
  communication_rating  NUMERIC(3,1),
  location_rating       NUMERIC(3,1),
  accuracy_rating       NUMERIC(3,1),
  value_rating          NUMERIC(3,1),
  review_text           TEXT,
  response_text         TEXT,
  response_at           TIMESTAMPTZ,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX reviews_property_id_idx ON reviews(property_id);

CREATE TRIGGER set_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- MARKET DATA
-- ==========================================================
CREATE TABLE market_data (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID         REFERENCES properties(id) ON DELETE CASCADE,
  market              TEXT         NOT NULL,
  data_date           DATE         NOT NULL,
  avg_daily_rate      NUMERIC(10,2),
  avg_occupancy_rate  NUMERIC(5,2),
  avg_revpar          NUMERIC(10,2),
  demand_score        NUMERIC(5,2),
  supply_count        INTEGER,
  source              TEXT,
  raw_data            JSONB,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (property_id, market, data_date, source)
);

CREATE INDEX market_data_property_date_idx ON market_data(property_id, data_date);
CREATE INDEX market_data_market_idx        ON market_data(market);

-- ==========================================================
-- COMMUNITY INSIGHTS
-- ==========================================================
CREATE TABLE community_insights (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    UUID         REFERENCES properties(id) ON DELETE CASCADE,
  insight_type   TEXT         NOT NULL,
  title          TEXT         NOT NULL,
  body           TEXT,
  impact         TEXT         CHECK (impact IN ('positive', 'negative', 'neutral')),
  source         TEXT,
  source_url     TEXT,
  effective_date DATE,
  expires_at     DATE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX community_insights_property_id_idx ON community_insights(property_id);

CREATE TRIGGER set_community_insights_updated_at
  BEFORE UPDATE ON community_insights
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- RECOMMENDATIONS
-- ==========================================================
CREATE TABLE recommendations (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID         REFERENCES properties(id) ON DELETE CASCADE,
  category      TEXT         NOT NULL,
  priority      TEXT         NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  title         TEXT         NOT NULL,
  body          TEXT,
  action_url    TEXT,
  is_dismissed  BOOLEAN      NOT NULL DEFAULT false,
  dismissed_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  metadata      JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX recommendations_property_id_idx  ON recommendations(property_id);
CREATE INDEX recommendations_is_dismissed_idx ON recommendations(is_dismissed);

CREATE TRIGGER set_recommendations_updated_at
  BEFORE UPDATE ON recommendations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- ALERT SETTINGS
-- ==========================================================
CREATE TABLE alert_settings (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID         REFERENCES properties(id) ON DELETE CASCADE,
  profile_id   UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_type   TEXT         NOT NULL,
  is_enabled   BOOLEAN      NOT NULL DEFAULT true,
  threshold    NUMERIC,
  channels     JSONB        NOT NULL DEFAULT '["email"]',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (property_id, profile_id, alert_type)
);

CREATE INDEX alert_settings_profile_id_idx ON alert_settings(profile_id);

CREATE TRIGGER set_alert_settings_updated_at
  BEFORE UPDATE ON alert_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- ALERT HISTORY
-- ==========================================================
CREATE TABLE alert_history (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_setting_id  UUID         REFERENCES alert_settings(id) ON DELETE SET NULL,
  property_id       UUID         REFERENCES properties(id) ON DELETE CASCADE,
  profile_id        UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_type        TEXT         NOT NULL,
  title             TEXT         NOT NULL,
  body              TEXT,
  channels          TEXT[]       NOT NULL DEFAULT '{}',
  is_read           BOOLEAN      NOT NULL DEFAULT false,
  read_at           TIMESTAMPTZ,
  metadata          JSONB,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX alert_history_profile_id_idx  ON alert_history(profile_id);
CREATE INDEX alert_history_is_read_idx     ON alert_history(is_read);
CREATE INDEX alert_history_created_at_idx  ON alert_history(created_at DESC);

-- ==========================================================
-- SYNC LOG
-- ==========================================================
CREATE TABLE sync_log (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID         REFERENCES properties(id) ON DELETE CASCADE,
  sync_type       TEXT         NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'success', 'error')),
  records_synced  INTEGER,
  records_failed  INTEGER,
  error_message   TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  metadata        JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX sync_log_property_id_idx  ON sync_log(property_id);
CREATE INDEX sync_log_status_idx       ON sync_log(status);
CREATE INDEX sync_log_created_at_idx   ON sync_log(created_at DESC);

-- ==========================================================
-- APP SETTINGS
-- ==========================================================
CREATE TABLE app_settings (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT         NOT NULL UNIQUE,
  value        JSONB,
  description  TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- CLEANING RECORDS
-- ==========================================================
CREATE TABLE cleaning_records (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  booking_id            UUID         REFERENCES bookings(id) ON DELETE SET NULL,
  assigned_to           UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  scheduled_date        DATE         NOT NULL,
  scheduled_start_time  TIME,
  status                TEXT         NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN ('scheduled', 'in_progress', 'completed', 'skipped', 'cancelled')),
  completed_at          TIMESTAMPTZ,
  duration_minutes      INTEGER,
  notes                 TEXT,
  checklist             JSONB,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX cleaning_records_property_id_idx    ON cleaning_records(property_id);
CREATE INDEX cleaning_records_assigned_to_idx    ON cleaning_records(assigned_to);
CREATE INDEX cleaning_records_scheduled_date_idx ON cleaning_records(scheduled_date);
CREATE INDEX cleaning_records_status_idx         ON cleaning_records(status);

CREATE TRIGGER set_cleaning_records_updated_at
  BEFORE UPDATE ON cleaning_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- MAINTENANCE ISSUES
-- ==========================================================
CREATE TABLE maintenance_issues (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  reported_by     UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to     UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  title           TEXT         NOT NULL,
  description     TEXT,
  category        TEXT,
  priority        TEXT         NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status          TEXT         NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'wont_fix')),
  estimated_cost  NUMERIC(10,2),
  actual_cost     NUMERIC(10,2),
  vendor_name     TEXT,
  vendor_contact  TEXT,
  images          TEXT[],
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX maintenance_issues_property_id_idx ON maintenance_issues(property_id);
CREATE INDEX maintenance_issues_status_idx      ON maintenance_issues(status);
CREATE INDEX maintenance_issues_priority_idx    ON maintenance_issues(priority);

CREATE TRIGGER set_maintenance_issues_updated_at
  BEFORE UPDATE ON maintenance_issues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- PROPERTY OPERATIONAL INFO
-- ==========================================================
CREATE TABLE property_operational_info (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id             UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE UNIQUE,
  door_code               TEXT,
  wifi_name               TEXT,
  wifi_password           TEXT,
  parking_instructions    TEXT,
  check_in_time           TIME         NOT NULL DEFAULT '16:00',
  check_out_time          TIME         NOT NULL DEFAULT '11:00',
  check_in_instructions   TEXT,
  check_out_instructions  TEXT,
  trash_day               TEXT,
  recycle_day             TEXT,
  emergency_contact       TEXT,
  property_manager        TEXT,
  house_manual_url        TEXT,
  notes                   TEXT,
  extra                   JSONB,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER set_property_operational_info_updated_at
  BEFORE UPDATE ON property_operational_info
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================
-- ROW LEVEL SECURITY
-- ==========================================================

ALTER TABLE profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupancy_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data              ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_insights       ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_issues       ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_operational_info ENABLE ROW LEVEL SECURITY;

-- Helper: returns true if the current user has role = 'admin'
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------- profiles ----------
CREATE POLICY "profiles: own read"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles: own update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ---------- properties ----------
-- All authenticated users can read; only admins can write
CREATE POLICY "properties: auth read"   ON properties FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "properties: admin insert" ON properties FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "properties: admin update" ON properties FOR UPDATE USING (is_admin());
CREATE POLICY "properties: admin delete" ON properties FOR DELETE USING (is_admin());

-- ---------- bookings ----------
CREATE POLICY "bookings: auth read"    ON bookings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "bookings: admin insert" ON bookings FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "bookings: admin update" ON bookings FOR UPDATE USING (is_admin());
CREATE POLICY "bookings: admin delete" ON bookings FOR DELETE USING (is_admin());

-- ---------- pricing ----------
CREATE POLICY "pricing: auth read"    ON pricing FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "pricing: admin insert" ON pricing FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "pricing: admin update" ON pricing FOR UPDATE USING (is_admin());
CREATE POLICY "pricing: admin delete" ON pricing FOR DELETE USING (is_admin());

-- ---------- occupancy_snapshots ----------
CREATE POLICY "occupancy_snapshots: auth read"    ON occupancy_snapshots FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "occupancy_snapshots: admin insert" ON occupancy_snapshots FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "occupancy_snapshots: admin update" ON occupancy_snapshots FOR UPDATE USING (is_admin());

-- ---------- reviews ----------
CREATE POLICY "reviews: auth read"    ON reviews FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "reviews: admin insert" ON reviews FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "reviews: admin update" ON reviews FOR UPDATE USING (is_admin());
CREATE POLICY "reviews: admin delete" ON reviews FOR DELETE USING (is_admin());

-- ---------- market_data ----------
CREATE POLICY "market_data: auth read"    ON market_data FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "market_data: admin insert" ON market_data FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "market_data: admin update" ON market_data FOR UPDATE USING (is_admin());

-- ---------- community_insights ----------
CREATE POLICY "community_insights: auth read"    ON community_insights FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "community_insights: admin insert" ON community_insights FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "community_insights: admin update" ON community_insights FOR UPDATE USING (is_admin());
CREATE POLICY "community_insights: admin delete" ON community_insights FOR DELETE USING (is_admin());

-- ---------- recommendations ----------
CREATE POLICY "recommendations: auth read"    ON recommendations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "recommendations: admin insert" ON recommendations FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "recommendations: admin update" ON recommendations FOR UPDATE USING (is_admin());

-- ---------- alert_settings ----------
-- Each user manages only their own alert settings
CREATE POLICY "alert_settings: own read"   ON alert_settings FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "alert_settings: own insert" ON alert_settings FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "alert_settings: own update" ON alert_settings FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "alert_settings: own delete" ON alert_settings FOR DELETE USING (auth.uid() = profile_id);

-- ---------- alert_history ----------
CREATE POLICY "alert_history: own read"   ON alert_history FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "alert_history: own update" ON alert_history FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "alert_history: admin insert" ON alert_history FOR INSERT WITH CHECK (is_admin());

-- ---------- sync_log ----------
CREATE POLICY "sync_log: admin read"   ON sync_log FOR SELECT USING (is_admin());
CREATE POLICY "sync_log: admin insert" ON sync_log FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "sync_log: admin update" ON sync_log FOR UPDATE USING (is_admin());

-- ---------- app_settings ----------
CREATE POLICY "app_settings: auth read"    ON app_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "app_settings: admin insert" ON app_settings FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "app_settings: admin update" ON app_settings FOR UPDATE USING (is_admin());

-- ---------- cleaning_records ----------
-- Cleaners see and update their own assignments; admins have full access
CREATE POLICY "cleaning_records: read"   ON cleaning_records FOR SELECT USING (is_admin() OR auth.uid() = assigned_to);
CREATE POLICY "cleaning_records: admin insert" ON cleaning_records FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "cleaning_records: write"  ON cleaning_records FOR UPDATE USING (is_admin() OR auth.uid() = assigned_to);
CREATE POLICY "cleaning_records: admin delete" ON cleaning_records FOR DELETE USING (is_admin());

-- ---------- maintenance_issues ----------
-- Any authenticated user can report; admins can update/delete anything; reporter can update their own
CREATE POLICY "maintenance_issues: auth read"    ON maintenance_issues FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "maintenance_issues: auth insert"  ON maintenance_issues FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "maintenance_issues: write"        ON maintenance_issues FOR UPDATE USING (is_admin() OR auth.uid() = reported_by);
CREATE POLICY "maintenance_issues: admin delete" ON maintenance_issues FOR DELETE USING (is_admin());

-- ---------- property_operational_info ----------
-- Sensitive: admin-only
CREATE POLICY "property_operational_info: admin read"   ON property_operational_info FOR SELECT USING (is_admin());
CREATE POLICY "property_operational_info: admin insert" ON property_operational_info FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "property_operational_info: admin update" ON property_operational_info FOR UPDATE USING (is_admin());
CREATE POLICY "property_operational_info: admin delete" ON property_operational_info FOR DELETE USING (is_admin());
