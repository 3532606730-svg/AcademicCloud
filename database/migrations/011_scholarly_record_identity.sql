-- RF-DOMAIN01 adds explicit private Scholarly Record / Artifact / Version
-- identities. Existing Drive files remain Physical Artifacts and are never
-- backfilled or reinterpreted by this migration.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE scholarly_records (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_domain_id TEXT NOT NULL,
  created_by_account_id TEXT NOT NULL,
  label TEXT NOT NULL
    CHECK (length(label) BETWEEN 1 AND 255 AND label = trim(label) AND instr(label, char(0)) = 0),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0),
  UNIQUE (id, owner_domain_id),
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_artifacts (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_domain_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  attachment_state TEXT NOT NULL
    CHECK (attachment_state IN ('attached', 'detached')),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0),
  UNIQUE (id, owner_domain_id),
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (record_id, owner_domain_id)
    REFERENCES scholarly_records(id, owner_domain_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_artifact_versions (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_domain_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  stored_file_id TEXT NOT NULL,
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0),
  UNIQUE (id, owner_domain_id),
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (artifact_id, owner_domain_id)
    REFERENCES scholarly_artifacts(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (stored_file_id) REFERENCES files(id) ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX scholarly_artifact_versions_stored_file_unique
  ON scholarly_artifact_versions(stored_file_id);

CREATE INDEX scholarly_records_owner_created_index
  ON scholarly_records(owner_domain_id, created_at DESC, id DESC);

CREATE INDEX scholarly_artifacts_record_index
  ON scholarly_artifacts(owner_domain_id, record_id, created_at, id);

CREATE INDEX scholarly_artifact_versions_artifact_index
  ON scholarly_artifact_versions(owner_domain_id, artifact_id, created_at, id);

CREATE INDEX scholarly_artifact_versions_file_index
  ON scholarly_artifact_versions(stored_file_id);

CREATE TRIGGER scholarly_records_identity_immutable
BEFORE UPDATE OF id, owner_domain_id, created_by_account_id ON scholarly_records
WHEN NEW.id <> OLD.id
  OR NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.created_by_account_id <> OLD.created_by_account_id
BEGIN
  SELECT RAISE(ABORT, 'scholarly record identity is immutable');
END;

CREATE TRIGGER scholarly_artifacts_identity_immutable
BEFORE UPDATE OF id, owner_domain_id, record_id ON scholarly_artifacts
WHEN NEW.id <> OLD.id
  OR NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.record_id <> OLD.record_id
BEGIN
  SELECT RAISE(ABORT, 'scholarly artifact identity is immutable');
END;

CREATE TRIGGER scholarly_artifact_versions_identity_immutable
BEFORE UPDATE OF id, owner_domain_id, artifact_id ON scholarly_artifact_versions
WHEN NEW.id <> OLD.id
  OR NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.artifact_id <> OLD.artifact_id
BEGIN
  SELECT RAISE(ABORT, 'scholarly artifact version identity is immutable');
END;

CREATE TRIGGER scholarly_artifact_versions_file_identity_immutable
BEFORE UPDATE OF stored_file_id ON scholarly_artifact_versions
WHEN NEW.stored_file_id IS NOT OLD.stored_file_id
BEGIN
  SELECT RAISE(ABORT, 'scholarly artifact version file identity is immutable');
END;

CREATE TRIGGER scholarly_artifacts_attachment_guard_insert
BEFORE INSERT ON scholarly_artifacts
WHEN NEW.attachment_state = 'attached'
  AND NOT EXISTS (
    SELECT 1
    FROM scholarly_artifact_versions
    JOIN files ON files.id = scholarly_artifact_versions.stored_file_id
    WHERE scholarly_artifact_versions.artifact_id = NEW.id
      AND scholarly_artifact_versions.owner_domain_id = NEW.owner_domain_id
      AND files.owner_domain_id = NEW.owner_domain_id
      AND files.state = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'attached scholarly artifact requires a stored file version');
END;

CREATE TRIGGER scholarly_artifacts_attachment_guard_update
BEFORE UPDATE OF attachment_state ON scholarly_artifacts
WHEN NEW.attachment_state = 'attached'
  AND NOT EXISTS (
    SELECT 1
    FROM scholarly_artifact_versions
    JOIN files ON files.id = scholarly_artifact_versions.stored_file_id
    WHERE scholarly_artifact_versions.artifact_id = NEW.id
      AND scholarly_artifact_versions.owner_domain_id = NEW.owner_domain_id
      AND files.owner_domain_id = NEW.owner_domain_id
      AND files.state = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'attached scholarly artifact requires a stored file version');
END;

CREATE TRIGGER scholarly_artifact_versions_file_owner_guard_insert
BEFORE INSERT ON scholarly_artifact_versions
WHEN NOT EXISTS (
    SELECT 1 FROM files
    WHERE files.id = NEW.stored_file_id
      AND files.owner_domain_id = NEW.owner_domain_id
      AND files.state = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'scholarly artifact version requires an active same-domain file');
END;

CREATE TRIGGER scholarly_artifact_versions_file_owner_guard_update
BEFORE UPDATE OF stored_file_id, owner_domain_id ON scholarly_artifact_versions
WHEN NOT EXISTS (
    SELECT 1 FROM files
    WHERE files.id = NEW.stored_file_id
      AND files.owner_domain_id = NEW.owner_domain_id
      AND files.state = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'scholarly artifact version requires an active same-domain file');
END;

CREATE TRIGGER files_prevent_attached_scholarly_purge
BEFORE UPDATE OF state ON files
WHEN NEW.state IN ('purging', 'purged')
  AND EXISTS (
    SELECT 1
    FROM scholarly_artifact_versions
    JOIN scholarly_artifacts
      ON scholarly_artifacts.id = scholarly_artifact_versions.artifact_id
     AND scholarly_artifacts.owner_domain_id = scholarly_artifact_versions.owner_domain_id
    WHERE scholarly_artifact_versions.stored_file_id = OLD.id
      AND scholarly_artifacts.attachment_state = 'attached'
  )
BEGIN
  SELECT RAISE(ABORT, 'stored file remains attached to a scholarly artifact');
END;

CREATE TRIGGER scholarly_records_no_delete
BEFORE DELETE ON scholarly_records
BEGIN
  SELECT RAISE(ABORT, 'scholarly record identity is retained');
END;

CREATE TRIGGER scholarly_artifacts_no_delete
BEFORE DELETE ON scholarly_artifacts
BEGIN
  SELECT RAISE(ABORT, 'scholarly artifact identity is retained');
END;

CREATE TRIGGER scholarly_artifact_versions_no_delete
BEFORE DELETE ON scholarly_artifact_versions
BEGIN
  SELECT RAISE(ABORT, 'scholarly artifact version identity is retained');
END;
