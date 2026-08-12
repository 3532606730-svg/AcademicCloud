CREATE TABLE files_next (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_id TEXT NOT NULL,
  folder_id TEXT,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 255 AND display_name = trim(display_name) AND instr(display_name, char(0)) = 0),
  storage_provider TEXT NOT NULL CHECK (length(storage_provider) BETWEEN 1 AND 64 AND storage_provider = trim(storage_provider)),
  object_key TEXT NOT NULL CHECK (length(object_key) BETWEEN 1 AND 1024 AND object_key = trim(object_key)),
  media_type TEXT CHECK (media_type IS NULL OR (length(media_type) BETWEEN 1 AND 255 AND media_type = trim(media_type))),
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum_algorithm TEXT CHECK (checksum_algorithm IS NULL OR (length(checksum_algorithm) BETWEEN 1 AND 32 AND checksum_algorithm = trim(checksum_algorithm))),
  checksum TEXT CHECK (checksum IS NULL OR (length(checksum) BETWEEN 1 AND 256 AND checksum = trim(checksum))),
  state TEXT NOT NULL CHECK (state IN ('pending_upload', 'active', 'deleted', 'purging', 'purged')),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  activated_at TEXT,
  deleted_at TEXT,
  purged_at TEXT,
  UNIQUE (id, owner_id),
  UNIQUE (storage_provider, object_key),
  FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (folder_id, owner_id) REFERENCES folders(id, owner_id) ON DELETE RESTRICT,
  CHECK ((checksum_algorithm IS NULL AND checksum IS NULL) OR (checksum_algorithm IS NOT NULL AND checksum IS NOT NULL)),
  CHECK (
    (state = 'pending_upload' AND activated_at IS NULL AND deleted_at IS NULL AND purged_at IS NULL)
    OR (state = 'active' AND activated_at IS NOT NULL AND deleted_at IS NULL AND purged_at IS NULL AND size_bytes IS NOT NULL AND checksum_algorithm IS NOT NULL AND checksum IS NOT NULL)
    OR (state IN ('deleted', 'purging') AND activated_at IS NOT NULL AND deleted_at IS NOT NULL AND purged_at IS NULL AND size_bytes IS NOT NULL AND checksum_algorithm IS NOT NULL AND checksum IS NOT NULL)
    OR (state = 'purged' AND activated_at IS NOT NULL AND deleted_at IS NOT NULL AND purged_at IS NOT NULL AND size_bytes IS NOT NULL AND checksum_algorithm IS NOT NULL AND checksum IS NOT NULL)
  )
) STRICT;

INSERT INTO files_next SELECT * FROM files;
DROP TABLE files;
ALTER TABLE files_next RENAME TO files;

CREATE UNIQUE INDEX files_unique_available_root_name
  ON files(owner_id, display_name COLLATE NOCASE)
  WHERE folder_id IS NULL AND state IN ('pending_upload', 'active');

CREATE UNIQUE INDEX files_unique_available_folder_name
  ON files(owner_id, folder_id, display_name COLLATE NOCASE)
  WHERE folder_id IS NOT NULL AND state IN ('pending_upload', 'active');

CREATE INDEX files_owner_folder_state_index ON files(owner_id, folder_id, state);
