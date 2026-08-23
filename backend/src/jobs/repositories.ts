import type { DerivedComputeErrorCode } from "@academiccloud/compute-contracts";

import type { DerivedJobRecord, NewDerivedJob } from "./job.js";

export interface DerivedJobRepository {
  create(job: NewDerivedJob): DerivedJobRecord;
  findById(jobId: string): DerivedJobRecord | null;
  findByIdempotencyKey(idempotencyKey: string): DerivedJobRecord | null;
  findLatest(kind: "metadata_suggestion", scopeId: string, resourceId: string): DerivedJobRecord | null;
  listUndispatched(limit: number): DerivedJobRecord[];
  retry(jobId: string, expectedAttemptId: string, nextAttemptId: string, now: Date, deadlineAt: Date): DerivedJobRecord | null;
  recordDispatch(jobId: string, attemptId: string, provider: string, providerJobId: string, now: Date): DerivedJobRecord | null;
  claim(jobId: string, attemptId: string, capabilityTokenHash: string, capabilityExpiresAt: Date, now: Date): DerivedJobRecord | null;
  succeed(jobId: string, attemptId: string, resultRef: string, resultDigest: string, now: Date): DerivedJobRecord | null;
  fail(jobId: string, attemptId: string, errorCode: DerivedComputeErrorCode, now: Date): DerivedJobRecord | null;
  expireDue(now: Date): number;
}
