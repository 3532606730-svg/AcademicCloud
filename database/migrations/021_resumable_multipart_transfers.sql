-- RF-TRANSFER01 persists only the minimum server-authoritative multipart
-- lifecycle. File bytes, local paths, signed URLs, credentials, and raw part
-- payloads remain outside SQLite.

CREATE TABLE multipart_uploads (
  file_id TEXT PRIMARY KEY,
  owner_domain_id TEXT NOT NULL,
  storage_provider TEXT NOT NULL
    CHECK (length(storage_provider) BETWEEN 1 AND 64 AND storage_provider = trim(storage_provider)),
  provider_upload_id TEXT NOT NULL
    CHECK (length(provider_upload_id) BETWEEN 1 AND 512 AND provider_upload_id = trim(provider_upload_id)
      AND instr(provider_upload_id, char(0)) = 0),
  part_size_bytes INTEGER NOT NULL
    CHECK (part_size_bytes BETWEEN 102400 AND 5368709120),
  total_parts INTEGER NOT NULL
    CHECK (total_parts BETWEEN 1 AND 10000),
  state TEXT NOT NULL
    CHECK (state IN ('uploading', 'paused', 'completing', 'abandoning')),
  revision INTEGER NOT NULL DEFAULT 0
    CHECK (revision >= 0),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0),
  expires_at TEXT NOT NULL
    CHECK (length(expires_at) > 0),
  UNIQUE (storage_provider, provider_upload_id),
  FOREIGN KEY (file_id, owner_domain_id)
    REFERENCES files(id, owner_domain_id) ON DELETE CASCADE,
  CHECK (updated_at >= created_at),
  CHECK (expires_at > created_at)
) STRICT;

CREATE INDEX multipart_uploads_stale_idx
  ON multipart_uploads (expires_at, updated_at, owner_domain_id, file_id);

INSERT INTO governance_audit_event_kinds (kind, target_type) VALUES
  ('drive.upload_abandon', 'file');
