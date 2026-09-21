-- Optional authored research state. Shared corpus access never shares overlays.
CREATE TABLE personal_reading_states (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  status TEXT CHECK (status IN ('queued', 'reading', 'finished')),
  important INTEGER NOT NULL CHECK (important IN (0, 1)),
  to_cite INTEGER NOT NULL CHECK (to_cite IN (0, 1)),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, file_id)
) STRICT;

CREATE TABLE personal_collections (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (account_id, id)
) STRICT;
CREATE INDEX personal_collections_account ON personal_collections(account_id, created_at DESC, id DESC);

CREATE TABLE personal_collection_items (
  account_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, collection_id, file_id),
  FOREIGN KEY (account_id, collection_id) REFERENCES personal_collections(account_id, id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX personal_collection_items_resource ON personal_collection_items(account_id, file_id, collection_id);

CREATE TABLE personal_page_notes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  file_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  physical_page INTEGER NOT NULL CHECK (physical_page BETWEEN 1 AND 1000000),
  locator TEXT CHECK (length(locator) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (file_id, source_id) REFERENCES document_sources(file_id, id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX personal_page_notes_account_page ON personal_page_notes(account_id, created_at DESC, id DESC);
CREATE INDEX personal_page_notes_resource_page ON personal_page_notes(account_id, file_id, created_at DESC, id DESC);

CREATE TRIGGER personal_reading_identity BEFORE UPDATE OF account_id, file_id ON personal_reading_states
WHEN NEW.account_id != OLD.account_id OR NEW.file_id != OLD.file_id
BEGIN SELECT RAISE(ABORT, 'personal reading identity is immutable'); END;
CREATE TRIGGER personal_collection_identity BEFORE UPDATE OF id, account_id ON personal_collections
WHEN NEW.id != OLD.id OR NEW.account_id != OLD.account_id
BEGIN SELECT RAISE(ABORT, 'personal collection identity is immutable'); END;
CREATE TRIGGER personal_note_attachment BEFORE UPDATE OF id, account_id, file_id, source_id, physical_page, created_at ON personal_page_notes
WHEN NEW.id != OLD.id OR NEW.account_id != OLD.account_id OR NEW.file_id != OLD.file_id
  OR NEW.source_id != OLD.source_id OR NEW.physical_page != OLD.physical_page OR NEW.created_at != OLD.created_at
BEGIN SELECT RAISE(ABORT, 'personal note attachment is immutable'); END;
CREATE TRIGGER personal_notes_retain BEFORE DELETE ON personal_page_notes
BEGIN SELECT RAISE(ABORT, 'personal notes require recoverable deletion'); END;
CREATE TRIGGER personal_collections_retain BEFORE DELETE ON personal_collections
BEGIN SELECT RAISE(ABORT, 'personal collections require recoverable archival'); END;
