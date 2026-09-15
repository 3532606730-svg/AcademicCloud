-- Recorded byte generations are independent from mutable file/Catalog CAS
-- revisions. No object is read, rewritten or freshly checksummed here.
CREATE TABLE document_sources (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  file_id TEXT NOT NULL,
  storage_provider TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  checksum_algorithm TEXT NOT NULL,
  checksum TEXT NOT NULL,
  recorded_at TEXT NOT NULL CHECK (length(recorded_at) > 0),
  UNIQUE (file_id, id),
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE document_current_sources (
  file_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
  FOREIGN KEY (file_id, source_id) REFERENCES document_sources(file_id, id) ON DELETE RESTRICT
) STRICT;

INSERT INTO document_sources (
  id, file_id, storage_provider, object_key, size_bytes, checksum_algorithm, checksum, recorded_at
)
SELECT 'src_' || lower(hex(randomblob(16))), id, storage_provider, object_key,
  size_bytes, checksum_algorithm, checksum, updated_at
FROM files WHERE activated_at IS NOT NULL;

INSERT INTO document_current_sources (file_id, source_id)
SELECT file_id, id FROM document_sources;

CREATE TRIGGER document_sources_no_update BEFORE UPDATE ON document_sources
BEGIN SELECT RAISE(ABORT, 'document source is immutable'); END;

CREATE TRIGGER document_sources_no_delete BEFORE DELETE ON document_sources
BEGIN SELECT RAISE(ABORT, 'document source is immutable'); END;

CREATE TRIGGER document_current_sources_match_insert
BEFORE INSERT ON document_current_sources
WHEN NOT EXISTS (
  SELECT 1 FROM document_sources s JOIN files f ON f.id = s.file_id
  WHERE s.id = NEW.source_id AND s.file_id = NEW.file_id AND f.activated_at IS NOT NULL
    AND s.storage_provider = f.storage_provider AND s.object_key = f.object_key
    AND s.size_bytes = f.size_bytes AND s.checksum_algorithm = f.checksum_algorithm AND s.checksum = f.checksum
)
BEGIN SELECT RAISE(ABORT, 'document source does not match file'); END;

CREATE TRIGGER document_current_sources_match_update
BEFORE UPDATE ON document_current_sources
WHEN NEW.file_id != OLD.file_id OR NOT EXISTS (
  SELECT 1 FROM document_sources s JOIN files f ON f.id = s.file_id
  WHERE s.id = NEW.source_id AND s.file_id = NEW.file_id AND f.activated_at IS NOT NULL
    AND s.storage_provider = f.storage_provider AND s.object_key = f.object_key
    AND s.size_bytes = f.size_bytes AND s.checksum_algorithm = f.checksum_algorithm AND s.checksum = f.checksum
)
BEGIN SELECT RAISE(ABORT, 'document source does not match file'); END;

CREATE TRIGGER document_current_sources_no_delete BEFORE DELETE ON document_current_sources
BEGIN SELECT RAISE(ABORT, 'current document source cannot be removed'); END;

-- Capture also covers compatible older applications and authorized maintenance.
CREATE TRIGGER files_capture_inserted_document_source
AFTER INSERT ON files WHEN NEW.activated_at IS NOT NULL
BEGIN
  INSERT INTO document_sources (id, file_id, storage_provider, object_key, size_bytes, checksum_algorithm, checksum, recorded_at)
  VALUES ('src_' || lower(hex(randomblob(16))), NEW.id, NEW.storage_provider, NEW.object_key,
    NEW.size_bytes, NEW.checksum_algorithm, NEW.checksum, NEW.updated_at);
  INSERT INTO document_current_sources (file_id, source_id)
  SELECT NEW.id, id FROM document_sources WHERE rowid = last_insert_rowid();
END;

CREATE TRIGGER files_capture_changed_document_source
AFTER UPDATE OF activated_at, storage_provider, object_key, size_bytes, checksum_algorithm, checksum ON files
WHEN NEW.activated_at IS NOT NULL AND (
  OLD.activated_at IS NULL OR OLD.storage_provider IS NOT NEW.storage_provider
  OR OLD.object_key IS NOT NEW.object_key OR OLD.size_bytes IS NOT NEW.size_bytes
  OR OLD.checksum_algorithm IS NOT NEW.checksum_algorithm OR OLD.checksum IS NOT NEW.checksum
)
BEGIN
  INSERT INTO document_sources (id, file_id, storage_provider, object_key, size_bytes, checksum_algorithm, checksum, recorded_at)
  VALUES ('src_' || lower(hex(randomblob(16))), NEW.id, NEW.storage_provider, NEW.object_key,
    NEW.size_bytes, NEW.checksum_algorithm, NEW.checksum, NEW.updated_at);
  INSERT INTO document_current_sources (file_id, source_id)
  SELECT NEW.id, id FROM document_sources WHERE rowid = last_insert_rowid()
  ON CONFLICT(file_id) DO UPDATE SET source_id = excluded.source_id;
END;
