-- L2-CREDENTIALRESET01 replaces signed-in self-service password change with
-- an Owner-issued, Member-redeemed, short-lived single-use capability.

INSERT INTO governance_audit_target_types (target_type)
VALUES ('credential_reset');

INSERT INTO governance_audit_event_kinds (kind, target_type)
VALUES
  ('accounts.credential_reset_issue', 'credential_reset'),
  ('auth.credential_reset', 'credential_reset');

INSERT INTO governance_audit_reason_codes (reason)
VALUES ('invalid_credential_reset');

CREATE TABLE credential_resets (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  token_digest TEXT NOT NULL UNIQUE
    CHECK (length(token_digest) = 64 AND token_digest = lower(token_digest)),
  account_id TEXT NOT NULL,
  issued_by_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  expires_at TEXT NOT NULL CHECK (length(expires_at) > 0),
  consumed_at TEXT,
  superseded_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (issued_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR superseded_at IS NULL)
) STRICT;

CREATE UNIQUE INDEX credential_resets_one_outstanding_per_account
  ON credential_resets(account_id)
  WHERE consumed_at IS NULL AND superseded_at IS NULL;

CREATE INDEX credential_resets_account_history
  ON credential_resets(account_id, created_at DESC, id DESC);

CREATE TRIGGER credential_resets_insert_guard
BEFORE INSERT ON credential_resets
WHEN NEW.consumed_at IS NOT NULL OR NEW.superseded_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'credential reset must begin outstanding');
END;

CREATE TRIGGER credential_resets_identity_immutable
BEFORE UPDATE OF id, token_digest, account_id, issued_by_account_id, created_at, expires_at
ON credential_resets
WHEN NEW.id <> OLD.id
  OR NEW.token_digest <> OLD.token_digest
  OR NEW.account_id <> OLD.account_id
  OR NEW.issued_by_account_id <> OLD.issued_by_account_id
  OR NEW.created_at <> OLD.created_at
  OR NEW.expires_at <> OLD.expires_at
BEGIN
  SELECT RAISE(ABORT, 'credential reset identity is immutable');
END;

CREATE TRIGGER credential_resets_transition_guard
BEFORE UPDATE OF consumed_at, superseded_at ON credential_resets
WHEN OLD.consumed_at IS NOT NULL
  OR OLD.superseded_at IS NOT NULL
  OR (NEW.consumed_at IS NULL AND NEW.superseded_at IS NULL)
  OR (NEW.consumed_at IS NOT NULL AND NEW.superseded_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'credential reset transition is terminal');
END;

CREATE TRIGGER credential_resets_no_delete
BEFORE DELETE ON credential_resets
BEGIN
  SELECT RAISE(ABORT, 'credential reset evidence is retained');
END;
