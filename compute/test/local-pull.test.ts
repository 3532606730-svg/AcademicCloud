import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DemandDrivenComputeRuntimePool,
  loadLocalPullWorkerConfig,
  parseLocalPullClaim,
  pullLocalClaim,
  renewLocalSourceAuthorization,
  runLocalPullIteration,
  runLocalPullWorker,
} from "../src/local-pull.js";
import type { BoundedPdfTextSource } from "../src/suggestion.js";
import { HttpPdfRangeSource, type ComputeWorkerRuntime } from "../src/worker.js";

const MACHINE_SECRET = "local-machine-secret-that-is-long-enough";

function claim() {
  const now = Date.now();
  return {
    job: { id: "job-local", attemptId: "attempt-local", kind: "metadata_suggestion" },
    capability: { token: "result-capability-token-that-is-long-enough", expiresAt: new Date(now + 60_000).toISOString() },
    source: {
      method: "GET",
      url: "https://storage.example/source",
      sizeBytes: 100,
      mediaType: "application/pdf",
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
    },
    callbackUrl: "https://core.example/api/internal/compute/jobs/job-local/result",
    lease: { expiresAt: new Date(now + 10_000).toISOString(), heartbeatAfterMilliseconds: 1_000 },
  };
}

test("Local Pull configuration is outbound-only and fails closed on malformed identity or secret", () => {
  assert.deepEqual(loadLocalPullWorkerConfig({
    ACADEMICCLOUD_COMPUTE_CORE_BASE_URL: "https://core.example",
    ACADEMICCLOUD_COMPUTE_WORKER_ID: "owner-laptop.wsl2",
    ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET: MACHINE_SECRET,
  }), {
    coreBaseUrl: "https://core.example",
    workerId: "owner-laptop.wsl2",
    machineSecret: MACHINE_SECRET,
    mode: "NORMAL",
    waitMilliseconds: 20_000,
    idleTtlMilliseconds: 300_000,
  });
  assert.throws(() => loadLocalPullWorkerConfig({
    ACADEMICCLOUD_COMPUTE_CORE_BASE_URL: "http://core.example",
    ACADEMICCLOUD_COMPUTE_WORKER_ID: "owner-laptop",
    ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET: MACHINE_SECRET,
  }), /HTTPS origin/u);
  assert.equal(loadLocalPullWorkerConfig({
    ACADEMICCLOUD_COMPUTE_CORE_BASE_URL: "https://core.example",
    ACADEMICCLOUD_COMPUTE_WORKER_ID: "owner-laptop",
    ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET: MACHINE_SECRET,
    ACADEMICCLOUD_COMPUTE_PULL_WAIT_MILLISECONDS: "5000",
  }).waitMilliseconds, 5_000);
  for (const invalid of ["0", "999", "25001", "1.5", "invalid"]) {
    assert.throws(() => loadLocalPullWorkerConfig({
      ACADEMICCLOUD_COMPUTE_CORE_BASE_URL: "https://core.example",
      ACADEMICCLOUD_COMPUTE_WORKER_ID: "owner-laptop",
      ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET: MACHINE_SECRET,
      ACADEMICCLOUD_COMPUTE_PULL_WAIT_MILLISECONDS: invalid,
    }), /wait interval/u);
  }
  assert.throws(() => parseLocalPullClaim({ ...claim(), lease: { expiresAt: new Date(Date.now() - 1).toISOString(), heartbeatAfterMilliseconds: 1_000 } }), /lease/u);
  assert.throws(() => parseLocalPullClaim({ ...claim(), job: { id: "../job", attemptId: "attempt-local", kind: "metadata_suggestion" } }), /identity/u);
  assert.throws(() => parseLocalPullClaim({ ...claim(), lease: { expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), heartbeatAfterMilliseconds: 1_000 } }), /lease/u);
});

function config(overrides: Partial<ReturnType<typeof loadLocalPullWorkerConfig>> = {}) {
  return {
    coreBaseUrl: "https://core.example",
    workerId: "owner-laptop.wsl2",
    machineSecret: MACHINE_SECRET,
    mode: "NORMAL" as const,
    waitMilliseconds: 0,
    idleTtlMilliseconds: 300_000,
    ...overrides,
  };
}

function abortableStall(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    if (!signal) return;
    const fail = (): void => reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
}

test("Local Pull source authorization renewal is exact, machine-authenticated, and bounded", async () => {
  const current = parseLocalPullClaim(claim());
  const renewed = await renewLocalSourceAuthorization(config(), current, async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/internal/compute/jobs/job-local/source");
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${MACHINE_SECRET}`);
    assert.deepEqual(JSON.parse(String(init.body)), { attemptId: "attempt-local", workerId: "owner-laptop.wsl2" });
    return Response.json({
      source: {
        method: "GET",
        url: "https://storage.example/refreshed-source",
        sizeBytes: current.source.sizeBytes,
        mediaType: "application/pdf",
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    });
  });
  assert.equal(renewed.url, "https://storage.example/refreshed-source");
  await assert.rejects(
    () => renewLocalSourceAuthorization(config(), current, (_input, init = {}) => abortableStall(init.signal), undefined, 10),
    (error: unknown) => error instanceof DOMException && error.name === "TimeoutError",
  );
});

test("stuck pull, source range, parent cancellation, and worker shutdown are bounded", async () => {
  await assert.rejects(
    () => pullLocalClaim(config(), (_input, init = {}) => abortableStall(init.signal), undefined, 10),
    (error: unknown) => error instanceof DOMException && error.name === "TimeoutError",
  );

  const source = new HttpPdfRangeSource("https://storage.example/source", 5,
    (_input, init = {}) => abortableStall(init.signal), {
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      requestTimeoutMilliseconds: 10,
    });
  await assert.rejects(
    () => source.read(0, 5),
    (error: unknown) => error instanceof DOMException && error.name === "TimeoutError",
  );

  const parent = new AbortController();
  const cancelledSource = new HttpPdfRangeSource("https://storage.example/source", 5,
    (_input, init = {}) => abortableStall(init.signal), {
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      requestTimeoutMilliseconds: 1_000,
    });
  const cancelledRead = cancelledSource.read(0, 5, parent.signal);
  parent.abort();
  await assert.rejects(
    () => cancelledRead,
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );

  const shutdown = new AbortController();
  let runtimeStarts = 0;
  const running = runLocalPullWorker(config(), {
    signal: shutdown.signal,
    fetchImplementation: (_input, init = {}) => abortableStall(init.signal),
    runtimeFactory: () => { runtimeStarts += 1; throw new Error("runtime must stay cold without a claim"); },
    networkTimeouts: { pullMilliseconds: 1_000 },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  shutdown.abort();
  await running;
  assert.equal(runtimeStarts, 0);
});

test("a stuck heartbeat aborts the active attempt at lease expiry instead of wedging the worker", async () => {
  const startedAt = Date.now();
  const expiring = {
    ...claim(),
    lease: { expiresAt: new Date(Date.now() + 80).toISOString(), heartbeatAfterMilliseconds: 1_000 },
  };
  let heartbeatRequests = 0;
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/internal/compute/pull") return Response.json(expiring);
    if (url.pathname.endsWith("/heartbeat")) {
      heartbeatRequests += 1;
      return abortableStall(init.signal);
    }
    if (url.pathname.endsWith("/result")) return Response.json({ job: { state: "failed" } });
    throw new Error(`unexpected request: ${url.href}`);
  };
  const inspector: BoundedPdfTextSource = {
    async inspect() { throw new Error("whole-object reads are forbidden"); },
    async inspectRange(_source, _limits, signal) {
      await new Promise<void>((_resolve, reject) => {
        const fail = (): void => reject(new DOMException("cancelled", "AbortError"));
        if (signal?.aborted) fail();
        else signal?.addEventListener("abort", fail, { once: true });
      });
      throw new Error("unreachable");
    },
  };
  await assert.rejects(
    () => runLocalPullIteration(config(), {
      fetchImplementation,
      inspector,
      testHeartbeatDelayMilliseconds: 1,
      networkTimeouts: { heartbeatMilliseconds: 1_000 },
    }),
    /Local Pull lease expired/u,
  );
  assert.ok(heartbeatRequests >= 1);
  assert.ok(Date.now() - startedAt < 500, "heartbeat I/O must not outlive the attempt lease");
});

test("PAUSED mode neither pulls nor initializes runtime components", async () => {
  const shutdown = new AbortController();
  let pulls = 0;
  let runtimeStarts = 0;
  const running = runLocalPullWorker(config({ mode: "PAUSED" }), {
    signal: shutdown.signal,
    fetchImplementation: async () => { pulls += 1; return new Response(null, { status: 204 }); },
    runtimeFactory: () => { runtimeStarts += 1; throw new Error("runtime must remain cold while paused"); },
  });
  setTimeout(() => shutdown.abort(), 10);
  await running;
  assert.equal(pulls, 0);
  assert.equal(runtimeStarts, 0);
});

test("worker shutdown during failed-iteration backoff is a clean cancellation", async () => {
  const shutdown = new AbortController();
  const events: string[] = [];
  await runLocalPullWorker(config(), {
    signal: shutdown.signal,
    fetchImplementation: async () => new Response(null, { status: 502 }),
    runtimeFactory: () => { throw new Error("runtime must stay cold without a claim"); },
    onEvent(event) {
      events.push(event.event);
      if (event.event === "compute.local_pull.iteration_failed") shutdown.abort();
    },
  });
  assert.deepEqual(events, ["compute.local_pull.iteration_failed"]);
});

test("source range renews once on the narrow endpoint and retries only the exact range", async () => {
  const current = { ...claim(), source: { ...claim().source, expiresAt: new Date(Date.now() + 100).toISOString() } };
  const bytes = new TextEncoder().encode("%PDF-");
  let renewals = 0;
  let oldReads = 0;
  let refreshedReads = 0;
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/internal/compute/pull") return Response.json(current);
    if (url.pathname.endsWith("/source")) {
      renewals += 1;
      return Response.json({ source: {
        method: "GET", url: "https://storage.example/refreshed", sizeBytes: 100,
        mediaType: "application/pdf", expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      } });
    }
    if (url.href === "https://storage.example/source") { oldReads += 1; return new Response(null, { status: 403 }); }
    if (url.href === "https://storage.example/refreshed") {
      refreshedReads += 1;
      return new Response(bytes, { status: 206 });
    }
    if (url.pathname.endsWith("/result")) return Response.json({ job: { state: "succeeded" } });
    if (url.pathname.endsWith("/heartbeat")) return Response.json({ lease: {
      expiresAt: new Date(Date.now() + 10_000).toISOString(), heartbeatAfterMilliseconds: 1_000,
    } });
    throw new Error(`unexpected request: ${url.href}`);
  };
  const inspector: BoundedPdfTextSource = {
    async inspect() { throw new Error("whole-object reads are forbidden"); },
    async inspectRange(source) {
      assert.equal(new TextDecoder().decode(await source.read(0, 5)), "%PDF-");
      return {
        pageCount: 1, pageIndices: [1], complete: true, hasUsableTextLayer: true,
        pages: [{ pageIndex: 1, text: "Mongolia Between China and the USSR", evidenceOrigin: "native_text" }],
        embeddedMetadata: {},
      };
    },
  };
  const outcome = await runLocalPullIteration(config(), { fetchImplementation, inspector });
  assert.equal(outcome?.result.state, "succeeded");
  assert.equal(renewals, 1);
  assert.equal(oldReads, 0);
  assert.equal(refreshedReads, 1);
});

test("demand-driven runtime reuses healthy components, unloads on idle TTL, and closes on shutdown", async () => {
  const events: string[] = [];
  const runtimes: Array<ComputeWorkerRuntime & { identity: number }> = [];
  let closes = 0;
  const pool = new DemandDrivenComputeRuntimePool(() => {
    const runtime = {
      identity: runtimes.length + 1,
      inspector: { async inspect() { throw new Error("unused"); } },
      reasoner: { async infer() { return {}; } },
      async close() { closes += 1; },
    } satisfies ComputeWorkerRuntime & { identity: number };
    runtimes.push(runtime);
    return runtime;
  }, 20, (event) => events.push(event.event));

  const first = await pool.use(async (runtime) => runtime);
  const second = await pool.use(async (runtime) => runtime);
  assert.equal(first, second);
  assert.deepEqual(events.slice(0, 2), ["compute.runtime.started", "compute.runtime.reused"]);
  await new Promise<void>((resolve) => setTimeout(resolve, 40));
  assert.equal(closes, 1);
  assert.equal(events.includes("compute.runtime.idle_unloaded"), true);
  const third = await pool.use(async (runtime) => runtime);
  assert.notEqual(third, first);
  await pool.invalidate();
  assert.equal(closes, 2);
  assert.equal(events.includes("compute.runtime.invalidated"), true);
  await pool.close();
});

test("one Local Pull iteration uses the preclaimed attempt, heartbeats, and callbacks with separate credentials", async () => {
  const source = new Uint8Array(100).fill(7);
  source.set(new TextEncoder().encode("%PDF-"), 0);
  let pullRequests = 0;
  let heartbeatRequests = 0;
  let callbackRequests = 0;
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    if (url.pathname === "/api/internal/compute/pull") {
      pullRequests += 1;
      assert.equal(headers.get("authorization"), `Bearer ${MACHINE_SECRET}`);
      return Response.json(claim());
    }
    if (url.pathname.endsWith("/heartbeat")) {
      heartbeatRequests += 1;
      assert.equal(headers.get("authorization"), `Bearer ${MACHINE_SECRET}`);
      return Response.json({
        lease: { expiresAt: new Date(Date.now() + 10_000).toISOString(), heartbeatAfterMilliseconds: 1_000 },
      });
    }
    if (url.origin === "https://storage.example") {
      const range = headers.get("range")?.match(/^bytes=(\d+)-(\d+)$/u);
      assert.ok(range);
      return new Response(source.subarray(Number(range[1]), Number(range[2]) + 1), { status: 206 });
    }
    if (url.pathname.endsWith("/result")) {
      callbackRequests += 1;
      assert.equal(headers.get("authorization"), "Bearer result-capability-token-that-is-long-enough");
      assert.notEqual(headers.get("authorization"), `Bearer ${MACHINE_SECRET}`);
      return Response.json({ job: { state: "succeeded" } });
    }
    if (url.pathname.endsWith("/claim")) throw new Error("a preclaimed Local Pull attempt must not be claimed twice");
    throw new Error(`unexpected request: ${url.href}`);
  };
  const inspector: BoundedPdfTextSource = {
    async inspect() { throw new Error("whole-object reads are forbidden"); },
    async inspectRange(rangeSource) {
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      assert.equal(new TextDecoder().decode(await rangeSource.read(0, 5)), "%PDF-");
      return {
        pageCount: 1,
        pageIndices: [1],
        pages: [{ pageIndex: 1, text: "题名：近代中国史研究\n作者：王明", evidenceOrigin: "native_text" }],
        embeddedMetadata: {},
        complete: true,
        hasUsableTextLayer: true,
      };
    },
  };
  const outcome = await runLocalPullIteration({
    coreBaseUrl: "https://core.example",
    workerId: "owner-laptop.wsl2",
    machineSecret: MACHINE_SECRET,
    mode: "NORMAL",
    waitMilliseconds: 0,
    idleTtlMilliseconds: 300_000,
  }, { fetchImplementation, inspector, testHeartbeatDelayMilliseconds: 5 });
  assert.equal(outcome?.result.state, "succeeded");
  assert.equal(pullRequests, 1);
  assert.ok(heartbeatRequests >= 1);
  assert.equal(callbackRequests, 1);
});
