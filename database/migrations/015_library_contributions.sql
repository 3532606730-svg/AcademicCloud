-- RF-LIBRARY02 adds explicit contribution/review state and a narrowly scoped
-- ownership-promotion intent used only inside the approving transaction.

INSERT INTO governance_audit_target_types (target_type)
VALUES ('contribution');

INSERT INTO governance_audit_event_kinds (kind, target_type)
VALUES
  ('libraries.contribution_submit', 'contribution'),
  ('libraries.contribution_approve', 'contribution'),
  ('libraries.contribution_reject', 'contribution'),
  ('libraries.contribution_withdraw', 'contribution');

CREATE TABLE library_contributions (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  library_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  contributor_account_id TEXT NOT NULL,
  state TEXT NOT NULL
    CHECK (state IN ('submitted', 'approved', 'rejected', 'withdrawn')),
  revision INTEGER NOT NULL DEFAULT 0
    CHECK (revision >= 0),
  submitted_at TEXT NOT NULL
    CHECK (length(submitted_at) > 0),
  reviewed_at TEXT,
  reviewed_by_account_id TEXT,
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0),
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE RESTRICT,
  FOREIGN KEY (artifact_id) REFERENCES scholarly_artifacts(id) ON DELETE RESTRICT,
  FOREIGN KEY (contributor_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK (
    (state = 'submitted' AND reviewed_at IS NULL AND reviewed_by_account_id IS NULL)
    OR (state IN ('approved', 'rejected', 'withdrawn') AND reviewed_at IS NOT NULL AND reviewed_by_account_id IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX library_contributions_one_submitted
  ON library_contributions(library_id, artifact_id)
  WHERE state = 'submitted';

CREATE INDEX library_contributions_library_state_index
  ON library_contributions(library_id, state, submitted_at DESC, id DESC);

CREATE INDEX library_contributions_contributor_index
  ON library_contributions(contributor_account_id, library_id, submitted_at DESC, id DESC);

CREATE TRIGGER library_contributions_insert_guard
BEFORE INSERT ON library_contributions
WHEN NEW.state <> 'submitted'
  OR NEW.revision <> 0
  OR NEW.reviewed_at IS NOT NULL
  OR NEW.reviewed_by_account_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'library contribution must begin submitted');
END;

CREATE TABLE library_ownership_promotions (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  contribution_id TEXT NOT NULL UNIQUE,
  library_id TEXT NOT NULL,
  reviewed_by_account_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  FOREIGN KEY (contribution_id) REFERENCES library_contributions(id) ON DELETE RESTRICT,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX library_ownership_promotions_resource_index
  ON library_ownership_promotions(record_id, artifact_id, version_id, file_id);

CREATE TRIGGER library_ownership_promotions_submission_guard
BEFORE INSERT ON library_ownership_promotions
WHEN NOT EXISTS (
  SELECT 1
  FROM library_contributions
  JOIN scholarly_artifacts
    ON scholarly_artifacts.id = library_contributions.artifact_id
  JOIN scholarly_records
    ON scholarly_records.id = scholarly_artifacts.record_id
   AND scholarly_records.owner_domain_id = scholarly_artifacts.owner_domain_id
  JOIN scholarly_artifact_versions
    ON scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
   AND scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
  JOIN files ON files.id = scholarly_artifact_versions.stored_file_id
  JOIN accounts AS contributor_accounts
    ON contributor_accounts.id = library_contributions.contributor_account_id
  JOIN library_memberships AS contributor_membership
    ON contributor_membership.library_id = library_contributions.library_id
   AND contributor_membership.account_id = library_contributions.contributor_account_id
  JOIN library_memberships AS reviewer_membership
    ON reviewer_membership.library_id = library_contributions.library_id
   AND reviewer_membership.account_id = NEW.reviewed_by_account_id
   AND reviewer_membership.role = 'manager'
  JOIN accounts AS reviewer_accounts ON reviewer_accounts.id = NEW.reviewed_by_account_id
  WHERE library_contributions.id = NEW.contribution_id
    AND library_contributions.library_id = NEW.library_id
    AND library_contributions.artifact_id = NEW.artifact_id
    AND library_contributions.contributor_account_id = (
      SELECT account_id FROM ownership_domains WHERE id = scholarly_artifacts.owner_domain_id
    )
    AND library_contributions.state = 'submitted'
    AND contributor_accounts.state = 'active'
    AND contributor_accounts.archived_at IS NULL
    AND reviewer_accounts.state = 'active'
    AND reviewer_accounts.archived_at IS NULL
    AND scholarly_records.id = NEW.record_id
    AND scholarly_artifacts.attachment_state = 'attached'
    AND scholarly_artifact_versions.id = NEW.version_id
    AND files.id = NEW.file_id
    AND files.owner_domain_id = scholarly_artifacts.owner_domain_id
    AND files.state = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid Library ownership promotion intent');
END;

CREATE TRIGGER library_ownership_promotions_no_update
BEFORE UPDATE ON library_ownership_promotions
BEGIN
  SELECT RAISE(ABORT, 'Library ownership promotion intent is immutable');
END;

CREATE TRIGGER library_contributions_identity_immutable
BEFORE UPDATE OF id, library_id, artifact_id, contributor_account_id ON library_contributions
WHEN NEW.id <> OLD.id
  OR NEW.library_id <> OLD.library_id
  OR NEW.artifact_id <> OLD.artifact_id
  OR NEW.contributor_account_id <> OLD.contributor_account_id
BEGIN
  SELECT RAISE(ABORT, 'library contribution identity is immutable');
END;

CREATE TRIGGER library_contributions_state_guard
BEFORE UPDATE OF state ON library_contributions
WHEN OLD.state <> NEW.state
  AND NOT (OLD.state = 'submitted' AND NEW.state IN ('approved', 'rejected', 'withdrawn'))
BEGIN
  SELECT RAISE(ABORT, 'library contribution state is terminal');
END;

CREATE TRIGGER library_contributions_approval_guard
BEFORE UPDATE OF state ON library_contributions
WHEN OLD.state = 'submitted'
  AND NEW.state = 'approved'
  AND NOT EXISTS (
    SELECT 1
    FROM library_ownership_promotions
    JOIN libraries
      ON libraries.id = library_ownership_promotions.library_id
    JOIN scholarly_artifacts
      ON scholarly_artifacts.id = library_ownership_promotions.artifact_id
     AND scholarly_artifacts.owner_domain_id = libraries.owner_domain_id
    JOIN scholarly_records
      ON scholarly_records.id = library_ownership_promotions.record_id
     AND scholarly_records.id = scholarly_artifacts.record_id
     AND scholarly_records.owner_domain_id = libraries.owner_domain_id
    JOIN scholarly_artifact_versions
      ON scholarly_artifact_versions.id = library_ownership_promotions.version_id
     AND scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
     AND scholarly_artifact_versions.owner_domain_id = libraries.owner_domain_id
    JOIN files
      ON files.id = library_ownership_promotions.file_id
     AND files.id = scholarly_artifact_versions.stored_file_id
     AND files.owner_domain_id = libraries.owner_domain_id
     AND files.state = 'active'
    WHERE library_ownership_promotions.contribution_id = OLD.id
      AND library_ownership_promotions.library_id = OLD.library_id
      AND library_ownership_promotions.artifact_id = OLD.artifact_id
      AND library_ownership_promotions.reviewed_by_account_id = NEW.reviewed_by_account_id
  )
BEGIN
  SELECT RAISE(ABORT, 'approved contribution requires completed Library ownership promotion');
END;

-- RF-DOMAIN01 intentionally made scholarly ownership immutable. The only
-- later exception is the server-created, one-transaction promotion intent.
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
  )
BEGIN
  SELECT RAISE(ABORT, 'file ownership and uploader are immutable');
END;
