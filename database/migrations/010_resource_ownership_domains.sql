-- Resource authority belongs to one concrete ownership-domain parent. Current
-- account-private APIs resolve their account domain server-side; the `library`
-- kind is reserved so later Library resources do not need contributor-owned
-- stand-ins or a polymorphic owner foreign key.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE ownership_domains (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 256 AND id = trim(id)),
  kind TEXT NOT NULL
    CHECK (kind IN ('account', 'library')),
  account_id TEXT UNIQUE,
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK (
    (kind = 'account' AND account_id IS NOT NULL AND id = 'account:' || account_id)
    OR (kind = 'library' AND account_id IS NULL)
  )
) STRICT;

INSERT INTO ownership_domains (id, kind, account_id, created_at)
SELECT 'account:' || id, 'account', id, created_at
FROM accounts;

CREATE TRIGGER accounts_create_ownership_domain
AFTER INSERT ON accounts
BEGIN
  INSERT INTO ownership_domains (id, kind, account_id, created_at)
  VALUES ('account:' || NEW.id, 'account', NEW.id, NEW.created_at);
END;

CREATE TRIGGER ownership_domains_identity_immutable
BEFORE UPDATE OF id, kind, account_id ON ownership_domains
BEGIN
  SELECT RAISE(ABORT, 'ownership domain identity is immutable');
END;

CREATE TRIGGER ownership_domains_no_delete
BEFORE DELETE ON ownership_domains
BEGIN
  SELECT RAISE(ABORT, 'ownership domains cannot be deleted');
END;

-- Favorites are Personal Research Overlay relations. Preserve them outside the
-- table rebuild so dropping the legacy resource tables cannot cascade them.
CREATE TABLE favorite_files_preserved (
  account_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, file_id)
) STRICT;

CREATE TABLE favorite_folders_preserved (
  account_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, folder_id)
) STRICT;

INSERT INTO favorite_files_preserved SELECT account_id, file_id, created_at FROM favorite_files;
INSERT INTO favorite_folders_preserved SELECT account_id, folder_id, created_at FROM favorite_folders;

DROP TRIGGER favorite_files_purge_cleanup;
DROP TABLE favorite_files;
DROP TABLE favorite_folders;

ALTER TABLE files RENAME TO files_legacy;
ALTER TABLE folders RENAME TO folders_legacy;
ALTER TABLE recycle_groups RENAME TO recycle_groups_legacy;

CREATE TABLE recycle_groups (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 512 AND id = trim(id)),
  owner_domain_id TEXT NOT NULL,
  created_by_account_id TEXT NOT NULL,
  root_kind TEXT NOT NULL
    CHECK (root_kind IN ('folder', 'file')),
  root_id TEXT NOT NULL
    CHECK (length(root_id) BETWEEN 1 AND 128 AND root_id = trim(root_id)),
  folder_count INTEGER NOT NULL
    CHECK (folder_count >= 0),
  file_count INTEGER NOT NULL
    CHECK (file_count >= 0),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  UNIQUE (id, owner_domain_id),
  UNIQUE (owner_domain_id, root_kind, root_id),
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK (
    (root_kind = 'folder' AND folder_count >= 1)
    OR (root_kind = 'file' AND folder_count = 0 AND file_count = 1)
  )
) STRICT;

INSERT INTO recycle_groups (
  id, owner_domain_id, created_by_account_id, root_kind, root_id,
  folder_count, file_count, created_at
)
SELECT
  id, 'account:' || owner_id, owner_id, root_kind, root_id,
  folder_count, file_count, created_at
FROM recycle_groups_legacy;

CREATE TABLE folders (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_domain_id TEXT NOT NULL,
  created_by_account_id TEXT NOT NULL,
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
  recycle_group_id TEXT,
  UNIQUE (id, owner_domain_id),
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_id, owner_domain_id) REFERENCES folders(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (recycle_group_id, owner_domain_id)
    REFERENCES recycle_groups(id, owner_domain_id) ON DELETE RESTRICT,
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (
    (state = 'active' AND deleted_at IS NULL)
    OR (state = 'deleted' AND deleted_at IS NOT NULL)
  )
) STRICT;

INSERT INTO folders (
  id, owner_domain_id, created_by_account_id, parent_id, name, state,
  created_at, updated_at, deleted_at, recycle_group_id
)
SELECT
  id, 'account:' || owner_id, owner_id, parent_id, name, state,
  created_at, updated_at, deleted_at, recycle_group_id
FROM folders_legacy;

CREATE TABLE files (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_domain_id TEXT NOT NULL,
  uploaded_by_account_id TEXT NOT NULL,
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
    CHECK (state IN ('pending_upload', 'active', 'deleted', 'purging', 'purged')),
  revision INTEGER NOT NULL DEFAULT 0
    CHECK (revision >= 0),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0),
  activated_at TEXT,
  deleted_at TEXT,
  purged_at TEXT,
  recycle_group_id TEXT,
  UNIQUE (id, owner_domain_id),
  UNIQUE (storage_provider, object_key),
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (uploaded_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (folder_id, owner_domain_id) REFERENCES folders(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (recycle_group_id, owner_domain_id)
    REFERENCES recycle_groups(id, owner_domain_id) ON DELETE RESTRICT,
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
      state IN ('deleted', 'purging')
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

INSERT INTO files (
  id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
  storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
  checksum, state, revision, created_at, updated_at, activated_at, deleted_at,
  purged_at, recycle_group_id
)
SELECT
  id, 'account:' || owner_id, owner_id, folder_id, display_name,
  storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
  checksum, state, revision, created_at, updated_at, activated_at, deleted_at,
  purged_at, recycle_group_id
FROM files_legacy;

DROP TABLE files_legacy;
DROP TABLE folders_legacy;
DROP TABLE recycle_groups_legacy;

CREATE UNIQUE INDEX folders_unique_active_root_name
  ON folders(owner_domain_id, name COLLATE NOCASE)
  WHERE parent_id IS NULL AND state = 'active';

CREATE UNIQUE INDEX folders_unique_active_child_name
  ON folders(owner_domain_id, parent_id, name COLLATE NOCASE)
  WHERE parent_id IS NOT NULL AND state = 'active';

CREATE INDEX folders_owner_parent_index
  ON folders(owner_domain_id, parent_id);

CREATE INDEX folders_recycle_group_index
  ON folders(recycle_group_id, id)
  WHERE recycle_group_id IS NOT NULL;

CREATE UNIQUE INDEX files_unique_available_root_name
  ON files(owner_domain_id, display_name COLLATE NOCASE)
  WHERE folder_id IS NULL AND state IN ('pending_upload', 'active');

CREATE UNIQUE INDEX files_unique_available_folder_name
  ON files(owner_domain_id, folder_id, display_name COLLATE NOCASE)
  WHERE folder_id IS NOT NULL AND state IN ('pending_upload', 'active');

CREATE INDEX files_owner_folder_state_index
  ON files(owner_domain_id, folder_id, state);

CREATE INDEX files_state_updated_index
  ON files(state, updated_at, id);

CREATE INDEX files_recycle_group_index
  ON files(recycle_group_id, id)
  WHERE recycle_group_id IS NOT NULL;

CREATE INDEX recycle_groups_owner_created_index
  ON recycle_groups(owner_domain_id, created_at DESC, id);

CREATE TRIGGER folders_prevent_cycles
BEFORE UPDATE OF parent_id ON folders
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    WITH RECURSIVE ancestors(id, owner_domain_id) AS (
      SELECT NEW.parent_id, NEW.owner_domain_id
      UNION ALL
      SELECT folders.parent_id, folders.owner_domain_id
      FROM folders
      JOIN ancestors
        ON folders.id = ancestors.id
       AND folders.owner_domain_id = ancestors.owner_domain_id
      WHERE folders.parent_id IS NOT NULL
    )
    SELECT 1 FROM ancestors
    WHERE id = NEW.id AND owner_domain_id = NEW.owner_domain_id
  ) THEN RAISE(ABORT, 'folder hierarchy cycle') END;
END;

CREATE TRIGGER folders_owner_creator_immutable
BEFORE UPDATE OF owner_domain_id, created_by_account_id ON folders
WHEN NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.created_by_account_id <> OLD.created_by_account_id
BEGIN
  SELECT RAISE(ABORT, 'folder ownership and creator are immutable');
END;

CREATE TRIGGER files_owner_uploader_immutable
BEFORE UPDATE OF owner_domain_id, uploaded_by_account_id ON files
WHEN NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.uploaded_by_account_id <> OLD.uploaded_by_account_id
BEGIN
  SELECT RAISE(ABORT, 'file ownership and uploader are immutable');
END;

CREATE TRIGGER recycle_groups_owner_creator_immutable
BEFORE UPDATE OF owner_domain_id, created_by_account_id ON recycle_groups
WHEN NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.created_by_account_id <> OLD.created_by_account_id
BEGIN
  SELECT RAISE(ABORT, 'recycle ownership and initiator are immutable');
END;

CREATE TRIGGER folders_recycle_group_guard_insert
BEFORE INSERT ON folders
WHEN NOT (
  (NEW.state = 'active' AND NEW.recycle_group_id IS NULL)
  OR (
    NEW.state = 'deleted'
    AND NEW.recycle_group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM recycle_groups
      WHERE id = NEW.recycle_group_id AND owner_domain_id = NEW.owner_domain_id
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid folder recycle provenance');
END;

CREATE TRIGGER folders_recycle_group_guard_update
BEFORE UPDATE OF state, owner_domain_id, recycle_group_id ON folders
WHEN NOT (
  (NEW.state = 'active' AND NEW.recycle_group_id IS NULL)
  OR (
    NEW.state = 'deleted'
    AND NEW.recycle_group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM recycle_groups
      WHERE id = NEW.recycle_group_id AND owner_domain_id = NEW.owner_domain_id
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid folder recycle provenance');
END;

CREATE TRIGGER files_recycle_group_guard_insert
BEFORE INSERT ON files
WHEN NOT (
  (NEW.state IN ('pending_upload', 'active', 'purged') AND NEW.recycle_group_id IS NULL)
  OR (
    NEW.state IN ('deleted', 'purging')
    AND NEW.recycle_group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM recycle_groups
      WHERE id = NEW.recycle_group_id AND owner_domain_id = NEW.owner_domain_id
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid file recycle provenance');
END;

CREATE TRIGGER files_recycle_group_guard_update
BEFORE UPDATE OF state, owner_domain_id, recycle_group_id ON files
WHEN NOT (
  (NEW.state IN ('pending_upload', 'active', 'purged') AND NEW.recycle_group_id IS NULL)
  OR (
    NEW.state IN ('deleted', 'purging')
    AND NEW.recycle_group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM recycle_groups
      WHERE id = NEW.recycle_group_id AND owner_domain_id = NEW.owner_domain_id
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid file recycle provenance');
END;

CREATE TABLE favorite_files (
  account_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, file_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE favorite_folders (
  account_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, folder_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
) STRICT;

INSERT INTO favorite_files SELECT account_id, file_id, created_at FROM favorite_files_preserved;
INSERT INTO favorite_folders SELECT account_id, folder_id, created_at FROM favorite_folders_preserved;

DROP TABLE favorite_files_preserved;
DROP TABLE favorite_folders_preserved;

CREATE TRIGGER favorite_files_purge_cleanup
AFTER UPDATE OF state ON files
WHEN NEW.state = 'purged'
BEGIN
  DELETE FROM favorite_files WHERE file_id = NEW.id;
END;
