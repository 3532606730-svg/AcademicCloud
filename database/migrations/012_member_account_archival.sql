-- L2-ACCOUNTARCHIVE01 adds a non-destructive logical archived state without
-- rebuilding the heavily referenced accounts table. Persisted state remains
-- active/disabled; archived_at distinguishes archived from ordinary disabled.

ALTER TABLE accounts
  ADD COLUMN archived_at TEXT
  CHECK (
    archived_at IS NULL
    OR (
      state = 'disabled'
      AND length(archived_at) > 0
      AND archived_at = trim(archived_at)
    )
  );

CREATE TRIGGER accounts_archived_guard_insert
BEFORE INSERT ON accounts
WHEN NEW.archived_at IS NOT NULL
  AND (NEW.role <> 'member' OR NEW.state <> 'disabled')
BEGIN
  SELECT RAISE(ABORT, 'only a disabled member may be archived');
END;

CREATE TRIGGER accounts_archived_guard_update
BEFORE UPDATE OF state, role, archived_at ON accounts
WHEN
  (
    NEW.archived_at IS NOT NULL
    AND (NEW.role <> 'member' OR NEW.state <> 'disabled')
  )
  OR (
    NEW.archived_at IS NOT OLD.archived_at
    AND (
      OLD.state <> 'disabled'
      OR NEW.state <> 'disabled'
      OR NEW.role <> 'member'
      OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS NOT NULL)
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'account archival requires a disabled member transition');
END;

CREATE TRIGGER accounts_archive_auth_revision_guard
BEFORE UPDATE OF archived_at ON accounts
WHEN NEW.archived_at IS NOT OLD.archived_at
  AND NEW.auth_revision <> OLD.auth_revision + 1
BEGIN
  SELECT RAISE(ABORT, 'account archive change must advance auth revision');
END;
