interface LeaseKeeperConfig {
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

type KeeperState = "active" | "expired" | "rejected" | "failed" | "stopped";

let state: KeeperState = "active";
let leaseExpiresAt = 0;
const stop = new AbortController();

function send(message: object): void {
  if (process.connected) process.send?.(message);
}

function parseLease(value: unknown): { expiresAt: string; heartbeatAfterMilliseconds: number } {
  if (typeof value !== "object" || value === null) throw new Error("Local Pull lease is invalid");
  const lease = value as { expiresAt?: unknown; heartbeatAfterMilliseconds?: unknown };
  const expires = typeof lease.expiresAt === "string" ? Date.parse(lease.expiresAt) : Number.NaN;
  const now = Date.now();
  if (!Number.isFinite(expires) || expires <= now || expires > now + 5 * 60_000
    || typeof lease.heartbeatAfterMilliseconds !== "number"
    || !Number.isSafeInteger(lease.heartbeatAfterMilliseconds)
    || lease.heartbeatAfterMilliseconds < 1_000 || lease.heartbeatAfterMilliseconds > 60_000) {
    throw new Error("Local Pull lease is invalid");
  }
  return { expiresAt: new Date(expires).toISOString(), heartbeatAfterMilliseconds: lease.heartbeatAfterMilliseconds };
}

function delay(milliseconds: number): Promise<void> {
  if (stop.signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = (): void => {
      stop.signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timer);
      finish();
    };
    stop.signal.addEventListener("abort", onAbort, { once: true });
  });
}

function fail(next: Exclude<KeeperState, "active" | "stopped">): void {
  if (state !== "active") return;
  state = next;
  process.exitCode = next === "expired" ? 21 : next === "rejected" ? 22 : 23;
  send({ type: "failed", state });
  stop.abort();
}

function validateConfig(value: unknown): LeaseKeeperConfig {
  if (typeof value !== "object" || value === null) throw new Error("lease keeper config is invalid");
  const config = value as Partial<LeaseKeeperConfig>;
  if (typeof config.coreBaseUrl !== "string" || typeof config.workerId !== "string"
    || typeof config.machineSecret !== "string" || typeof config.jobId !== "string"
    || typeof config.attemptId !== "string" || typeof config.expiresAt !== "string"
    || typeof config.heartbeatAfterMilliseconds !== "number" || typeof config.timeoutMilliseconds !== "number"
    || (config.testHeartbeatDelayMilliseconds !== undefined && typeof config.testHeartbeatDelayMilliseconds !== "number")) {
    throw new Error("lease keeper config is invalid");
  }
  return config as LeaseKeeperConfig;
}

async function run(config: LeaseKeeperConfig): Promise<void> {
  leaseExpiresAt = Date.parse(config.expiresAt);
  const heartbeatDelay = config.testHeartbeatDelayMilliseconds ?? config.heartbeatAfterMilliseconds;
  send({ type: "ready" });
  while (state === "active" && !stop.signal.aborted) {
    const remaining = leaseExpiresAt - Date.now();
    if (remaining <= 0) {
      fail("expired");
      return;
    }
    await delay(Math.min(heartbeatDelay, remaining));
    if (state !== "active" || stop.signal.aborted) return;
    const requestRemaining = leaseExpiresAt - Date.now();
    if (requestRemaining <= 0) {
      fail("expired");
      return;
    }
    try {
      const response = await fetch(
        `${config.coreBaseUrl}/api/internal/compute/jobs/${encodeURIComponent(config.jobId)}/heartbeat`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${config.machineSecret}`, "content-type": "application/json" },
          body: JSON.stringify({ attemptId: config.attemptId, workerId: config.workerId }),
          signal: AbortSignal.any([stop.signal, AbortSignal.timeout(Math.min(config.timeoutMilliseconds, requestRemaining))]),
        },
      );
      if (response.ok) {
        const renewed = parseLease((await response.json() as { lease?: unknown }).lease);
        leaseExpiresAt = Date.parse(renewed.expiresAt);
        continue;
      }
      if (response.status < 500 && response.status !== 429) {
        fail("rejected");
        return;
      }
    } catch {
      if (state !== "active" || stop.signal.aborted) return;
    }
    const retryRemaining = leaseExpiresAt - Date.now();
    if (retryRemaining <= 0) {
      fail("expired");
      return;
    }
    await delay(Math.min(2_000, retryRemaining));
  }
}

process.on("message", (message: unknown) => {
  if (typeof message !== "object" || message === null) return;
  const type = (message as { type?: unknown }).type;
  if (type === "probe") {
    if (state === "active" && Date.now() >= leaseExpiresAt) fail("expired");
    send({ type: "probe", id: (message as { id?: unknown }).id, state });
    return;
  }
  if (type === "stop") {
    if (state === "active") state = "stopped";
    process.exitCode = 0;
    stop.abort();
    return;
  }
  if (type !== "start" || leaseExpiresAt !== 0) return;
  try {
    const config = validateConfig((message as { config?: unknown }).config);
    void run(config).catch(() => fail("failed")).finally(() => {
      if (process.connected) process.disconnect();
    });
  } catch {
    fail("failed");
    if (process.connected) process.disconnect();
  }
});

process.on("disconnect", () => {
  if (state === "active") state = "stopped";
  stop.abort();
});
