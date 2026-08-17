CREATE TABLE governance_audit_target_types (
  target_type TEXT PRIMARY KEY
    CHECK (length(target_type) BETWEEN 1 AND 32 AND target_type = trim(target_type))
) STRICT;

INSERT INTO governance_audit_target_types (target_type) VALUES
  ('account'),
  ('invitation'),
  ('announcement'),
  ('file'),
  ('folder');

CREATE TABLE governance_audit_event_kinds (
  kind TEXT PRIMARY KEY
    CHECK (length(kind) BETWEEN 1 AND 96 AND kind = trim(kind)),
  target_type TEXT,
  FOREIGN KEY (target_type) REFERENCES governance_audit_target_types(target_type) ON DELETE RESTRICT
) STRICT;

INSERT INTO governance_audit_event_kinds (kind, target_type) VALUES
  ('auth.login', 'account'),
  ('auth.logout', NULL),
  ('auth.password_change', NULL),
  ('accounts.owner_bootstrap', 'account'),
  ('accounts.register', 'account'),
  ('accounts.invitation_create', 'invitation'),
  ('accounts.invitation_revoke', 'invitation'),
  ('accounts.member_state_change', 'account'),
  ('announcements.create', 'announcement'),
  ('announcements.edit', 'announcement'),
  ('announcements.publish', 'announcement'),
  ('announcements.unpublish', 'announcement'),
  ('drive.upload_activate', 'file'),
  ('drive.folder_recycle', 'folder'),
  ('drive.folder_restore', 'folder'),
  ('drive.file_recycle', 'file'),
  ('drive.file_restore', 'file'),
  ('drive.file_purge_request', 'file'),
  ('drive.file_purge_complete', 'file');

CREATE TABLE governance_audit_reason_codes (
  reason TEXT PRIMARY KEY
    CHECK (length(reason) BETWEEN 1 AND 64 AND reason = trim(reason))
) STRICT;

INSERT INTO governance_audit_reason_codes (reason) VALUES
  ('invalid_credentials'),
  ('invalid_current_password'),
  ('password_change_conflict'),
  ('password_unchanged'),
  ('invalid_invitation'),
  ('login_unavailable'),
  ('authorization_denied'),
  ('not_found'),
  ('invalid_target'),
  ('invalid_state'),
  ('invalid_input'),
  ('rate_limit_exceeded'),
  ('kdf_overloaded'),
  ('storage_unavailable'),
  ('upload_incomplete'),
  ('upload_metadata_mismatch'),
  ('name_conflict'),
  ('concurrent_change');

CREATE TABLE governance_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL
    CHECK (length(occurred_at) > 0),
  action TEXT NOT NULL,
  outcome TEXT NOT NULL
    CHECK (outcome IN ('succeeded', 'denied', 'failed', 'busy')),
  actor_kind TEXT NOT NULL
    CHECK (actor_kind IN ('account', 'system', 'anonymous')),
  actor_account_id TEXT,
  target_id TEXT
    CHECK (target_id IS NULL OR (length(target_id) BETWEEN 1 AND 128 AND target_id = trim(target_id))),
  reason TEXT,
  FOREIGN KEY (action) REFERENCES governance_audit_event_kinds(kind) ON DELETE RESTRICT,
  FOREIGN KEY (actor_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (reason) REFERENCES governance_audit_reason_codes(reason) ON DELETE RESTRICT,
  CHECK (
    (actor_kind = 'account' AND actor_account_id IS NOT NULL)
    OR (actor_kind IN ('system', 'anonymous') AND actor_account_id IS NULL)
  ),
  CHECK (
    (outcome = 'succeeded' AND reason IS NULL)
    OR (outcome <> 'succeeded' AND reason IS NOT NULL)
  )
) STRICT;

CREATE TRIGGER governance_audit_events_shape_guard
BEFORE INSERT ON governance_audit_events
WHEN NOT (
  (
    NEW.outcome = 'succeeded'
    AND (
      ((SELECT target_type FROM governance_audit_event_kinds WHERE kind = NEW.action) IS NULL AND NEW.target_id IS NULL)
      OR ((SELECT target_type FROM governance_audit_event_kinds WHERE kind = NEW.action) IS NOT NULL AND NEW.target_id IS NOT NULL)
    )
  )
  OR (NEW.outcome <> 'succeeded' AND NEW.target_id IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'invalid governance audit event shape');
END;

CREATE TRIGGER governance_audit_events_immutable
BEFORE UPDATE ON governance_audit_events
BEGIN
  SELECT RAISE(ABORT, 'governance audit events are immutable');
END;

CREATE TRIGGER governance_audit_target_types_no_update
BEFORE UPDATE ON governance_audit_target_types
BEGIN
  SELECT RAISE(ABORT, 'governance audit registries are append-only');
END;

CREATE TRIGGER governance_audit_target_types_no_delete
BEFORE DELETE ON governance_audit_target_types
BEGIN
  SELECT RAISE(ABORT, 'governance audit registries are append-only');
END;

CREATE TRIGGER governance_audit_event_kinds_no_update
BEFORE UPDATE ON governance_audit_event_kinds
BEGIN
  SELECT RAISE(ABORT, 'governance audit registries are append-only');
END;

CREATE TRIGGER governance_audit_event_kinds_no_delete
BEFORE DELETE ON governance_audit_event_kinds
BEGIN
  SELECT RAISE(ABORT, 'governance audit registries are append-only');
END;

CREATE TRIGGER governance_audit_reason_codes_no_update
BEFORE UPDATE ON governance_audit_reason_codes
BEGIN
  SELECT RAISE(ABORT, 'governance audit registries are append-only');
END;

CREATE TRIGGER governance_audit_reason_codes_no_delete
BEFORE DELETE ON governance_audit_reason_codes
BEGIN
  SELECT RAISE(ABORT, 'governance audit registries are append-only');
END;

CREATE INDEX governance_audit_events_actor_index
  ON governance_audit_events(actor_account_id, id DESC)
  WHERE actor_account_id IS NOT NULL;
