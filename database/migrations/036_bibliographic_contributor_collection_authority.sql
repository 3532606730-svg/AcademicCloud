-- Contributor membership/order is a decision independently of each surviving
-- person's label or role. In particular, a human-cleared empty list must retain
-- authority after its individual contributor rows have been removed.
CREATE TABLE scholarly_bibliographic_collection_authority (
  record_id TEXT NOT NULL,
  owner_domain_id TEXT NOT NULL,
  field_name TEXT NOT NULL CHECK (field_name = 'contributors'),
  scope_key TEXT NOT NULL DEFAULT '' CHECK (scope_key = ''),
  authority_source TEXT NOT NULL CHECK (authority_source IN ('human', 'ai')),
  source_run_id TEXT,
  actor_account_id TEXT,
  established_at TEXT NOT NULL CHECK (length(established_at) > 0),
  PRIMARY KEY (record_id, field_name, scope_key),
  FOREIGN KEY (record_id, owner_domain_id) REFERENCES scholarly_records(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_run_id, owner_domain_id) REFERENCES scholarly_metadata_suggestion_runs(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK ((authority_source = 'human' AND actor_account_id IS NOT NULL AND source_run_id IS NULL)
    OR (authority_source = 'ai' AND source_run_id IS NOT NULL AND actor_account_id IS NULL))
) STRICT;

CREATE TRIGGER scholarly_bibliographic_collection_authority_identity_immutable
BEFORE UPDATE OF record_id, owner_domain_id, field_name, scope_key
ON scholarly_bibliographic_collection_authority
BEGIN
  SELECT RAISE(ABORT, 'collection authority identity is immutable');
END;
