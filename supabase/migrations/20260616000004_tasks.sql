-- ── tasks ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id              UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  recommendation_id        UUID        REFERENCES recommendations(id) ON DELETE SET NULL,
  title                    TEXT        NOT NULL,
  description              TEXT,
  priority                 TEXT        NOT NULL DEFAULT 'medium'
                             CHECK (priority IN ('low','medium','high','critical')),
  status                   TEXT        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','in_progress','completed')),
  estimated_revenue_impact NUMERIC(10,2),
  due_date                 DATE,
  created_by               UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tasks_property_id_idx ON tasks(property_id);
CREATE INDEX tasks_status_idx      ON tasks(status);

CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read tasks"
  ON tasks FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin and cleaner can write tasks"
  ON tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','cleaner')
    )
  );
