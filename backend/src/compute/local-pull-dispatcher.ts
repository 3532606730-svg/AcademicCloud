import type {
  DerivedComputeDispatchJob,
  DerivedComputeDispatcher,
  DerivedComputeDispatchReceipt,
} from "@academiccloud/compute-contracts";

const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/u;

/**
 * Local Pull dispatch is a durable routing receipt, not an external launch.
 * The outbound-only worker later claims the attempt from Core.
 */
export class LocalPullComputeDispatcher implements DerivedComputeDispatcher {
  async dispatch(job: DerivedComputeDispatchJob): Promise<DerivedComputeDispatchReceipt> {
    if (!IDENTIFIER.test(job.id) || !IDENTIFIER.test(job.attemptId)) {
      throw new Error("Local Pull compute identity is invalid");
    }
    return {
      provider: "local_pull",
      providerJobId: `local-pull:${job.attemptId}`,
    };
  }
}
