-- RF-SHAREDDEFAULT01 establishes one canonical shared academic corpus.
-- Existing active account-owned resources are transitioned without changing
-- physical object identity, uploader provenance, or account-private overlays.

PRAGMA defer_foreign_keys = ON;

ALTER TABLE libraries
  ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0
  CHECK (is_default IN (0, 1));

CREATE UNIQUE INDEX libraries_one_default
  ON libraries(is_default)
  WHERE is_default = 1;

-- Explicit optional Libraries retain the RF-LIBRARY01 last-manager rule.
-- The canonical Library instead derives authority from the global Owner role;
-- allowing a stale/disabled Owner identity is necessary for authentication to
-- fail closed and does not grant another account review authority.
DROP TRIGGER accounts_last_library_manager_guard;

CREATE TRIGGER accounts_last_library_manager_guard
BEFORE UPDATE OF state, archived_at ON accounts
WHEN OLD.state = 'active'
  AND OLD.archived_at IS NULL
  AND (NEW.state <> 'active' OR NEW.archived_at IS NOT NULL)
  AND EXISTS (
    SELECT 1
    FROM library_memberships
    JOIN libraries ON libraries.id = library_memberships.library_id
    WHERE library_memberships.account_id = OLD.id
      AND library_memberships.role = 'manager'
      AND libraries.is_default = 0
  )
  AND EXISTS (
    SELECT 1
    FROM library_memberships
    JOIN libraries ON libraries.id = library_memberships.library_id
    WHERE library_memberships.account_id = OLD.id
      AND library_memberships.role = 'manager'
      AND libraries.is_default = 0
      AND NOT EXISTS (
        SELECT 1
        FROM library_memberships AS other_memberships
        JOIN accounts AS other_accounts ON other_accounts.id = other_memberships.account_id
        WHERE other_memberships.library_id = library_memberships.library_id
          AND other_memberships.account_id <> OLD.id
          AND other_memberships.role = 'manager'
          AND other_accounts.state = 'active'
          AND other_accounts.archived_at IS NULL
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'account is the last effective library manager');
END;

INSERT INTO governance_audit_event_kinds (kind, target_type)
VALUES
  ('libraries.resource_admit', 'contribution'),
  ('libraries.corpus_transition', 'library');

-- The deterministic identity makes fresh bootstrap, migration, and later
-- application startup converge on the same single Library.
INSERT INTO ownership_domains (id, kind, account_id, created_at)
SELECT 'library:canonical-library', 'library', NULL, owner.created_at
FROM accounts AS owner
WHERE owner.role = 'owner'
  AND NOT EXISTS (SELECT 1 FROM libraries WHERE is_default = 1)
ORDER BY owner.created_at, owner.id
LIMIT 1;

INSERT INTO libraries (
  id, owner_domain_id, name, created_by_account_id,
  created_at, updated_at, is_default
)
SELECT
  'canonical-library', 'library:canonical-library', '资料库', owner.id,
  owner.created_at, owner.updated_at, 1
FROM accounts AS owner
WHERE owner.role = 'owner'
  AND NOT EXISTS (SELECT 1 FROM libraries WHERE is_default = 1)
ORDER BY owner.created_at, owner.id
LIMIT 1;

INSERT INTO library_memberships (
  library_id, account_id, role, created_at, updated_at
)
SELECT
  library.id,
  account.id,
  CASE WHEN account.role = 'owner' THEN 'manager' ELSE 'member' END,
  account.created_at,
  account.updated_at
FROM libraries AS library
JOIN accounts AS account
WHERE library.is_default = 1
  AND account.state = 'active'
  AND account.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM library_memberships
    WHERE library_id = library.id AND account_id = account.id
  );

-- A fresh database has no account when migrations first run. The first Owner
-- bootstrap creates the same canonical Library and attaches every then-active
-- account. Ordinary account creation/activation attaches automatically.
CREATE TRIGGER accounts_create_canonical_library
AFTER INSERT ON accounts
WHEN NEW.role = 'owner'
  AND NOT EXISTS (SELECT 1 FROM libraries WHERE is_default = 1)
BEGIN
  INSERT INTO ownership_domains (id, kind, account_id, created_at)
  VALUES ('library:canonical-library', 'library', NULL, NEW.created_at);

  INSERT INTO libraries (
    id, owner_domain_id, name, created_by_account_id,
    created_at, updated_at, is_default
  ) VALUES (
    'canonical-library', 'library:canonical-library', '资料库', NEW.id,
    NEW.created_at, NEW.updated_at, 1
  );

  INSERT INTO library_memberships (
    library_id, account_id, role, created_at, updated_at
  )
  SELECT
    'canonical-library', account.id,
    CASE WHEN account.role = 'owner' THEN 'manager' ELSE 'member' END,
    account.created_at, account.updated_at
  FROM accounts AS account
  WHERE account.state = 'active' AND account.archived_at IS NULL;
END;

CREATE TRIGGER accounts_join_canonical_library
AFTER INSERT ON accounts
WHEN NEW.state = 'active'
  AND NEW.archived_at IS NULL
  AND EXISTS (SELECT 1 FROM libraries WHERE is_default = 1)
BEGIN
  INSERT OR IGNORE INTO library_memberships (
    library_id, account_id, role, created_at, updated_at
  )
  SELECT
    libraries.id,
    NEW.id,
    CASE WHEN NEW.role = 'owner' THEN 'manager' ELSE 'member' END,
    NEW.created_at,
    NEW.updated_at
  FROM libraries
  WHERE libraries.is_default = 1;
END;

CREATE TRIGGER accounts_rejoin_canonical_library
AFTER UPDATE OF state, archived_at ON accounts
WHEN NEW.state = 'active'
  AND NEW.archived_at IS NULL
  AND (OLD.state <> 'active' OR OLD.archived_at IS NOT NULL)
BEGIN
  INSERT OR IGNORE INTO library_memberships (
    library_id, account_id, role, created_at, updated_at
  )
  SELECT
    libraries.id,
    NEW.id,
    CASE WHEN NEW.role = 'owner' THEN 'manager' ELSE 'member' END,
    NEW.created_at,
    NEW.updated_at
  FROM libraries
  WHERE libraries.is_default = 1;
END;

CREATE TRIGGER libraries_default_identity_immutable
BEFORE UPDATE OF is_default ON libraries
WHEN NEW.is_default <> OLD.is_default
BEGIN
  SELECT RAISE(ABORT, 'canonical Library identity is immutable');
END;

CREATE TRIGGER libraries_default_no_delete
BEFORE DELETE ON libraries
WHEN OLD.is_default = 1
BEGIN
  SELECT RAISE(ABORT, 'canonical Library is retained');
END;

CREATE TRIGGER canonical_library_membership_role_guard
BEFORE UPDATE OF role ON library_memberships
WHEN EXISTS (
  SELECT 1 FROM libraries
  WHERE libraries.id = OLD.library_id AND libraries.is_default = 1
)
AND NEW.role <> (
  SELECT CASE WHEN accounts.role = 'owner' THEN 'manager' ELSE 'member' END
  FROM accounts WHERE accounts.id = OLD.account_id
)
BEGIN
  SELECT RAISE(ABORT, 'canonical Library role follows account authority');
END;

CREATE TRIGGER canonical_library_membership_no_delete
BEFORE DELETE ON library_memberships
WHEN EXISTS (
  SELECT 1 FROM libraries
  WHERE libraries.id = OLD.library_id AND libraries.is_default = 1
)
BEGIN
  SELECT RAISE(ABORT, 'canonical Library membership is automatic');
END;

-- Durable mapping for active files that predate Scholarly identities. The
-- generated identities are ordinary stable IDs after this transaction.
CREATE TABLE canonical_library_file_backfills (
  file_id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL UNIQUE,
  artifact_id TEXT NOT NULL UNIQUE,
  version_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
  FOREIGN KEY (record_id) REFERENCES scholarly_records(id) ON DELETE RESTRICT,
  FOREIGN KEY (artifact_id) REFERENCES scholarly_artifacts(id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id) REFERENCES scholarly_artifact_versions(id) ON DELETE RESTRICT
) STRICT;

CREATE TRIGGER canonical_library_file_backfills_no_update
BEFORE UPDATE ON canonical_library_file_backfills
BEGIN
  SELECT RAISE(ABORT, 'canonical Library backfill evidence is immutable');
END;

CREATE TRIGGER canonical_library_file_backfills_no_delete
BEFORE DELETE ON canonical_library_file_backfills
BEGIN
  SELECT RAISE(ABORT, 'canonical Library backfill evidence is retained');
END;

INSERT INTO canonical_library_file_backfills (
  file_id, record_id, artifact_id, version_id, created_at
)
SELECT
  files.id,
  'rf16r_' || lower(hex(randomblob(16))),
  'rf16a_' || lower(hex(randomblob(16))),
  'rf16v_' || lower(hex(randomblob(16))),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM files
JOIN ownership_domains ON ownership_domains.id = files.owner_domain_id
WHERE EXISTS (SELECT 1 FROM libraries WHERE is_default = 1)
  AND ownership_domains.kind = 'account'
  AND files.state = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM scholarly_artifact_versions
    WHERE scholarly_artifact_versions.stored_file_id = files.id
  );

INSERT INTO scholarly_records (
  id, owner_domain_id, created_by_account_id, label, created_at, updated_at
)
SELECT
  backfill.record_id,
  files.owner_domain_id,
  files.uploaded_by_account_id,
  files.display_name,
  files.created_at,
  files.updated_at
FROM canonical_library_file_backfills AS backfill
JOIN files ON files.id = backfill.file_id;

INSERT INTO scholarly_artifacts (
  id, owner_domain_id, record_id, attachment_state, created_at, updated_at
)
SELECT
  backfill.artifact_id,
  files.owner_domain_id,
  backfill.record_id,
  'detached',
  files.created_at,
  files.updated_at
FROM canonical_library_file_backfills AS backfill
JOIN files ON files.id = backfill.file_id;

INSERT INTO scholarly_artifact_versions (
  id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at
)
SELECT
  backfill.version_id,
  files.owner_domain_id,
  backfill.artifact_id,
  files.id,
  files.created_at,
  files.updated_at
FROM canonical_library_file_backfills AS backfill
JOIN files ON files.id = backfill.file_id;

UPDATE scholarly_artifacts
SET attachment_state = 'attached'
WHERE id IN (SELECT artifact_id FROM canonical_library_file_backfills);

-- One immutable row authorizes the one-time domain move for a complete Record
-- graph. Only Records whose stored versions are all active are admitted; any
-- pending/deleted/purging/purged residue remains in its account domain.
CREATE TABLE canonical_library_record_transitions (
  record_id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  source_owner_domain_id TEXT NOT NULL,
  contributor_account_id TEXT NOT NULL,
  transitioned_at TEXT NOT NULL CHECK (length(transitioned_at) > 0),
  FOREIGN KEY (record_id) REFERENCES scholarly_records(id) ON DELETE RESTRICT,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (contributor_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE TRIGGER canonical_library_record_transitions_insert_guard
BEFORE INSERT ON canonical_library_record_transitions
WHEN NOT EXISTS (
  SELECT 1
  FROM scholarly_records
  JOIN ownership_domains
    ON ownership_domains.id = scholarly_records.owner_domain_id
  JOIN libraries ON libraries.id = NEW.library_id
  WHERE scholarly_records.id = NEW.record_id
    AND scholarly_records.owner_domain_id = NEW.source_owner_domain_id
    AND ownership_domains.kind = 'account'
    AND ownership_domains.account_id = NEW.contributor_account_id
    AND libraries.is_default = 1
)
BEGIN
  SELECT RAISE(ABORT, 'invalid canonical Library transition');
END;

CREATE TRIGGER canonical_library_record_transitions_no_update
BEFORE UPDATE ON canonical_library_record_transitions
BEGIN
  SELECT RAISE(ABORT, 'canonical Library transition evidence is immutable');
END;

CREATE TRIGGER canonical_library_record_transitions_no_delete
BEFORE DELETE ON canonical_library_record_transitions
BEGIN
  SELECT RAISE(ABORT, 'canonical Library transition evidence is retained');
END;

INSERT INTO canonical_library_record_transitions (
  record_id, library_id, source_owner_domain_id,
  contributor_account_id, transitioned_at
)
SELECT
  scholarly_records.id,
  libraries.id,
  scholarly_records.owner_domain_id,
  ownership_domains.account_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM scholarly_records
JOIN ownership_domains
  ON ownership_domains.id = scholarly_records.owner_domain_id
JOIN libraries ON libraries.is_default = 1
WHERE ownership_domains.kind = 'account'
  AND EXISTS (
    SELECT 1
    FROM scholarly_artifacts
    JOIN scholarly_artifact_versions
      ON scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
     AND scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
    JOIN files ON files.id = scholarly_artifact_versions.stored_file_id
    WHERE scholarly_artifacts.record_id = scholarly_records.id
      AND scholarly_artifacts.owner_domain_id = scholarly_records.owner_domain_id
      AND scholarly_artifacts.attachment_state = 'attached'
      AND files.state = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM scholarly_artifacts
    JOIN scholarly_artifact_versions
      ON scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
     AND scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
    JOIN files ON files.id = scholarly_artifact_versions.stored_file_id
    WHERE scholarly_artifacts.record_id = scholarly_records.id
      AND scholarly_artifacts.owner_domain_id = scholarly_records.owner_domain_id
      AND files.state <> 'active'
  );

-- Extend the immutable ownership guards only for the durable transition rows.
-- The RF-LIBRARY02 one-transaction promotion intents remain valid unchanged.
DROP TRIGGER scholarly_records_identity_immutable;
DROP TRIGGER scholarly_artifacts_identity_immutable;
DROP TRIGGER scholarly_artifact_versions_identity_immutable;
DROP TRIGGER scholarly_artifact_versions_file_owner_guard_update;
DROP TRIGGER files_owner_uploader_immutable;

CREATE TRIGGER scholarly_records_identity_immutable
BEFORE UPDATE OF id, owner_domain_id, created_by_account_id ON scholarly_records
WHEN NEW.id <> OLD.id
  OR NEW.created_by_account_id <> OLD.created_by_account_id
  OR (
    NEW.owner_domain_id <> OLD.owner_domain_id
    AND NOT EXISTS (
      SELECT 1
      FROM library_ownership_promotions
      JOIN libraries ON libraries.id = library_ownership_promotions.library_id
      WHERE library_ownership_promotions.record_id = OLD.id
        AND libraries.owner_domain_id = NEW.owner_domain_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM canonical_library_record_transitions
      JOIN libraries ON libraries.id = canonical_library_record_transitions.library_id
      WHERE canonical_library_record_transitions.record_id = OLD.id
        AND canonical_library_record_transitions.source_owner_domain_id = OLD.owner_domain_id
        AND libraries.owner_domain_id = NEW.owner_domain_id
        AND libraries.is_default = 1
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'scholarly record identity is immutable');
END;

CREATE TRIGGER scholarly_artifacts_identity_immutable
BEFORE UPDATE OF id, owner_domain_id, record_id ON scholarly_artifacts
WHEN NEW.id <> OLD.id
  OR NEW.record_id <> OLD.record_id
  OR (
    NEW.owner_domain_id <> OLD.owner_domain_id
    AND NOT EXISTS (
      SELECT 1
      FROM library_ownership_promotions
      JOIN libraries ON libraries.id = library_ownership_promotions.library_id
      WHERE library_ownership_promotions.artifact_id = OLD.id
        AND libraries.owner_domain_id = NEW.owner_domain_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM canonical_library_record_transitions
      JOIN libraries ON libraries.id = canonical_library_record_transitions.library_id
      WHERE canonical_library_record_transitions.record_id = OLD.record_id
        AND canonical_library_record_transitions.source_owner_domain_id = OLD.owner_domain_id
        AND libraries.owner_domain_id = NEW.owner_domain_id
        AND libraries.is_default = 1
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'scholarly artifact identity is immutable');
END;

CREATE TRIGGER scholarly_artifact_versions_identity_immutable
BEFORE UPDATE OF id, owner_domain_id, artifact_id ON scholarly_artifact_versions
WHEN NEW.id <> OLD.id
  OR NEW.artifact_id <> OLD.artifact_id
  OR (
    NEW.owner_domain_id <> OLD.owner_domain_id
    AND NOT EXISTS (
      SELECT 1
      FROM library_ownership_promotions
      JOIN libraries ON libraries.id = library_ownership_promotions.library_id
      WHERE library_ownership_promotions.version_id = OLD.id
        AND libraries.owner_domain_id = NEW.owner_domain_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM scholarly_artifacts
      JOIN canonical_library_record_transitions
        ON canonical_library_record_transitions.record_id = scholarly_artifacts.record_id
      JOIN libraries ON libraries.id = canonical_library_record_transitions.library_id
      WHERE scholarly_artifacts.id = OLD.artifact_id
        AND canonical_library_record_transitions.source_owner_domain_id = OLD.owner_domain_id
        AND libraries.owner_domain_id = NEW.owner_domain_id
        AND libraries.is_default = 1
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'scholarly artifact version identity is immutable');
END;

CREATE TRIGGER scholarly_artifact_versions_file_owner_guard_update
BEFORE UPDATE OF stored_file_id, owner_domain_id ON scholarly_artifact_versions
WHEN NOT EXISTS (
    SELECT 1 FROM files
    WHERE files.id = NEW.stored_file_id
      AND files.owner_domain_id = NEW.owner_domain_id
      AND files.state = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM library_ownership_promotions
    JOIN libraries ON libraries.id = library_ownership_promotions.library_id
    WHERE library_ownership_promotions.version_id = NEW.id
      AND library_ownership_promotions.file_id = NEW.stored_file_id
      AND libraries.owner_domain_id = NEW.owner_domain_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM scholarly_artifacts
    JOIN canonical_library_record_transitions
      ON canonical_library_record_transitions.record_id = scholarly_artifacts.record_id
    JOIN libraries ON libraries.id = canonical_library_record_transitions.library_id
    WHERE scholarly_artifacts.id = NEW.artifact_id
      AND canonical_library_record_transitions.source_owner_domain_id = OLD.owner_domain_id
      AND libraries.owner_domain_id = NEW.owner_domain_id
      AND libraries.is_default = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'scholarly artifact version requires an active same-domain file');
END;

CREATE TRIGGER files_owner_uploader_immutable
BEFORE UPDATE OF owner_domain_id, uploaded_by_account_id ON files
WHEN NEW.uploaded_by_account_id <> OLD.uploaded_by_account_id
  OR (
    NEW.owner_domain_id <> OLD.owner_domain_id
    AND NOT EXISTS (
      SELECT 1
      FROM library_ownership_promotions
      JOIN libraries ON libraries.id = library_ownership_promotions.library_id
      WHERE library_ownership_promotions.file_id = OLD.id
        AND libraries.owner_domain_id = NEW.owner_domain_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM scholarly_artifact_versions
      JOIN scholarly_artifacts
        ON scholarly_artifacts.id = scholarly_artifact_versions.artifact_id
       AND scholarly_artifacts.owner_domain_id = scholarly_artifact_versions.owner_domain_id
      JOIN canonical_library_record_transitions
        ON canonical_library_record_transitions.record_id = scholarly_artifacts.record_id
      JOIN libraries ON libraries.id = canonical_library_record_transitions.library_id
      WHERE scholarly_artifact_versions.stored_file_id = OLD.id
        AND canonical_library_record_transitions.source_owner_domain_id = OLD.owner_domain_id
        AND libraries.owner_domain_id = NEW.owner_domain_id
        AND libraries.is_default = 1
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'file ownership and uploader are immutable');
END;

UPDATE files
SET owner_domain_id = (
      SELECT libraries.owner_domain_id
      FROM canonical_library_record_transitions
      JOIN libraries ON libraries.id = canonical_library_record_transitions.library_id
      JOIN scholarly_artifacts
        ON scholarly_artifacts.record_id = canonical_library_record_transitions.record_id
      JOIN scholarly_artifact_versions
        ON scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
       AND scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
      WHERE scholarly_artifact_versions.stored_file_id = files.id
      LIMIT 1
    ),
    folder_id = NULL
WHERE EXISTS (
  SELECT 1
  FROM canonical_library_record_transitions
  JOIN scholarly_artifacts
    ON scholarly_artifacts.record_id = canonical_library_record_transitions.record_id
  JOIN scholarly_artifact_versions
    ON scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
   AND scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
  WHERE scholarly_artifact_versions.stored_file_id = files.id
    AND files.owner_domain_id = canonical_library_record_transitions.source_owner_domain_id
);

UPDATE scholarly_artifact_versions
SET owner_domain_id = (
  SELECT libraries.owner_domain_id
  FROM scholarly_artifacts
  JOIN canonical_library_record_transitions
    ON canonical_library_record_transitions.record_id = scholarly_artifacts.record_id
  JOIN libraries ON libraries.id = canonical_library_record_transitions.library_id
  WHERE scholarly_artifacts.id = scholarly_artifact_versions.artifact_id
)
WHERE EXISTS (
  SELECT 1
  FROM scholarly_artifacts
  JOIN canonical_library_record_transitions
    ON canonical_library_record_transitions.record_id = scholarly_artifacts.record_id
  WHERE scholarly_artifacts.id = scholarly_artifact_versions.artifact_id
    AND scholarly_artifact_versions.owner_domain_id = canonical_library_record_transitions.source_owner_domain_id
);

UPDATE scholarly_artifacts
SET owner_domain_id = (
  SELECT libraries.owner_domain_id
  FROM canonical_library_record_transitions
  JOIN libraries ON libraries.id = canonical_library_record_transitions.library_id
  WHERE canonical_library_record_transitions.record_id = scholarly_artifacts.record_id
)
WHERE EXISTS (
  SELECT 1
  FROM canonical_library_record_transitions
  WHERE canonical_library_record_transitions.record_id = scholarly_artifacts.record_id
    AND scholarly_artifacts.owner_domain_id = canonical_library_record_transitions.source_owner_domain_id
);

UPDATE scholarly_records
SET owner_domain_id = (
  SELECT libraries.owner_domain_id
  FROM canonical_library_record_transitions
  JOIN libraries ON libraries.id = canonical_library_record_transitions.library_id
  WHERE canonical_library_record_transitions.record_id = scholarly_records.id
)
WHERE EXISTS (
  SELECT 1
  FROM canonical_library_record_transitions
  WHERE canonical_library_record_transitions.record_id = scholarly_records.id
    AND scholarly_records.owner_domain_id = canonical_library_record_transitions.source_owner_domain_id
);

INSERT INTO governance_audit_events (
  occurred_at, action, outcome, actor_kind, actor_account_id, target_id, reason
)
SELECT
  transition.transitioned_at,
  'libraries.corpus_transition',
  'succeeded',
  'system',
  NULL,
  transition.library_id,
  NULL
FROM canonical_library_record_transitions AS transition;
