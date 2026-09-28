import type { DerivedComputeErrorCode, DerivedComputeJobKind, DerivedComputeJobState } from "@academiccloud/compute-contracts";

import type { DerivedJobOrigin, DerivedJobPriority, DerivedJobRecord, NewDerivedJob } from "../../jobs/job.js";
import type { DerivedJobRepository } from "../../jobs/repositories.js";
import type { SqliteDatabase } from "./database.js";

interface JobRow {
  id: string;
  kind: DerivedComputeJobKind;
  scope_id: string;
  resource_id: string;
  input_version: string;
  idempotency_key: string;
  state: DerivedComputeJobState;
  progress: number;
  attempts: number;
  active_attempt_id: string | null;
  provider: string | null;
  provider_job_id: string | null;
  capability_token_hash: string | null;
  capability_expires_at: string | null;
  compute_worker_id: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  result_ref: string | null;
  result_digest: string | null;
  error_code: DerivedComputeErrorCode | null;
  created_by_account_id: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  deadline_at: string;
  queue_priority: DerivedJobPriority;
  origin: DerivedJobOrigin;
}

const SELECT = `
SELECT id, kind, scope_id, resource_id, input_version, idempotency_key, state, progress,
  attempts, active_attempt_id, provider, provider_job_id, capability_token_hash,
  capability_expires_at, compute_worker_id, lease_expires_at, last_heartbeat_at,
  result_ref, result_digest, error_code, created_by_account_id,
  created_at, updated_at, started_at, finished_at, deadline_at, queue_priority, origin
FROM derived_compute_jobs`;

function date(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function map(row: JobRow): DerivedJobRecord {
  return {
    id: row.id,
    kind: row.kind,
    scopeId: row.scope_id,
    resourceId: row.resource_id,
    inputVersion: row.input_version,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    progress: row.progress,
    attempts: row.attempts,
    activeAttemptId: row.active_attempt_id,
    provider: row.provider,
    providerJobId: row.provider_job_id,
    capabilityTokenHash: row.capability_token_hash,
    capabilityExpiresAt: date(row.capability_expires_at),
    computeWorkerId: row.compute_worker_id,
    leaseExpiresAt: date(row.lease_expires_at),
    lastHeartbeatAt: date(row.last_heartbeat_at),
    resultRef: row.result_ref,
    resultDigest: row.result_digest,
    errorCode: row.error_code,
    createdByAccountId: row.created_by_account_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    startedAt: date(row.started_at),
    finishedAt: date(row.finished_at),
    deadlineAt: new Date(row.deadline_at),
    queuePriority: row.queue_priority,
    origin: row.origin,
  };
}

export class SqliteDerivedJobRepository implements DerivedJobRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(job: NewDerivedJob): DerivedJobRecord {
    this.database.prepare(`
      INSERT INTO derived_compute_jobs (
        id, kind, scope_id, resource_id, input_version, idempotency_key, state,
        progress, attempts, active_attempt_id, created_by_account_id, created_at,
        updated_at, deadline_at, queue_priority, origin
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, 1, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.kind,
      job.scopeId,
      job.resourceId,
      job.inputVersion,
      job.idempotencyKey,
      job.attemptId,
      job.createdByAccountId,
      job.createdAt.toISOString(),
      job.createdAt.toISOString(),
      job.deadlineAt.toISOString(),
      job.queuePriority ?? 10,
      job.origin ?? "interactive",
    );
    return this.findById(job.id)!;
  }

  findById(jobId: string): DerivedJobRecord | null {
    const row = this.database.prepare<[string], JobRow>(`${SELECT} WHERE id = ?`).get(jobId);
    return row ? map(row) : null;
  }

  findByIdempotencyKey(idempotencyKey: string): DerivedJobRecord | null {
    const row = this.database.prepare<[string], JobRow>(`${SELECT} WHERE idempotency_key = ?`).get(idempotencyKey);
    return row ? map(row) : null;
  }

  findLatest(kind: "metadata_suggestion", scopeId: string, resourceId: string): DerivedJobRecord | null {
    const row = this.database.prepare<[string, string, string], JobRow>(`
      ${SELECT}
      WHERE kind = ? AND scope_id = ? AND resource_id = ?
      -- A newly queued/running generation is the current user-visible state.
      -- Terminal history remains available through the job-id endpoint, but an
      -- old failure must never mask a newer retry.
      ORDER BY CASE WHEN state IN ('queued', 'running') THEN 0 ELSE 1 END,
        created_at DESC, id DESC
      LIMIT 1
    `).get(kind, scopeId, resourceId);
    return row ? map(row) : null;
  }

  hasSucceeded(kind: "metadata_suggestion", scopeId: string, resourceId: string): boolean {
    return this.database.prepare<[string, string, string], { found: number }>(`
      SELECT 1 AS found FROM derived_compute_jobs
      WHERE kind = ? AND scope_id = ? AND resource_id = ? AND state = 'succeeded'
      LIMIT 1
    `).get(kind, scopeId, resourceId) !== undefined;
  }

  findLatestMany(kind: "metadata_suggestion", scopeId: string, resourceIds: string[]): DerivedJobRecord[] {
    if (resourceIds.length === 0) return [];
    const rows = this.database.prepare<[string, string, string], JobRow>(`
      SELECT id, kind, scope_id, resource_id, input_version, idempotency_key, state, progress,
        attempts, active_attempt_id, provider, provider_job_id, capability_token_hash,
        capability_expires_at, compute_worker_id, lease_expires_at, last_heartbeat_at,
        result_ref, result_digest, error_code, created_by_account_id,
        created_at, updated_at, started_at, finished_at, deadline_at, queue_priority, origin
      FROM (
        SELECT derived_compute_jobs.*,
          ROW_NUMBER() OVER (
            PARTITION BY resource_id
            ORDER BY CASE WHEN state IN ('queued', 'running') THEN 0 ELSE 1 END,
              created_at DESC, id DESC
          ) AS current_rank
        FROM derived_compute_jobs
        WHERE kind = ? AND scope_id = ?
          AND resource_id IN (SELECT value FROM json_each(?))
      )
      WHERE current_rank = 1
    `).all(kind, scopeId, JSON.stringify(resourceIds));
    return rows.map(map);
  }

  listUndispatched(limit: number): DerivedJobRecord[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("invalid derived job limit");
    return this.database.prepare<[number], JobRow>(`
      ${SELECT}
      WHERE state = 'queued' AND provider_job_id IS NULL
      ORDER BY queue_priority ASC, created_at ASC, id ASC
      LIMIT ?
    `).all(limit).map(map);
  }

  listLocalPullCandidates(limit: number): DerivedJobRecord[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("invalid derived job limit");
    return this.database.prepare<[number], JobRow>(`
      ${SELECT}
      WHERE state = 'queued' AND provider = 'local_pull' AND provider_job_id IS NOT NULL
      ORDER BY queue_priority ASC, created_at ASC, id ASC
      LIMIT ?
    `).all(limit).map(map);
  }

  listExpiredLocalPullLeases(now: Date, limit: number): DerivedJobRecord[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("invalid derived job limit");
    return this.database.prepare<[string, string, number], JobRow>(`
      ${SELECT}
      WHERE state = 'running' AND provider = 'local_pull'
        AND lease_expires_at IS NOT NULL AND lease_expires_at <= ? AND deadline_at > ?
      ORDER BY lease_expires_at ASC, id ASC
      LIMIT ?
    `).all(now.toISOString(), now.toISOString(), limit).map(map);
  }

  retry(jobId: string, expectedAttemptId: string, nextAttemptId: string, now: Date, deadlineAt: Date): DerivedJobRecord | null {
    const result = this.database.prepare(`
      UPDATE derived_compute_jobs
      SET state = 'queued', progress = 0, attempts = attempts + 1,
        active_attempt_id = ?, provider = NULL, provider_job_id = NULL,
        capability_token_hash = NULL, capability_expires_at = NULL,
        compute_worker_id = NULL, lease_expires_at = NULL, last_heartbeat_at = NULL,
        result_ref = NULL, result_digest = NULL, error_code = NULL,
        updated_at = ?, started_at = NULL, finished_at = NULL, deadline_at = ?
      WHERE id = ? AND state = 'failed' AND active_attempt_id = ?
    `).run(nextAttemptId, now.toISOString(), deadlineAt.toISOString(), jobId, expectedAttemptId);
    return result.changes === 1 ? this.findById(jobId) : null;
  }

  recordDispatch(jobId: string, attemptId: string, provider: string, providerJobId: string, now: Date): DerivedJobRecord | null {
    const result = this.database.prepare(`
      UPDATE derived_compute_jobs
      SET provider = ?, provider_job_id = ?, updated_at = ?
      WHERE id = ? AND state = 'queued' AND active_attempt_id = ?
        AND provider_job_id IS NULL
    `).run(provider, providerJobId, now.toISOString(), jobId, attemptId);
    return result.changes === 1 ? this.findById(jobId) : null;
  }

  claim(jobId: string, attemptId: string, capabilityTokenHash: string, capabilityExpiresAt: Date, now: Date): DerivedJobRecord | null {
    const result = this.database.prepare(`
      UPDATE derived_compute_jobs
      SET state = 'running', progress = 5, capability_token_hash = ?, capability_expires_at = ?,
        updated_at = ?, started_at = ?, finished_at = NULL
      WHERE id = ? AND state = 'queued' AND active_attempt_id = ?
        AND deadline_at > ?
    `).run(
      capabilityTokenHash,
      capabilityExpiresAt.toISOString(),
      now.toISOString(),
      now.toISOString(),
      jobId,
      attemptId,
      now.toISOString(),
    );
    return result.changes === 1 ? this.findById(jobId) : null;
  }

  claimLocal(
    jobId: string,
    attemptId: string,
    workerId: string,
    capabilityTokenHash: string,
    capabilityExpiresAt: Date,
    leaseExpiresAt: Date,
    now: Date,
  ): DerivedJobRecord | null {
    const result = this.database.prepare(`
      UPDATE derived_compute_jobs
      SET state = 'running', progress = 5, capability_token_hash = ?, capability_expires_at = ?,
        compute_worker_id = ?, lease_expires_at = ?, last_heartbeat_at = ?,
        updated_at = ?, started_at = ?, finished_at = NULL
      WHERE id = ? AND state = 'queued' AND active_attempt_id = ?
        AND provider = 'local_pull' AND provider_job_id IS NOT NULL AND deadline_at > ?
    `).run(
      capabilityTokenHash,
      capabilityExpiresAt.toISOString(),
      workerId,
      leaseExpiresAt.toISOString(),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
      jobId,
      attemptId,
      now.toISOString(),
    );
    return result.changes === 1 ? this.findById(jobId) : null;
  }

  heartbeatLocal(
    jobId: string,
    attemptId: string,
    workerId: string,
    capabilityExpiresAt: Date,
    leaseExpiresAt: Date,
    now: Date,
  ): DerivedJobRecord | null {
    const result = this.database.prepare(`
      UPDATE derived_compute_jobs
      SET capability_expires_at = ?, lease_expires_at = ?, last_heartbeat_at = ?, updated_at = ?
      WHERE id = ? AND state = 'running' AND active_attempt_id = ?
        AND provider = 'local_pull' AND compute_worker_id = ?
        AND lease_expires_at > ? AND deadline_at > ?
    `).run(
      capabilityExpiresAt.toISOString(),
      leaseExpiresAt.toISOString(),
      now.toISOString(),
      now.toISOString(),
      jobId,
      attemptId,
      workerId,
      now.toISOString(),
      now.toISOString(),
    );
    return result.changes === 1 ? this.findById(jobId) : null;
  }

  recoverExpiredLocalLease(jobId: string, expectedAttemptId: string, nextAttemptId: string, now: Date): DerivedJobRecord | null {
    const result = this.database.prepare(`
      UPDATE derived_compute_jobs
      SET state = 'queued', progress = 0, attempts = attempts + 1,
        active_attempt_id = ?, provider = NULL, provider_job_id = NULL,
        capability_token_hash = NULL, capability_expires_at = NULL,
        compute_worker_id = NULL, lease_expires_at = NULL, last_heartbeat_at = NULL,
        result_ref = NULL, result_digest = NULL, error_code = NULL,
        updated_at = ?, started_at = NULL, finished_at = NULL
      WHERE id = ? AND state = 'running' AND active_attempt_id = ?
        AND provider = 'local_pull' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
        AND deadline_at > ?
    `).run(
      nextAttemptId,
      now.toISOString(),
      jobId,
      expectedAttemptId,
      now.toISOString(),
      now.toISOString(),
    );
    return result.changes === 1 ? this.findById(jobId) : null;
  }

  succeed(jobId: string, attemptId: string, resultRef: string, resultDigest: string, now: Date): DerivedJobRecord | null {
    const existing = this.findById(jobId);
    if (existing?.state === "succeeded" && existing.activeAttemptId === attemptId
      && existing.resultRef === resultRef && existing.resultDigest === resultDigest) return existing;
    const result = this.database.prepare(`
      UPDATE derived_compute_jobs
      SET state = 'succeeded', progress = 100, result_ref = ?, result_digest = ?,
        updated_at = ?, finished_at = ?, error_code = NULL, lease_expires_at = NULL
      WHERE id = ? AND state = 'running' AND active_attempt_id = ?
    `).run(resultRef, resultDigest, now.toISOString(), now.toISOString(), jobId, attemptId);
    return result.changes === 1 ? this.findById(jobId) : null;
  }

  fail(jobId: string, attemptId: string, errorCode: DerivedComputeErrorCode, now: Date): DerivedJobRecord | null {
    const existing = this.findById(jobId);
    if (existing?.state === "failed" && existing.activeAttemptId === attemptId && existing.errorCode === errorCode) return existing;
    const result = this.database.prepare(`
      UPDATE derived_compute_jobs
      SET state = 'failed', progress = CASE WHEN progress > 99 THEN 99 ELSE progress END,
        error_code = ?, updated_at = ?, finished_at = ?, lease_expires_at = NULL
      WHERE id = ? AND state IN ('queued', 'running') AND active_attempt_id = ?
    `).run(errorCode, now.toISOString(), now.toISOString(), jobId, attemptId);
    return result.changes === 1 ? this.findById(jobId) : null;
  }

  expireDue(now: Date): number {
    return this.database.prepare(`
      UPDATE derived_compute_jobs
      SET state = 'failed', progress = CASE WHEN progress > 99 THEN 99 ELSE progress END,
        error_code = 'compute_timeout', updated_at = ?, finished_at = ?, lease_expires_at = NULL
      WHERE state IN ('queued', 'running') AND deadline_at <= ?
    `).run(now.toISOString(), now.toISOString(), now.toISOString()).changes;
  }
}
