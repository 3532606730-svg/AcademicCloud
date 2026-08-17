-- RF-LIBRARY01 adds an explicit Shared Library governance and membership
-- plane. Library-owned scholarly resources are represented by the existing
-- ownership_domains substrate; no account-private rows are reinterpreted.

INSERT INTO governance_audit_target_types (target_type)
VALUES ('library');

INSERT INTO governance_audit_event_kinds (kind, target_type)
VALUES
  ('libraries.create', 'library'),
  ('libraries.membership_add', 'library'),
  ('libraries.membership_change', 'library'),
  ('libraries.membership_remove', 'library');

CREATE TABLE libraries (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_domain_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
    CHECK (length(name) BETWEEN 1 AND 255 AND name = trim(name) AND instr(name, char(0)) = 0),
  created_by_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0),
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE library_memberships (
  library_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  role TEXT NOT NULL
    CHECK (role IN ('manager', 'member')),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0),
  PRIMARY KEY (library_id, account_id),
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE RESTRICT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX library_memberships_account_index
  ON library_memberships(account_id, library_id);

CREATE INDEX library_memberships_library_role_index
  ON library_memberships(library_id, role, account_id);

CREATE TRIGGER libraries_owner_domain_guard_insert
BEFORE INSERT ON libraries
WHEN NOT EXISTS (
  SELECT 1 FROM ownership_domains
  WHERE id = NEW.owner_domain_id
    AND kind = 'library'
    AND account_id IS NULL
    AND id = 'library:' || NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'library requires its concrete library ownership domain');
END;

CREATE TRIGGER libraries_owner_domain_immutable
BEFORE UPDATE OF id, owner_domain_id, created_by_account_id ON libraries
WHEN NEW.id <> OLD.id
  OR NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.created_by_account_id <> OLD.created_by_account_id
BEGIN
  SELECT RAISE(ABORT, 'library identity is immutable');
END;

CREATE TRIGGER library_memberships_active_account_guard_insert
BEFORE INSERT ON library_memberships
WHEN NOT EXISTS (
  SELECT 1 FROM accounts
  WHERE accounts.id = NEW.account_id
    AND accounts.state = 'active'
    AND accounts.archived_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'library membership requires an active account');
END;

CREATE TRIGGER library_memberships_identity_immutable
BEFORE UPDATE OF library_id, account_id ON library_memberships
WHEN NEW.library_id <> OLD.library_id OR NEW.account_id <> OLD.account_id
BEGIN
  SELECT RAISE(ABORT, 'library membership identity is immutable');
END;

CREATE TRIGGER library_memberships_last_manager_guard_update
BEFORE UPDATE OF role ON library_memberships
WHEN OLD.role = 'manager'
  AND NEW.role <> 'manager'
  AND NOT EXISTS (
    SELECT 1
    FROM library_memberships
    JOIN accounts ON accounts.id = library_memberships.account_id
    WHERE library_memberships.library_id = OLD.library_id
      AND library_memberships.account_id <> OLD.account_id
      AND library_memberships.role = 'manager'
      AND accounts.state = 'active'
      AND accounts.archived_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'library requires an effective manager');
END;

CREATE TRIGGER library_memberships_last_manager_guard_delete
BEFORE DELETE ON library_memberships
WHEN OLD.role = 'manager'
  AND NOT EXISTS (
    SELECT 1
    FROM library_memberships
    JOIN accounts ON accounts.id = library_memberships.account_id
    WHERE library_memberships.library_id = OLD.library_id
      AND library_memberships.account_id <> OLD.account_id
      AND library_memberships.role = 'manager'
      AND accounts.state = 'active'
      AND accounts.archived_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'library requires an effective manager');
END;

-- An active manager cannot be disabled/archived when that would leave the
-- Library without an effective manager. Membership rows/history remain intact.
CREATE TRIGGER accounts_last_library_manager_guard
BEFORE UPDATE OF state, archived_at ON accounts
WHEN OLD.state = 'active'
  AND OLD.archived_at IS NULL
  AND (NEW.state <> 'active' OR NEW.archived_at IS NOT NULL)
  AND EXISTS (
    SELECT 1
    FROM library_memberships
    WHERE library_memberships.account_id = OLD.id
      AND library_memberships.role = 'manager'
  )
  AND EXISTS (
    SELECT 1
    FROM library_memberships
    JOIN accounts AS manager_accounts ON manager_accounts.id = library_memberships.account_id
    WHERE library_memberships.account_id = OLD.id
      AND library_memberships.role = 'manager'
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

