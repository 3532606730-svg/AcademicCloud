import type { BibliographicReasoner } from "./bibliographic-intelligence.js";
import type { BoundedPdfTextSource } from "./suggestion.js";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  parseWorkerSourceAuthorization,
  parseWorkerClaim,
  runComputeWorker,
  createDefaultComputeWorkerRuntime,
  type ComputeWorkerOutcome,
  type ComputeWorkerNetworkTimeouts,
  type ComputeWorkerRuntime,
  type WorkerClaim,
  type WorkerSourceAuthorization,
} from "./worker.js";
import { boundedNetworkSignal, cancelledBy } from "./network.js";

const WORKER_ID = /^[A-Za-z0-9_.-]{1,128}$/u;
const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const MACHINE_SECRET_MINIMUM = 32;
const PULL_TRANSPORT_MARGIN_MILLISECONDS = 5_000;
const HEARTBEAT_TIMEOUT_MILLISECONDS = 10_000;
const SOURCE_RENEWAL_TIMEOUT_MILLISECONDS = 15_000;
const DEFAULT_IDLE_TTL_MILLISECONDS = 5 * 60_000;
const LEASE_KEEPER_ACTIVE = 0;
const LEASE_KEEPER_EXPIRED = 1;
const LEASE_KEEPER_REJECTED = 2;
const LEASE_KEEPER_FAILED = 3;
const LEASE_KEEPER_STOPPED = 4;

interface LeaseKeeperChildConfig {
  coreBaseUrl: string;
  workerId: string;
  machineSecret: string;
  jobId: string;
  attemptId: string;
  expiresAt: string;
  heartbeatAfterMilliseconds: number;
  timeoutMilliseconds: number;
  testHeartbeatDelayMilliseconds?: number;
}

interface LocalPullLeaseKeeper {
  readonly ready: Promise<void>;
  readonly completed: Promise<void>;
  assertActive(): void | Promise<void>;
  stop(): Promise<void>;
}

export interface LocalPullNetworkTimeouts extends ComputeWorkerNetworkTimeouts {
  pullMilliseconds: number;
  heartbeatMilliseconds: number;
  sourceRenewalMilliseconds: number;
}

export type LocalPullWorkerMode = "NORMAL" | "PAUSED" | "BURST";

export interface LocalPullWorkerConfig {
  coreBaseUrl: string;
  workerId: string;
  machineSecret: string;
  mode: LocalPullWorkerMode;
  waitMilliseconds: number;
  idleTtlMilliseconds: number;
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

function idleTtl(value: string | undefined): number {
  if (value === undefined) return DEFAULT_IDLE_TTL_MILLISECONDS;
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 60_000 || milliseconds > 30 * 60_000) {
    throw new Error("Local Pull runtime idle TTL is invalid");
  }
  return milliseconds;
}

function pullWait(value: string | undefined): number {
  if (value === undefined) return 20_000;
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1_000 || milliseconds > 25_000) {
    throw new Error("Local Pull wait interval is invalid");
  }
  return milliseconds;
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
    waitMilliseconds: pullWait(environment.ACADEMICCLOUD_COMPUTE_PULL_WAIT_MILLISECONDS),
    idleTtlMilliseconds: idleTtl(environment.ACADEMICCLOUD_COMPUTE_IDLE_TTL_MILLISECONDS),
  };
}

export class DemandDrivenComputeRuntimePool {
  readonly #factory: () => ComputeWorkerRuntime;
  readonly #idleTtlMilliseconds: number;
  readonly #onEvent: ((event: { event: string }) => void) | undefined;
  #runtime: ComputeWorkerRuntime | undefined;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  #unloading: Promise<void> | undefined;

  constructor(
    factory: () => ComputeWorkerRuntime,
    idleTtlMilliseconds: number,
    onEvent?: (event: { event: string }) => void,
  ) {
    if (!Number.isSafeInteger(idleTtlMilliseconds) || idleTtlMilliseconds < 1) throw new RangeError("runtime idle TTL is invalid");
    this.#factory = factory;
    this.#idleTtlMilliseconds = idleTtlMilliseconds;
    this.#onEvent = onEvent;
  }

  async use<T>(operation: (runtime: ComputeWorkerRuntime) => Promise<T>): Promise<T> {
    if (this.#unloading) await this.#unloading;
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    const reused = this.#runtime !== undefined;
    const runtime = this.#runtime ?? this.#factory();
    this.#runtime = runtime;
    this.#onEvent?.({ event: reused ? "compute.runtime.reused" : "compute.runtime.started" });
    try {
      return await operation(runtime);
    } finally {
      if (this.#runtime === runtime) {
        this.#idleTimer = setTimeout(() => {
          void this.#unload("compute.runtime.idle_unloaded").catch(() => {
            this.#onEvent?.({ event: "compute.runtime.idle_unload_failed" });
          });
        }, this.#idleTtlMilliseconds);
        this.#idleTimer.unref();
      }
    }
  }

  async invalidate(): Promise<void> {
    await this.#unload("compute.runtime.invalidated");
  }

  async close(): Promise<void> {
    await this.#unload("compute.runtime.closed");
  }

  async #unload(event: string): Promise<void> {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    if (this.#unloading) return this.#unloading;
    const runtime = this.#runtime;
    this.#runtime = undefined;
    if (!runtime) return;
    this.#unloading = runtime.close()
      .then(() => { this.#onEvent?.({ event }); })
      .finally(() => { this.#unloading = undefined; });
    return this.#unloading;
  }
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
  timeoutMilliseconds = config.waitMilliseconds + PULL_TRANSPORT_MARGIN_MILLISECONDS,
): Promise<LocalPullClaim | null> {
  let response: Response;
  try {
    response = await fetchImplementation(`${config.coreBaseUrl}/api/internal/compute/pull`, {
      method: "POST",
      headers: authorization(config.machineSecret),
      body: JSON.stringify({ workerId: config.workerId, waitMilliseconds: config.waitMilliseconds }),
      signal: boundedNetworkSignal(signal, timeoutMilliseconds),
    });
  } catch (error: unknown) {
    if (signal?.aborted) throw cancelledBy(signal);
    throw error;
  }
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Local Pull request failed with status ${response.status}`);
  return parseLocalPullClaim(await response.json());
}

export async function renewLocalSourceAuthorization(
  config: LocalPullWorkerConfig,
  claim: LocalPullClaim,
  fetchImplementation: typeof fetch = fetch,
  signal?: AbortSignal,
  timeoutMilliseconds = SOURCE_RENEWAL_TIMEOUT_MILLISECONDS,
): Promise<WorkerSourceAuthorization> {
  let response: Response;
  try {
    response = await fetchImplementation(
      `${config.coreBaseUrl}/api/internal/compute/jobs/${encodeURIComponent(claim.job.id)}/source`,
      {
        method: "POST",
        headers: authorization(config.machineSecret),
        body: JSON.stringify({ attemptId: claim.job.attemptId, workerId: config.workerId }),
        signal: boundedNetworkSignal(signal, timeoutMilliseconds),
      },
    );
  } catch (error: unknown) {
    if (signal?.aborted) throw cancelledBy(signal);
    throw error;
  }
  if (!response.ok) throw new Error(`Local Pull source renewal failed with status ${response.status}`);
  const payload = await response.json() as { source?: unknown };
  return parseWorkerSourceAuthorization(payload.source, claim.source.sizeBytes);
}

async function maintainLease(
  config: LocalPullWorkerConfig,
  claim: LocalPullClaim,
  fetchImplementation: typeof fetch,
  signal: AbortSignal,
  testHeartbeatDelayMilliseconds?: number,
  timeoutMilliseconds = HEARTBEAT_TIMEOUT_MILLISECONDS,
): Promise<void> {
  let leaseExpiresAt = Date.parse(claim.lease.expiresAt);
  const heartbeatDelay = testHeartbeatDelayMilliseconds ?? claim.lease.heartbeatAfterMilliseconds;
  while (!signal.aborted) {
    const remaining = leaseExpiresAt - Date.now();
    if (remaining <= 0) throw new Error("Local Pull lease expired");
    await delay(Math.min(heartbeatDelay, remaining), signal);
    const requestRemaining = leaseExpiresAt - Date.now();
    if (requestRemaining <= 0) throw new Error("Local Pull lease expired");
    let response: Response | undefined;
    try {
      response = await fetchImplementation(
        `${config.coreBaseUrl}/api/internal/compute/jobs/${encodeURIComponent(claim.job.id)}/heartbeat`,
        {
          method: "POST",
          headers: authorization(config.machineSecret),
          body: JSON.stringify({ attemptId: claim.job.attemptId, workerId: config.workerId }),
          signal: boundedNetworkSignal(signal, Math.min(timeoutMilliseconds, requestRemaining)),
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

function leaseKeeperError(state: number): Error {
  if (state === LEASE_KEEPER_EXPIRED) return new Error("Local Pull lease expired");
  if (state === LEASE_KEEPER_REJECTED) return new Error("Local Pull lease was rejected");
  return new Error("Local Pull lease keeper failed");
}

class InlineLocalPullLeaseKeeper implements LocalPullLeaseKeeper {
  readonly #controller = new AbortController();
  #error: unknown;
  #stopping = false;
  readonly ready = Promise.resolve();
  readonly completed: Promise<void>;

  constructor(
    config: LocalPullWorkerConfig,
    claim: LocalPullClaim,
    fetchImplementation: typeof fetch,
    testHeartbeatDelayMilliseconds: number | undefined,
    timeoutMilliseconds: number,
  ) {
    this.completed = maintainLease(
      config,
      claim,
      fetchImplementation,
      this.#controller.signal,
      testHeartbeatDelayMilliseconds,
      timeoutMilliseconds,
    ).catch((error: unknown) => {
      if (this.#stopping && error instanceof DOMException && error.name === "AbortError") return;
      this.#error = error;
      throw error;
    });
  }

  assertActive(): void {
    if (this.#error !== undefined) throw this.#error;
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#controller.abort();
    await this.completed;
  }
}

class ProcessLocalPullLeaseKeeper implements LocalPullLeaseKeeper {
  #state = LEASE_KEEPER_ACTIVE;
  readonly #child: ChildProcess;
  #settled = false;
  #readySettled = false;
  #spawned = false;
  #nextProbeId = 1;
  readonly #probes = new Map<number, { resolve: () => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  readonly ready: Promise<void>;
  readonly completed: Promise<void>;
  readonly #resolveReady: () => void;
  readonly #rejectReady: (error: unknown) => void;
  readonly #resolve: () => void;
  readonly #reject: (error: unknown) => void;

  constructor(
    config: LocalPullWorkerConfig,
    claim: LocalPullClaim,
    timeoutMilliseconds: number,
    testHeartbeatDelayMilliseconds?: number,
  ) {
    let resolveReady!: () => void;
    let rejectReady!: (error: unknown) => void;
    this.ready = new Promise<void>((onResolve, onReject) => {
      resolveReady = onResolve;
      rejectReady = onReject;
    });
    this.#resolveReady = resolveReady;
    this.#rejectReady = rejectReady;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    this.completed = new Promise<void>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    this.#resolve = resolve;
    this.#reject = reject;
    const data: LeaseKeeperChildConfig = {
      coreBaseUrl: config.coreBaseUrl,
      workerId: config.workerId,
      machineSecret: config.machineSecret,
      jobId: claim.job.id,
      attemptId: claim.job.attemptId,
      expiresAt: claim.lease.expiresAt,
      heartbeatAfterMilliseconds: claim.lease.heartbeatAfterMilliseconds,
      timeoutMilliseconds,
      ...(testHeartbeatDelayMilliseconds === undefined ? {} : { testHeartbeatDelayMilliseconds }),
    };
    const childModule = import.meta.url.endsWith(".ts")
      ? new URL("./lease-keeper-child.ts", import.meta.url)
      : new URL("./lease-keeper-child.js", import.meta.url);
    this.#child = fork(fileURLToPath(childModule), [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: {
        PATH: process.env.PATH,
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        NODE_ENV: "production",
      },
    });
    this.#child.on("message", (message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      const type = (message as { type?: unknown }).type;
      if (type === "ready" && !this.#readySettled) {
        this.#readySettled = true;
        this.#resolveReady();
      } else if (type === "probe") {
        const id = (message as { id?: unknown }).id;
        if (typeof id !== "number") return;
        const pending = this.#probes.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.#probes.delete(id);
        const state = this.#parseChildState((message as { state?: unknown }).state);
        if (state === LEASE_KEEPER_ACTIVE) pending.resolve();
        else {
          this.#state = state;
          pending.reject(leaseKeeperError(state));
        }
      } else if (type === "failed") {
        this.#state = this.#parseChildState((message as { state?: unknown }).state);
        this.#settleFailure();
      }
    });
    this.#child.once("spawn", () => { this.#spawned = true; });
    this.#child.on("error", () => {
      if (this.#state === LEASE_KEEPER_STOPPED) return;
      if (!this.#spawned) {
        this.#state = LEASE_KEEPER_FAILED;
        this.#settleFailure();
      } else if (this.#state !== LEASE_KEEPER_ACTIVE) {
        this.#settleFailure();
      }
    });
    this.#child.once("exit", (code) => {
      if (this.#settled) return;
      if (this.#state === LEASE_KEEPER_STOPPED) this.#settleSuccess();
      else {
        if (this.#state === LEASE_KEEPER_ACTIVE) {
          this.#state = code === 21 ? LEASE_KEEPER_EXPIRED
            : code === 22 ? LEASE_KEEPER_REJECTED
              : LEASE_KEEPER_FAILED;
        }
        this.#settleFailure();
      }
    });
    this.#child.send({ type: "start", config: data }, (error) => {
      if (!error || this.#settled) return;
      this.#state = LEASE_KEEPER_FAILED;
      this.#settleFailure();
    });
  }

  async assertActive(): Promise<void> {
    if (this.#state !== LEASE_KEEPER_ACTIVE) throw leaseKeeperError(this.#state);
    const id = this.#nextProbeId;
    this.#nextProbeId += 1;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#probes.delete(id);
        this.#state = LEASE_KEEPER_FAILED;
        reject(leaseKeeperError(this.#state));
      }, 5_000);
      timer.unref();
      this.#probes.set(id, { resolve, reject, timer });
      this.#child.send({ type: "probe", id }, (error) => {
        if (!error) return;
        // The child may have already encoded an exact lease failure in its
        // exit status. Keep the probe pending for that exit event; its bounded
        // timer remains the fallback for a genuinely wedged IPC channel.
      });
    });
    if (this.#state !== LEASE_KEEPER_ACTIVE) throw leaseKeeperError(this.#state);
  }

  async stop(): Promise<void> {
    if (this.#state === LEASE_KEEPER_ACTIVE) this.#state = LEASE_KEEPER_STOPPED;
    if (this.#child.connected) this.#child.send({ type: "stop" });
    const killTimer = setTimeout(() => this.#child.kill("SIGKILL"), 2_000);
    killTimer.unref();
    try {
      await this.completed;
    } finally {
      clearTimeout(killTimer);
    }
  }

  #settleSuccess(): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#resolve();
  }

  #settleFailure(): void {
    if (this.#settled) return;
    const error = leaseKeeperError(this.#state);
    if (!this.#readySettled) {
      this.#readySettled = true;
      this.#rejectReady(error);
    }
    this.#settled = true;
    for (const pending of this.#probes.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#probes.clear();
    this.#reject(error);
  }

  #parseChildState(value: unknown): number {
    if (value === "active") return LEASE_KEEPER_ACTIVE;
    if (value === "expired") return LEASE_KEEPER_EXPIRED;
    if (value === "rejected") return LEASE_KEEPER_REJECTED;
    return LEASE_KEEPER_FAILED;
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
    /** Injected transports use inline scheduling unless a real process-isolated keeper is explicitly required. */
    leaseKeeperMode?: "process" | "inline";
    networkTimeouts?: Partial<LocalPullNetworkTimeouts>;
    runtimePool?: DemandDrivenComputeRuntimePool;
  } = {},
): Promise<ComputeWorkerOutcome | null> {
  if (config.mode === "PAUSED") return null;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const networkTimeouts: LocalPullNetworkTimeouts = {
    pullMilliseconds: config.waitMilliseconds + PULL_TRANSPORT_MARGIN_MILLISECONDS,
    heartbeatMilliseconds: HEARTBEAT_TIMEOUT_MILLISECONDS,
    sourceRenewalMilliseconds: SOURCE_RENEWAL_TIMEOUT_MILLISECONDS,
    coreRequestMilliseconds: 15_000,
    sourceRangeMilliseconds: 45_000,
    ...options.networkTimeouts,
  };
  const claim = await pullLocalClaim(config, fetchImplementation, options.signal, networkTimeouts.pullMilliseconds);
  if (!claim) return null;
  const attemptController = new AbortController();
  const onParentAbort = (): void => attemptController.abort();
  if (options.signal?.aborted) {
    attemptController.abort();
  } else {
    options.signal?.addEventListener("abort", onParentAbort, { once: true });
  }
  const leaseKeeperMode = options.leaseKeeperMode ?? (options.fetchImplementation === undefined ? "process" : "inline");
  const leaseKeeper: LocalPullLeaseKeeper = leaseKeeperMode === "process"
    ? new ProcessLocalPullLeaseKeeper(
        config,
        claim,
        networkTimeouts.heartbeatMilliseconds,
        options.testHeartbeatDelayMilliseconds,
      )
    : new InlineLocalPullLeaseKeeper(
        config,
        claim,
        fetchImplementation,
        options.testHeartbeatDelayMilliseconds,
        networkTimeouts.heartbeatMilliseconds,
      );
  let leaseError: unknown;
  const leaseCompletion = leaseKeeper.completed.catch((error: unknown) => {
    leaseError = error;
    attemptController.abort();
  });
  let outcome: ComputeWorkerOutcome | undefined;
  let operationError: unknown;
  try {
    await leaseKeeper.ready;
    await leaseKeeper.assertActive();
    const execute = (runtime?: ComputeWorkerRuntime): Promise<ComputeWorkerOutcome> => runComputeWorker({
      coreBaseUrl: config.coreBaseUrl,
      jobId: claim.job.id,
      attemptId: claim.job.attemptId,
      bootstrapSecret: config.machineSecret,
    }, {
      fetchImplementation,
      ...(options.inspector === undefined ? {} : { inspector: options.inspector }),
      ...(options.reasoner === undefined ? {} : { reasoner: options.reasoner }),
      ...(runtime === undefined ? {} : {
        inspector: runtime.inspector,
        ...(runtime.reasoner === undefined ? {} : { reasoner: runtime.reasoner }),
        retainRuntime: true,
      }),
      claim,
      signal: attemptController.signal,
      sourceAuthorizationRenewal: (signal) => renewLocalSourceAuthorization(
        config,
        claim,
        fetchImplementation,
        signal,
        networkTimeouts.sourceRenewalMilliseconds,
      ),
      networkTimeouts: {
        coreRequestMilliseconds: networkTimeouts.coreRequestMilliseconds,
        sourceRangeMilliseconds: networkTimeouts.sourceRangeMilliseconds,
      },
      beforeResultCallback: () => leaseKeeper.assertActive(),
    });
    try {
      outcome = options.runtimePool === undefined
        ? await execute()
        : await options.runtimePool.use((runtime) => execute(runtime));
    } catch (error: unknown) {
      operationError = error;
    }
    try {
      await leaseKeeper.assertActive();
    } catch (error: unknown) {
      leaseError ??= error;
    }
  } finally {
    try {
      await leaseKeeper.stop();
    } catch (error: unknown) {
      leaseError ??= error;
    }
    await leaseCompletion;
    options.signal?.removeEventListener("abort", onParentAbort);
  }
  if (leaseError !== undefined) throw leaseError;
  if (operationError !== undefined) throw operationError;
  if (outcome === undefined) throw new Error("Local Pull iteration produced no outcome");
  return outcome;
}

export async function runLocalPullWorker(
  config: LocalPullWorkerConfig,
  options: {
    fetchImplementation?: typeof fetch;
    signal?: AbortSignal;
    onEvent?: (event: {
      event: string;
      jobId?: string;
      attemptId?: string;
      state?: string;
      failureDiagnostic?: ComputeWorkerOutcome["failureDiagnostic"];
    }) => void;
    runtimeFactory?: () => ComputeWorkerRuntime;
    networkTimeouts?: Partial<LocalPullNetworkTimeouts>;
  } = {},
): Promise<void> {
  const runtimePool = new DemandDrivenComputeRuntimePool(
    options.runtimeFactory ?? createDefaultComputeWorkerRuntime,
    config.idleTtlMilliseconds,
    options.onEvent,
  );
  try {
    while (!options.signal?.aborted) {
      if (config.mode === "PAUSED") {
        try {
          await delay(5_000, options.signal);
        } catch (error: unknown) {
          if (options.signal?.aborted) return;
          throw error;
        }
        continue;
      }
      try {
        const outcome = await runLocalPullIteration(config, {
          ...(options.fetchImplementation === undefined ? {} : { fetchImplementation: options.fetchImplementation }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          ...(options.networkTimeouts === undefined ? {} : { networkTimeouts: options.networkTimeouts }),
          runtimePool,
        });
        if (outcome) {
          options.onEvent?.({
            event: "compute.local_pull.completed",
            jobId: outcome.result.jobId,
            attemptId: outcome.result.attemptId,
            state: outcome.result.state,
            // Project only the worker's controlled diagnostic fields. Never
            // log the error object, source authorization, or extracted text.
            ...(outcome.failureDiagnostic === undefined ? {} : { failureDiagnostic: {
              code: outcome.failureDiagnostic.code,
              stage: outcome.failureDiagnostic.stage,
              ...(outcome.failureDiagnostic.detail === undefined ? {} : { detail: outcome.failureDiagnostic.detail }),
              ...(outcome.failureDiagnostic.rangeRequests === undefined ? {} : { rangeRequests: outcome.failureDiagnostic.rangeRequests }),
              ...(outcome.failureDiagnostic.rangeBytes === undefined ? {} : { rangeBytes: outcome.failureDiagnostic.rangeBytes }),
            } }),
          });
          if (outcome.result.state === "failed" && outcome.result.errorCode === "compute_internal_error") {
            await runtimePool.invalidate();
          }
        }
      } catch (error: unknown) {
        if (options.signal?.aborted) return;
        options.onEvent?.({ event: error instanceof Error ? "compute.local_pull.iteration_failed" : "compute.local_pull.unknown_failure" });
        try {
          await delay(2_000, options.signal);
        } catch (delayError: unknown) {
          if (options.signal?.aborted) return;
          throw delayError;
        }
      }
    }
  } finally {
    try {
      await runtimePool.close();
    } catch {
      options.onEvent?.({ event: "compute.runtime.shutdown_cleanup_failed" });
    }
  }
}
