-- Add listing audit fields to properties
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS photo_count INTEGER;
