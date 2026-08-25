import type {
  DerivedComputeErrorCode,
  DerivedComputeJobKind,
  DerivedComputeJobState,
} from "@academiccloud/compute-contracts";

export type DerivedJobOrigin = "admission" | "interactive" | "backfill";
export type DerivedJobPriority = 10 | 100;

export interface DerivedJobRecord {
  id: string;
  kind: DerivedComputeJobKind;
  scopeId: string;
  resourceId: string;
  inputVersion: string;
  idempotencyKey: string;
  state: DerivedComputeJobState;
  progress: number;
  attempts: number;
  activeAttemptId: string | null;
  provider: string | null;
  providerJobId: string | null;
  capabilityTokenHash: string | null;
  capabilityExpiresAt: Date | null;
  computeWorkerId: string | null;
  leaseExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  resultRef: string | null;
  resultDigest: string | null;
  errorCode: DerivedComputeErrorCode | null;
  createdByAccountId: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  deadlineAt: Date;
  queuePriority: DerivedJobPriority;
  origin: DerivedJobOrigin;
}

export interface DerivedJobSummary {
  id: string;
  kind: DerivedComputeJobKind;
  resourceId: string;
  state: DerivedComputeJobState;
  progress: number;
  attempts: number;
  resultRef: string | null;
  errorCode: DerivedComputeErrorCode | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  deadlineAt: string;
  /** Optional for compatibility with older API fakes; server responses include both fields. */
  queuePriority?: DerivedJobPriority;
  origin?: DerivedJobOrigin;
}

export interface NewDerivedJob {
  id: string;
  kind: DerivedComputeJobKind;
  scopeId: string;
  resourceId: string;
  inputVersion: string;
  idempotencyKey: string;
  attemptId: string;
  createdByAccountId: string;
  createdAt: Date;
  deadlineAt: Date;
  queuePriority?: DerivedJobPriority;
  origin?: DerivedJobOrigin;
}

export function publicDerivedJob(job: DerivedJobRecord): DerivedJobSummary {
  return {
    id: job.id,
    kind: job.kind,
    resourceId: job.resourceId,
    state: job.state,
    progress: job.progress,
    attempts: job.attempts,
    resultRef: job.resultRef,
    errorCode: job.errorCode,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    deadlineAt: job.deadlineAt.toISOString(),
    ...(job.queuePriority === undefined ? {} : { queuePriority: job.queuePriority }),
    ...(job.origin === undefined ? {} : { origin: job.origin }),
  };
}
