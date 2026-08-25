PRAGMA foreign_keys = ON;

ALTER TABLE derived_compute_jobs
  ADD COLUMN compute_worker_id TEXT
    CHECK (
      compute_worker_id IS NULL
      OR (
        length(compute_worker_id) BETWEEN 1 AND 128
        AND compute_worker_id NOT GLOB '*[^A-Za-z0-9_.-]*'
      )
    );

ALTER TABLE derived_compute_jobs
  ADD COLUMN lease_expires_at TEXT;

ALTER TABLE derived_compute_jobs
  ADD COLUMN last_heartbeat_at TEXT;

CREATE INDEX derived_compute_jobs_local_pull_queue_idx
  ON derived_compute_jobs(provider, state, queue_priority, created_at, id)
  WHERE provider = 'local_pull' AND state = 'queued';

CREATE INDEX derived_compute_jobs_local_pull_lease_idx
  ON derived_compute_jobs(provider, state, lease_expires_at)
  WHERE provider = 'local_pull' AND state = 'running';

DROP TRIGGER derived_compute_jobs_transition_guard;

CREATE TRIGGER derived_compute_jobs_transition_guard
BEFORE UPDATE OF state ON derived_compute_jobs
FOR EACH ROW
WHEN OLD.state <> NEW.state
BEGIN
  SELECT CASE
    WHEN OLD.state = 'queued' AND NEW.state IN ('running', 'failed') THEN NULL
    WHEN OLD.state = 'running' AND NEW.state IN ('succeeded', 'failed') THEN NULL
    WHEN OLD.state = 'running' AND NEW.state = 'queued' AND NEW.attempts = OLD.attempts + 1 THEN NULL
    WHEN OLD.state = 'failed' AND NEW.state = 'queued' AND NEW.attempts = OLD.attempts + 1 THEN NULL
    ELSE RAISE(ABORT, 'invalid derived compute job transition')
  END;
END;
