PRAGMA foreign_keys = ON;

CREATE TABLE derived_compute_jobs (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
  kind TEXT NOT NULL
    CHECK (kind IN ('metadata_suggestion')),
  scope_id TEXT NOT NULL
    CHECK (length(scope_id) BETWEEN 1 AND 128),
  resource_id TEXT NOT NULL
    CHECK (length(resource_id) BETWEEN 1 AND 128),
  input_version TEXT NOT NULL
    CHECK (length(input_version) BETWEEN 1 AND 128),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (length(idempotency_key) BETWEEN 32 AND 128),
  state TEXT NOT NULL
    CHECK (state IN ('queued', 'running', 'succeeded', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0
    CHECK (progress BETWEEN 0 AND 100),
  attempts INTEGER NOT NULL DEFAULT 0
    CHECK (attempts BETWEEN 0 AND 100),
  active_attempt_id TEXT
    CHECK (active_attempt_id IS NULL OR (length(active_attempt_id) BETWEEN 1 AND 128 AND active_attempt_id NOT GLOB '*[^A-Za-z0-9_-]*')),
  provider TEXT
    CHECK (provider IS NULL OR length(provider) BETWEEN 1 AND 64),
  provider_job_id TEXT
    CHECK (provider_job_id IS NULL OR length(provider_job_id) BETWEEN 1 AND 256),
  capability_token_hash TEXT
    CHECK (capability_token_hash IS NULL OR length(capability_token_hash) = 64),
  capability_expires_at TEXT,
  result_ref TEXT
    CHECK (result_ref IS NULL OR length(result_ref) BETWEEN 1 AND 128),
  result_digest TEXT
    CHECK (result_digest IS NULL OR length(result_digest) = 64),
  error_code TEXT
    CHECK (error_code IS NULL OR error_code IN (
      'compute_dispatch_failed',
      'compute_source_stale',
      'compute_source_unavailable',
      'compute_timeout',
      'compute_limit_exceeded',
      'compute_invalid_pdf',
      'compute_unsupported',
      'compute_ocr_unavailable',
      'compute_invalid_result',
      'compute_authorization_changed',
      'compute_internal_error'
    )),
  created_by_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  deadline_at TEXT NOT NULL,
  CHECK (
    (state = 'queued' AND progress BETWEEN 0 AND 99 AND finished_at IS NULL AND error_code IS NULL)
    OR (state = 'running' AND progress BETWEEN 0 AND 99 AND started_at IS NOT NULL AND finished_at IS NULL AND error_code IS NULL)
    OR (state = 'succeeded' AND progress = 100 AND started_at IS NOT NULL AND finished_at IS NOT NULL AND error_code IS NULL AND result_ref IS NOT NULL AND result_digest IS NOT NULL)
    OR (state = 'failed' AND progress BETWEEN 0 AND 99 AND finished_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX derived_compute_jobs_resource_idx
  ON derived_compute_jobs(kind, scope_id, resource_id, created_at DESC, id DESC);

CREATE INDEX derived_compute_jobs_deadline_idx
  ON derived_compute_jobs(state, deadline_at)
  WHERE state IN ('queued', 'running');

CREATE TRIGGER derived_compute_jobs_transition_guard
BEFORE UPDATE OF state ON derived_compute_jobs
FOR EACH ROW
WHEN OLD.state <> NEW.state
BEGIN
  SELECT CASE
    WHEN OLD.state = 'queued' AND NEW.state IN ('running', 'failed') THEN NULL
    WHEN OLD.state = 'running' AND NEW.state IN ('succeeded', 'failed') THEN NULL
    WHEN OLD.state = 'failed' AND NEW.state = 'queued' AND NEW.attempts = OLD.attempts + 1 THEN NULL
    ELSE RAISE(ABORT, 'invalid derived compute job transition')
  END;
END;
