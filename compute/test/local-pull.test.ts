import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadLocalPullWorkerConfig,
  parseLocalPullClaim,
  runLocalPullIteration,
} from "../src/local-pull.js";
import type { BoundedPdfTextSource } from "../src/suggestion.js";

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
      expiresAt: new Date(now + 60_000).toISOString(),
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
  });
  assert.throws(() => loadLocalPullWorkerConfig({
    ACADEMICCLOUD_COMPUTE_CORE_BASE_URL: "http://core.example",
    ACADEMICCLOUD_COMPUTE_WORKER_ID: "owner-laptop",
    ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET: MACHINE_SECRET,
  }), /HTTPS origin/u);
  assert.throws(() => parseLocalPullClaim({ ...claim(), lease: { expiresAt: new Date(Date.now() - 1).toISOString(), heartbeatAfterMilliseconds: 1_000 } }), /lease/u);
  assert.throws(() => parseLocalPullClaim({ ...claim(), job: { id: "../job", attemptId: "attempt-local", kind: "metadata_suggestion" } }), /identity/u);
  assert.throws(() => parseLocalPullClaim({ ...claim(), lease: { expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), heartbeatAfterMilliseconds: 1_000 } }), /lease/u);
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
  }, { fetchImplementation, inspector, testHeartbeatDelayMilliseconds: 5 });
  assert.equal(outcome?.result.state, "succeeded");
  assert.equal(pullRequests, 1);
  assert.ok(heartbeatRequests >= 1);
  assert.equal(callbackRequests, 1);
});
