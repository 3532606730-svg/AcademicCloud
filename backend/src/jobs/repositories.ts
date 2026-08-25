import type { DerivedComputeErrorCode } from "@academiccloud/compute-contracts";

import type { DerivedJobRecord, NewDerivedJob } from "./job.js";

export interface DerivedJobRepository {
  create(job: NewDerivedJob): DerivedJobRecord;
  findById(jobId: string): DerivedJobRecord | null;
  findByIdempotencyKey(idempotencyKey: string): DerivedJobRecord | null;
  findLatest(kind: "metadata_suggestion", scopeId: string, resourceId: string): DerivedJobRecord | null;
  findLatestMany(kind: "metadata_suggestion", scopeId: string, resourceIds: string[]): DerivedJobRecord[];
  listUndispatched(limit: number): DerivedJobRecord[];
  listLocalPullCandidates(limit: number): DerivedJobRecord[];
  listExpiredLocalPullLeases(now: Date, limit: number): DerivedJobRecord[];
  retry(jobId: string, expectedAttemptId: string, nextAttemptId: string, now: Date, deadlineAt: Date): DerivedJobRecord | null;
  recordDispatch(jobId: string, attemptId: string, provider: string, providerJobId: string, now: Date): DerivedJobRecord | null;
  claim(jobId: string, attemptId: string, capabilityTokenHash: string, capabilityExpiresAt: Date, now: Date): DerivedJobRecord | null;
  claimLocal(
    jobId: string,
    attemptId: string,
    workerId: string,
    capabilityTokenHash: string,
    capabilityExpiresAt: Date,
    leaseExpiresAt: Date,
    now: Date,
  ): DerivedJobRecord | null;
  heartbeatLocal(
    jobId: string,
    attemptId: string,
    workerId: string,
    capabilityExpiresAt: Date,
    leaseExpiresAt: Date,
    now: Date,
  ): DerivedJobRecord | null;
  recoverExpiredLocalLease(jobId: string, expectedAttemptId: string, nextAttemptId: string, now: Date): DerivedJobRecord | null;
  succeed(jobId: string, attemptId: string, resultRef: string, resultDigest: string, now: Date): DerivedJobRecord | null;
  fail(jobId: string, attemptId: string, errorCode: DerivedComputeErrorCode, now: Date): DerivedJobRecord | null;
  expireDue(now: Date): number;
}
