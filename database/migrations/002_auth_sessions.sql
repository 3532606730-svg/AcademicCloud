CREATE TABLE sessions (
  token_digest TEXT PRIMARY KEY
    CHECK (
      length(token_digest) = 64
      AND token_digest = lower(token_digest)
      AND token_digest NOT GLOB '*[^0-9a-f]*'
    ),
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  expires_at TEXT NOT NULL
    CHECK (length(expires_at) > 0 AND expires_at > created_at),
  revoked_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
) STRICT;

CREATE INDEX sessions_account_id_index ON sessions(account_id);
CREATE INDEX sessions_expires_at_index ON sessions(expires_at);
