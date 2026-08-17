-- Explicit recycle-operation provenance. Every recoverable deleted resource
-- belongs to exactly one operation group; recursively deleted descendants
-- share their root folder's group, while independently deleted resources keep
-- their own groups and can never be resurrected by a later parent operation.

CREATE TABLE recycle_groups (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 512 AND id = trim(id)),
  owner_id TEXT NOT NULL,
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
  UNIQUE (id, owner_id),
  UNIQUE (owner_id, root_kind, root_id),
  FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK (
    (root_kind = 'folder' AND folder_count >= 1)
    OR (root_kind = 'file' AND folder_count = 0 AND file_count = 1)
  )
) STRICT;

ALTER TABLE folders
  ADD COLUMN recycle_group_id TEXT
  REFERENCES recycle_groups(id) ON DELETE RESTRICT;

ALTER TABLE files
  ADD COLUMN recycle_group_id TEXT
  REFERENCES recycle_groups(id) ON DELETE RESTRICT;

-- Migration of legacy recoverable rows is deliberately one resource per
-- group. This preserves all prior restore semantics without guessing that two
-- independently deleted rows belonged to one historical operation.
INSERT INTO recycle_groups (
  id, owner_id, root_kind, root_id, folder_count, file_count, created_at
)
SELECT
  'legacy-folder:' || id,
  owner_id,
  'folder',
  id,
  1,
  0,
  deleted_at
FROM folders
WHERE state = 'deleted';

UPDATE folders
SET recycle_group_id = 'legacy-folder:' || id
WHERE state = 'deleted';

INSERT INTO recycle_groups (
  id, owner_id, root_kind, root_id, folder_count, file_count, created_at
)
SELECT
  'legacy-file:' || id,
  owner_id,
  'file',
  id,
  0,
  1,
  deleted_at
FROM files
WHERE state IN ('deleted', 'purging');

UPDATE files
SET recycle_group_id = 'legacy-file:' || id
WHERE state IN ('deleted', 'purging');

CREATE INDEX recycle_groups_owner_created_index
  ON recycle_groups(owner_id, created_at DESC, id);

CREATE INDEX folders_recycle_group_index
  ON folders(recycle_group_id, id)
  WHERE recycle_group_id IS NOT NULL;

CREATE INDEX files_recycle_group_index
  ON files(recycle_group_id, id)
  WHERE recycle_group_id IS NOT NULL;

CREATE TRIGGER folders_recycle_group_guard_insert
BEFORE INSERT ON folders
WHEN NOT (
  (NEW.state = 'active' AND NEW.recycle_group_id IS NULL)
  OR (
    NEW.state = 'deleted'
    AND NEW.recycle_group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM recycle_groups
      WHERE id = NEW.recycle_group_id AND owner_id = NEW.owner_id
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid folder recycle provenance');
END;

CREATE TRIGGER folders_recycle_group_guard_update
BEFORE UPDATE OF state, owner_id, recycle_group_id ON folders
WHEN NOT (
  (NEW.state = 'active' AND NEW.recycle_group_id IS NULL)
  OR (
    NEW.state = 'deleted'
    AND NEW.recycle_group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM recycle_groups
      WHERE id = NEW.recycle_group_id AND owner_id = NEW.owner_id
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
      WHERE id = NEW.recycle_group_id AND owner_id = NEW.owner_id
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid file recycle provenance');
END;

CREATE TRIGGER files_recycle_group_guard_update
BEFORE UPDATE OF state, owner_id, recycle_group_id ON files
WHEN NOT (
  (NEW.state IN ('pending_upload', 'active', 'purged') AND NEW.recycle_group_id IS NULL)
  OR (
    NEW.state IN ('deleted', 'purging')
    AND NEW.recycle_group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM recycle_groups
      WHERE id = NEW.recycle_group_id AND owner_id = NEW.owner_id
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid file recycle provenance');
END;
