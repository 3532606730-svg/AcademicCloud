import type { BibliographicReasoner } from "./bibliographic-intelligence.js";
import type { BoundedPdfTextSource } from "./suggestion.js";
import {
  parseWorkerClaim,
  runComputeWorker,
  type ComputeWorkerOutcome,
  type WorkerClaim,
} from "./worker.js";

const WORKER_ID = /^[A-Za-z0-9_.-]{1,128}$/u;
const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const MACHINE_SECRET_MINIMUM = 32;

export type LocalPullWorkerMode = "NORMAL" | "PAUSED" | "BURST";

export interface LocalPullWorkerConfig {
  coreBaseUrl: string;
  workerId: string;
  machineSecret: string;
  mode: LocalPullWorkerMode;
  waitMilliseconds: number;
}

export interface LocalPullClaim extends WorkerClaim {
  lease: { expiresAt: string; heartbeatAfterMilliseconds: number };
}

function exactCoreOrigin(value: string): string {
  const candidate = value.trim();
  const url = new URL(candidate);
  if (url.origin !== candidate || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) {
    throw new Error("Local Pull Core URL must be an exact HTTPS origin outside loopback development");
  }
  return candidate;
}

function machineSecret(value: string): string {
  const candidate = value.trim();
  if (candidate.length < MACHINE_SECRET_MINIMUM || candidate.length > 512 || /[\u0000\r\n]/u.test(candidate)) {
    throw new Error("Local Pull machine secret is invalid");
  }
  return candidate;
}

export function loadLocalPullWorkerConfig(environment: NodeJS.ProcessEnv = process.env): LocalPullWorkerConfig {
  const coreBaseUrl = environment.ACADEMICCLOUD_COMPUTE_CORE_BASE_URL;
  const workerId = environment.ACADEMICCLOUD_COMPUTE_WORKER_ID?.trim();
  const secret = environment.ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET;
  const mode = environment.ACADEMICCLOUD_COMPUTE_MODE?.trim() || "NORMAL";
  if (!coreBaseUrl || !workerId || !secret) throw new Error("Local Pull worker configuration is incomplete");
  if (!WORKER_ID.test(workerId)) throw new Error("Local Pull worker id is invalid");
  if (mode !== "NORMAL" && mode !== "PAUSED" && mode !== "BURST") throw new Error("Local Pull worker mode is invalid");
  return {
    coreBaseUrl: exactCoreOrigin(coreBaseUrl),
    workerId,
    machineSecret: machineSecret(secret),
    mode,
    waitMilliseconds: 20_000,
  };
}

function parseLease(value: unknown): LocalPullClaim["lease"] {
  if (typeof value !== "object" || value === null) throw new Error("Local Pull lease is invalid");
  const lease = value as { expiresAt?: unknown; heartbeatAfterMilliseconds?: unknown };
  const expires = typeof lease.expiresAt === "string" ? Date.parse(lease.expiresAt) : Number.NaN;
  const heartbeatAfterMilliseconds = lease.heartbeatAfterMilliseconds;
  const now = Date.now();
  if (!Number.isFinite(expires) || expires <= now || expires > now + 5 * 60_000
    || typeof heartbeatAfterMilliseconds !== "number" || !Number.isSafeInteger(heartbeatAfterMilliseconds)
    || heartbeatAfterMilliseconds < 1_000 || heartbeatAfterMilliseconds > 60_000) {
    throw new Error("Local Pull lease is invalid");
  }
  return { expiresAt: new Date(expires).toISOString(), heartbeatAfterMilliseconds };
}

export function parseLocalPullClaim(value: unknown): LocalPullClaim {
  if (typeof value !== "object" || value === null) throw new Error("Local Pull claim is invalid");
  const raw = value as Partial<LocalPullClaim>;
  const jobId = raw.job?.id;
  const attemptId = raw.job?.attemptId;
  if (typeof jobId !== "string" || typeof attemptId !== "string"
    || !JOB_ID.test(jobId) || !JOB_ID.test(attemptId)) throw new Error("Local Pull claim identity is invalid");
  const claim = parseWorkerClaim(value, { jobId, attemptId });
  return { ...claim, lease: parseLease(raw.lease) };
}

function authorization(secret: string): Record<string, string> {
  return { authorization: `Bearer ${secret}`, "content-type": "application/json" };
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Local Pull wait was cancelled.", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Local Pull wait was cancelled.", "AbortError"));
    };
    function finish(): void {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function pullLocalClaim(
  config: LocalPullWorkerConfig,
  fetchImplementation: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<LocalPullClaim | null> {
  const response = await fetchImplementation(`${config.coreBaseUrl}/api/internal/compute/pull`, {
    method: "POST",
    headers: authorization(config.machineSecret),
    body: JSON.stringify({ workerId: config.workerId, waitMilliseconds: config.waitMilliseconds }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Local Pull request failed with status ${response.status}`);
  return parseLocalPullClaim(await response.json());
}

async function maintainLease(
  config: LocalPullWorkerConfig,
  claim: LocalPullClaim,
  fetchImplementation: typeof fetch,
  signal: AbortSignal,
  testHeartbeatDelayMilliseconds?: number,
): Promise<void> {
  let leaseExpiresAt = Date.parse(claim.lease.expiresAt);
  const heartbeatDelay = testHeartbeatDelayMilliseconds ?? claim.lease.heartbeatAfterMilliseconds;
  while (!signal.aborted) {
    const remaining = leaseExpiresAt - Date.now();
    if (remaining <= 0) throw new Error("Local Pull lease expired");
    await delay(Math.min(heartbeatDelay, remaining), signal);
    let response: Response | undefined;
    try {
      response = await fetchImplementation(
        `${config.coreBaseUrl}/api/internal/compute/jobs/${encodeURIComponent(claim.job.id)}/heartbeat`,
        {
          method: "POST",
          headers: authorization(config.machineSecret),
          body: JSON.stringify({ attemptId: claim.job.attemptId, workerId: config.workerId }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        },
      );
      if (response.ok) {
        const renewed = parseLease((await response.json() as { lease?: unknown }).lease);
        leaseExpiresAt = Date.parse(renewed.expiresAt);
        continue;
      }
      if (response.status < 500 && response.status !== 429) throw new Error("Local Pull lease was rejected");
    } catch (error: unknown) {
      if (signal.aborted) throw new DOMException("Local Pull heartbeat was cancelled.", "AbortError");
      if (error instanceof Error && error.message === "Local Pull lease was rejected") throw error;
    }
    const retryRemaining = leaseExpiresAt - Date.now();
    if (retryRemaining <= 0) throw new Error("Local Pull lease expired");
    await delay(Math.min(2_000, retryRemaining), signal);
  }
}

export async function runLocalPullIteration(
  config: LocalPullWorkerConfig,
  options: {
    fetchImplementation?: typeof fetch;
    inspector?: BoundedPdfTextSource;
    reasoner?: BibliographicReasoner;
    signal?: AbortSignal;
    /** Test-only: production always uses the Core-issued heartbeat interval. */
    testHeartbeatDelayMilliseconds?: number;
  } = {},
): Promise<ComputeWorkerOutcome | null> {
  if (config.mode === "PAUSED") return null;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const claim = await pullLocalClaim(config, fetchImplementation, options.signal);
  if (!claim) return null;
  const attemptController = new AbortController();
  const heartbeatController = new AbortController();
  const onParentAbort = (): void => attemptController.abort();
  if (options.signal?.aborted) {
    attemptController.abort();
  } else {
    options.signal?.addEventListener("abort", onParentAbort, { once: true });
  }
  let heartbeatError: unknown;
  const heartbeat = maintainLease(
    config,
    claim,
    fetchImplementation,
    heartbeatController.signal,
    options.testHeartbeatDelayMilliseconds,
  ).catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      heartbeatError = error;
      attemptController.abort();
    }
  });
  try {
    const outcome = await runComputeWorker({
      coreBaseUrl: config.coreBaseUrl,
      jobId: claim.job.id,
      attemptId: claim.job.attemptId,
      bootstrapSecret: config.machineSecret,
    }, {
      fetchImplementation,
      ...(options.inspector === undefined ? {} : { inspector: options.inspector }),
      ...(options.reasoner === undefined ? {} : { reasoner: options.reasoner }),
      claim,
      signal: attemptController.signal,
    });
    if (heartbeatError !== undefined) throw heartbeatError;
    return outcome;
  } finally {
    heartbeatController.abort();
    await heartbeat;
    options.signal?.removeEventListener("abort", onParentAbort);
  }
}

export async function runLocalPullWorker(
  config: LocalPullWorkerConfig,
  options: {
    fetchImplementation?: typeof fetch;
    signal?: AbortSignal;
    onEvent?: (event: { event: string; jobId?: string; attemptId?: string; state?: string }) => void;
  } = {},
): Promise<void> {
  while (!options.signal?.aborted) {
    if (config.mode === "PAUSED") {
      await delay(5_000, options.signal);
      continue;
    }
    try {
      const outcome = await runLocalPullIteration(config, {
        ...(options.fetchImplementation === undefined ? {} : { fetchImplementation: options.fetchImplementation }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      if (outcome) {
        options.onEvent?.({
          event: "compute.local_pull.completed",
          jobId: outcome.result.jobId,
          attemptId: outcome.result.attemptId,
          state: outcome.result.state,
        });
      }
    } catch (error: unknown) {
      if (options.signal?.aborted) return;
      options.onEvent?.({ event: error instanceof Error ? "compute.local_pull.iteration_failed" : "compute.local_pull.unknown_failure" });
      await delay(2_000, options.signal);
    }
  }
}
