-- Property groups: parent/child for multi-listing units
-- e.g. "309 Morrison Unit 1 - Weekly" and "309 Morrison Unit 1 - Monthly"
-- share the same physical space and are grouped under a single parent property.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS parent_property_id uuid
    REFERENCES properties(id) ON DELETE SET NULL;

-- Prevent a property from being its own parent
ALTER TABLE properties
  ADD CONSTRAINT properties_no_self_parent
    CHECK (parent_property_id IS DISTINCT FROM id);

CREATE INDEX IF NOT EXISTS properties_parent_property_id_idx
  ON properties(parent_property_id);
