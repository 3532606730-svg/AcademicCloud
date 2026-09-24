-- Browser rendering remains outside Core. Only source-bound private overlays persist.
CREATE TABLE personal_reader_progress (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  file_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  physical_page INTEGER NOT NULL CHECK (physical_page BETWEEN 1 AND 1000000),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, file_id, source_id),
  FOREIGN KEY (file_id, source_id) REFERENCES document_sources(file_id, id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX personal_reader_recent ON personal_reader_progress(account_id, updated_at DESC, source_id DESC);

CREATE TABLE personal_text_highlights (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  file_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  physical_page INTEGER NOT NULL CHECK (physical_page BETWEEN 1 AND 1000000),
  selected_text TEXT NOT NULL CHECK (length(selected_text) BETWEEN 1 AND 10000),
  rectangles TEXT NOT NULL CHECK (json_valid(rectangles) AND json_type(rectangles) = 'array' AND json_array_length(rectangles) BETWEEN 1 AND 100),
  color TEXT NOT NULL CHECK (color IN ('yellow', 'green', 'blue', 'pink')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (file_id, source_id) REFERENCES document_sources(file_id, id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX personal_text_highlights_page ON personal_text_highlights(account_id, file_id, source_id, id DESC);
CREATE INDEX personal_text_highlights_export ON personal_text_highlights(account_id, id DESC);

CREATE TRIGGER personal_reader_progress_identity BEFORE UPDATE OF account_id, file_id, source_id ON personal_reader_progress
WHEN NEW.account_id != OLD.account_id OR NEW.file_id != OLD.file_id OR NEW.source_id != OLD.source_id
BEGIN SELECT RAISE(ABORT, 'personal reader progress identity is immutable'); END;
CREATE TRIGGER personal_text_highlight_attachment BEFORE UPDATE OF id, account_id, file_id, source_id, physical_page, selected_text, rectangles, created_at ON personal_text_highlights
WHEN NEW.id != OLD.id OR NEW.account_id != OLD.account_id OR NEW.file_id != OLD.file_id
  OR NEW.source_id != OLD.source_id OR NEW.physical_page != OLD.physical_page OR NEW.created_at != OLD.created_at
  OR NEW.selected_text != OLD.selected_text OR NEW.rectangles != OLD.rectangles
BEGIN SELECT RAISE(ABORT, 'personal highlight attachment is immutable'); END;
CREATE TRIGGER personal_text_highlights_retain BEFORE DELETE ON personal_text_highlights
BEGIN SELECT RAISE(ABORT, 'personal highlights require recoverable deletion'); END;
