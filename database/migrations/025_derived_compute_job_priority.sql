PRAGMA foreign_keys = ON;

-- Existing jobs are foreground work. Historical backfill, when separately
-- authorized, can be persisted as low-priority queued work and resumed by the
-- same bounded reconciler without competing with admissions or retries.
ALTER TABLE derived_compute_jobs
  ADD COLUMN queue_priority INTEGER NOT NULL DEFAULT 10
    CHECK (queue_priority IN (10, 100));

ALTER TABLE derived_compute_jobs
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'interactive'
    CHECK (origin IN ('admission', 'interactive', 'backfill'));

CREATE INDEX derived_compute_jobs_queue_idx
  ON derived_compute_jobs(state, queue_priority, created_at, id)
  WHERE state = 'queued';
