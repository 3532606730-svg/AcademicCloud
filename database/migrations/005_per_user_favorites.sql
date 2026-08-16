-- Per-user favorites: private per-account relationships. A favorite is NOT a
-- file/folder copy, an OSS object, a physical directory, or a global resource
-- boolean — it is a scoped relation row owned by one account.

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

-- Soft deletion deliberately retains the favorite relation (restore
-- resurfaces the item). Only the FINAL purged state removes it reliably and
-- transactionally: the trigger fires on the state transition itself.
CREATE TRIGGER favorite_files_purge_cleanup
AFTER UPDATE OF state ON files
WHEN NEW.state = 'purged'
BEGIN
  DELETE FROM favorite_files WHERE file_id = NEW.id;
END;
