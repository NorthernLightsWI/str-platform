-- ==========================================================
-- Part 1: Add properties.is_hidden and visible_* views
-- ==========================================================

-- ── 1. New column ──────────────────────────────────────────
ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Backfill from app_settings ─────────────────────────
-- app_settings.value may be:
--   JSONB array:  ["uuid1","uuid2"]          → jsonb_typeof = 'array'
--   JSONB string: "[\"uuid1\",\"uuid2\"]"    → jsonb_typeof = 'string'
--     (produced when JS JSON.stringify result is stored as JSONB string)
--     #>> '{}' extracts the text content, then we cast back to jsonb.
-- Using pure SQL (no PL/pgSQL) to avoid SRF-in-subquery edge cases.
UPDATE properties p
SET is_hidden = true
WHERE p.id::text IN (
  SELECT jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(s.value) = 'array'  THEN s.value
      WHEN jsonb_typeof(s.value) = 'string' THEN (s.value #>> '{}')::jsonb
      ELSE '[]'::jsonb
    END
  )
  FROM app_settings s
  WHERE s.key = 'hidden_properties'
);

-- ── 3. visible_properties ──────────────────────────────────
CREATE OR REPLACE VIEW visible_properties
  WITH (security_invoker = true)
AS
  SELECT * FROM properties WHERE NOT is_hidden;

-- ── 4. visible_* views for every property-scoped table ────
--
-- All use security_invoker=true so the caller's RLS context is preserved.
-- Tables with NOT NULL property_id use INNER JOIN; nullable ones use LEFT JOIN
-- so non-property-scoped rows still appear.

CREATE OR REPLACE VIEW visible_bookings
  WITH (security_invoker = true)
AS
  SELECT b.* FROM bookings b
  JOIN properties p ON p.id = b.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_pricing
  WITH (security_invoker = true)
AS
  SELECT pr.* FROM pricing pr
  JOIN properties p ON p.id = pr.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_occupancy_snapshots
  WITH (security_invoker = true)
AS
  SELECT os.* FROM occupancy_snapshots os
  JOIN properties p ON p.id = os.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_reviews
  WITH (security_invoker = true)
AS
  SELECT r.* FROM reviews r
  JOIN properties p ON p.id = r.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_cleaning_records
  WITH (security_invoker = true)
AS
  SELECT cr.* FROM cleaning_records cr
  JOIN properties p ON p.id = cr.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_maintenance_issues
  WITH (security_invoker = true)
AS
  SELECT mi.* FROM maintenance_issues mi
  JOIN properties p ON p.id = mi.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_property_operational_info
  WITH (security_invoker = true)
AS
  SELECT poi.* FROM property_operational_info poi
  JOIN properties p ON p.id = poi.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_vendor_contacts
  WITH (security_invoker = true)
AS
  SELECT vc.* FROM vendor_contacts vc
  JOIN properties p ON p.id = vc.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_property_info_changelog
  WITH (security_invoker = true)
AS
  SELECT pic.* FROM property_info_changelog pic
  JOIN properties p ON p.id = pic.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_recurring_maintenance
  WITH (security_invoker = true)
AS
  SELECT rm.* FROM recurring_maintenance rm
  JOIN properties p ON p.id = rm.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_tasks
  WITH (security_invoker = true)
AS
  SELECT t.* FROM tasks t
  JOIN properties p ON p.id = t.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_property_amenities
  WITH (security_invoker = true)
AS
  SELECT pa.* FROM property_amenities pa
  JOIN properties p ON p.id = pa.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_listing_changes
  WITH (security_invoker = true)
AS
  SELECT lc.* FROM listing_changes lc
  JOIN properties p ON p.id = lc.property_id
  WHERE NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_proposed_changes
  WITH (security_invoker = true)
AS
  SELECT pc.* FROM proposed_changes pc
  JOIN properties p ON p.id = pc.property_id
  WHERE NOT p.is_hidden;

-- Nullable property_id tables: NULL rows are always visible
CREATE OR REPLACE VIEW visible_market_data
  WITH (security_invoker = true)
AS
  SELECT m.* FROM market_data m
  LEFT JOIN properties p ON p.id = m.property_id
  WHERE m.property_id IS NULL OR NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_community_insights
  WITH (security_invoker = true)
AS
  SELECT ci.* FROM community_insights ci
  LEFT JOIN properties p ON p.id = ci.property_id
  WHERE ci.property_id IS NULL OR NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_recommendations
  WITH (security_invoker = true)
AS
  SELECT r.* FROM recommendations r
  LEFT JOIN properties p ON p.id = r.property_id
  WHERE r.property_id IS NULL OR NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_alert_settings
  WITH (security_invoker = true)
AS
  SELECT a.* FROM alert_settings a
  LEFT JOIN properties p ON p.id = a.property_id
  WHERE a.property_id IS NULL OR NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_alert_history
  WITH (security_invoker = true)
AS
  SELECT ah.* FROM alert_history ah
  LEFT JOIN properties p ON p.id = ah.property_id
  WHERE ah.property_id IS NULL OR NOT p.is_hidden;

CREATE OR REPLACE VIEW visible_sync_log
  WITH (security_invoker = true)
AS
  SELECT sl.* FROM sync_log sl
  LEFT JOIN properties p ON p.id = sl.property_id
  WHERE sl.property_id IS NULL OR NOT p.is_hidden;
