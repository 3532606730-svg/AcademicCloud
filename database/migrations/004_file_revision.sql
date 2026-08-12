ALTER TABLE files
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0
  CHECK (revision >= 0);

CREATE INDEX files_state_updated_index
  ON files(state, updated_at, id);
