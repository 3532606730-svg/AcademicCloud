-- Layer 2 Accounts I: deterministic legacy role migration plus digest-only,
-- single-use invitations. Existing account ownership identities are preserved.

CREATE TABLE account_role_migration_guard (
  existing_account_count INTEGER NOT NULL CHECK (existing_account_count <= 1)
) STRICT;

INSERT INTO account_role_migration_guard (existing_account_count)
SELECT count(*) FROM accounts;

ALTER TABLE accounts
  ADD COLUMN role TEXT CHECK (role IN ('owner', 'member'));

ALTER TABLE accounts
  ADD COLUMN auth_revision INTEGER NOT NULL DEFAULT 0
  CHECK (auth_revision >= 0);

UPDATE accounts SET role = 'owner';

CREATE TRIGGER accounts_role_guard_insert
BEFORE INSERT ON accounts
WHEN NEW.role IS NULL OR NEW.role NOT IN ('owner', 'member')
BEGIN
  SELECT RAISE(ABORT, 'account role is required');
END;

CREATE TRIGGER accounts_role_guard_update
BEFORE UPDATE OF role ON accounts
WHEN NEW.role IS NULL OR NEW.role NOT IN ('owner', 'member')
BEGIN
  SELECT RAISE(ABORT, 'account role is required');
END;

CREATE TRIGGER accounts_state_auth_revision_guard
BEFORE UPDATE OF state ON accounts
WHEN NEW.state <> OLD.state AND NEW.auth_revision <> OLD.auth_revision + 1
BEGIN
  SELECT RAISE(ABORT, 'account state change must advance auth revision');
END;

DROP TABLE account_role_migration_guard;

CREATE TABLE invitations (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  token_digest TEXT NOT NULL UNIQUE
    CHECK (
      length(token_digest) = 64
      AND token_digest = lower(token_digest)
      AND token_digest NOT GLOB '*[^0-9a-f]*'
    ),
  created_by_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  expires_at TEXT NOT NULL
    CHECK (length(expires_at) > 0 AND expires_at > created_at),
  consumed_at TEXT,
  consumed_by_account_id TEXT,
  revoked_at TEXT,
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (consumed_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK (
    (consumed_at IS NULL AND consumed_by_account_id IS NULL)
    OR (
      consumed_at IS NOT NULL
      AND consumed_by_account_id IS NOT NULL
      AND consumed_at >= created_at
      AND consumed_at <= expires_at
    )
  ),
  CHECK (revoked_at IS NULL OR (revoked_at >= created_at AND consumed_at IS NULL)),
  CHECK (NOT (consumed_at IS NOT NULL AND revoked_at IS NOT NULL))
) STRICT;

CREATE INDEX invitations_created_by_created_index
  ON invitations(created_by_account_id, created_at DESC, id);

CREATE INDEX invitations_expiry_index
  ON invitations(expires_at, id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
