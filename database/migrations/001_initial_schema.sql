CREATE TABLE accounts (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  login_name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(login_name) BETWEEN 1 AND 254 AND login_name = trim(login_name)),
  password_hash TEXT NOT NULL
    CHECK (length(password_hash) > 0),
  state TEXT NOT NULL
    CHECK (state IN ('active', 'disabled')),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0)
) STRICT;

CREATE TABLE folders (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL
    CHECK (length(name) BETWEEN 1 AND 255 AND name = trim(name) AND instr(name, char(0)) = 0),
  state TEXT NOT NULL
    CHECK (state IN ('active', 'deleted')),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0),
  deleted_at TEXT,
  UNIQUE (id, owner_id),
  FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_id, owner_id) REFERENCES folders(id, owner_id) ON DELETE RESTRICT,
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (
    (state = 'active' AND deleted_at IS NULL)
    OR (state = 'deleted' AND deleted_at IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX folders_unique_active_root_name
  ON folders(owner_id, name COLLATE NOCASE)
  WHERE parent_id IS NULL AND state = 'active';

CREATE UNIQUE INDEX folders_unique_active_child_name
  ON folders(owner_id, parent_id, name COLLATE NOCASE)
  WHERE parent_id IS NOT NULL AND state = 'active';

CREATE INDEX folders_owner_parent_index
  ON folders(owner_id, parent_id);

CREATE TRIGGER folders_prevent_cycles
BEFORE UPDATE OF parent_id ON folders
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    WITH RECURSIVE ancestors(id) AS (
      SELECT NEW.parent_id
      UNION ALL
      SELECT folders.parent_id
      FROM folders
      JOIN ancestors ON folders.id = ancestors.id
      WHERE folders.parent_id IS NOT NULL
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN RAISE(ABORT, 'folder hierarchy cycle') END;
END;

CREATE TABLE files (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_id TEXT NOT NULL,
  folder_id TEXT,
  display_name TEXT NOT NULL
    CHECK (length(display_name) BETWEEN 1 AND 255 AND display_name = trim(display_name) AND instr(display_name, char(0)) = 0),
  storage_provider TEXT NOT NULL
    CHECK (length(storage_provider) BETWEEN 1 AND 64 AND storage_provider = trim(storage_provider)),
  object_key TEXT NOT NULL
    CHECK (length(object_key) BETWEEN 1 AND 1024 AND object_key = trim(object_key)),
  media_type TEXT
    CHECK (media_type IS NULL OR (length(media_type) BETWEEN 1 AND 255 AND media_type = trim(media_type))),
  size_bytes INTEGER
    CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum_algorithm TEXT
    CHECK (checksum_algorithm IS NULL OR (length(checksum_algorithm) BETWEEN 1 AND 32 AND checksum_algorithm = trim(checksum_algorithm))),
  checksum TEXT
    CHECK (checksum IS NULL OR (length(checksum) BETWEEN 1 AND 256 AND checksum = trim(checksum))),
  state TEXT NOT NULL
    CHECK (state IN ('pending_upload', 'active', 'deleted', 'purged')),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0),
  activated_at TEXT,
  deleted_at TEXT,
  purged_at TEXT,
  UNIQUE (id, owner_id),
  UNIQUE (storage_provider, object_key),
  FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (folder_id, owner_id) REFERENCES folders(id, owner_id) ON DELETE RESTRICT,
  CHECK (
    (checksum_algorithm IS NULL AND checksum IS NULL)
    OR (checksum_algorithm IS NOT NULL AND checksum IS NOT NULL)
  ),
  CHECK (
    (state = 'pending_upload' AND activated_at IS NULL AND deleted_at IS NULL AND purged_at IS NULL)
    OR (
      state = 'active'
      AND activated_at IS NOT NULL
      AND deleted_at IS NULL
      AND purged_at IS NULL
      AND size_bytes IS NOT NULL
      AND checksum_algorithm IS NOT NULL
      AND checksum IS NOT NULL
    )
    OR (
      state = 'deleted'
      AND activated_at IS NOT NULL
      AND deleted_at IS NOT NULL
      AND purged_at IS NULL
      AND size_bytes IS NOT NULL
      AND checksum_algorithm IS NOT NULL
      AND checksum IS NOT NULL
    )
    OR (
      state = 'purged'
      AND activated_at IS NOT NULL
      AND deleted_at IS NOT NULL
      AND purged_at IS NOT NULL
      AND size_bytes IS NOT NULL
      AND checksum_algorithm IS NOT NULL
      AND checksum IS NOT NULL
    )
  )
) STRICT;

CREATE UNIQUE INDEX files_unique_available_root_name
  ON files(owner_id, display_name COLLATE NOCASE)
  WHERE folder_id IS NULL AND state IN ('pending_upload', 'active');

CREATE UNIQUE INDEX files_unique_available_folder_name
  ON files(owner_id, folder_id, display_name COLLATE NOCASE)
  WHERE folder_id IS NOT NULL AND state IN ('pending_upload', 'active');

CREATE INDEX files_owner_folder_state_index
  ON files(owner_id, folder_id, state);
