import assert from "node:assert/strict";
import { test } from "node:test";

import type { BoundedPdfTextSource } from "../src/suggestion.js";
import { runComputeWorker } from "../src/worker.js";

const INPUT = {
  coreBaseUrl: "https://core.example",
  jobId: "job-1",
  attemptId: "attempt-1",
  bootstrapSecret: "worker-bootstrap-secret-that-is-long-enough",
};

function inspector(): BoundedPdfTextSource {
  return {
    async inspect() { throw new Error("whole-object inspection is forbidden"); },
    async inspectRange(source) {
      assert.deepEqual([...await source.read(0, 5)], [37, 80, 68, 70, 45]);
      return {
        pageCount: 1,
        pageIndices: [1],
        pages: [{ pageIndex: 1, text: "A Durable Compute Title\nby\nAda Scholar", evidenceOrigin: "native_text" }],
        embeddedMetadata: {},
        complete: true,
        hasUsableTextLayer: true,
      };
    },
  };
}

test("worker claims with bootstrap authority, range-reads the source, and returns candidates only", async () => {
  const calls: Array<{ url: string; method: string; authorization: string | null; body: unknown }> = [];
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method ?? "GET", authorization: headers.get("authorization"), body });
    if (url.endsWith("/claim")) {
      return Response.json({
        job: { id: INPUT.jobId, attemptId: INPUT.attemptId, kind: "metadata_suggestion" },
        capability: { token: "result-capability-token-that-is-long-enough", expiresAt: "2026-08-18T12:10:00.000Z" },
        source: {
          method: "GET",
          url: "https://storage.example/signed-source",
          sizeBytes: 5,
          mediaType: "application/pdf",
          expiresAt: "2026-08-18T12:05:00.000Z",
        },
        callbackUrl: "https://core.example/api/internal/compute/jobs/job-1/result",
      });
    }
    if (url === "https://storage.example/signed-source") {
      assert.equal(headers.get("range"), "bytes=0-4");
      return new Response(new Uint8Array([37, 80, 68, 70, 45]), { status: 206 });
    }
    if (url.endsWith("/result")) return Response.json({ job: { state: "succeeded" } });
    return new Response(null, { status: 404 });
  };

  const outcome = await runComputeWorker(INPUT, { fetchImplementation, inspector: inspector() });
  assert.equal(outcome.result.state, "succeeded");
  assert.ok(outcome.memory.cleanStartRssBytes > 0);
  assert.ok(outcome.memory.peakRssBytes >= outcome.memory.cleanStartRssBytes);
  assert.ok(outcome.memory.postJobRssBytes > 0);
  assert.equal(calls[0]?.authorization, `Bearer ${INPUT.bootstrapSecret}`);
  assert.deepEqual(calls[0]?.body, { attemptId: INPUT.attemptId });
  assert.equal(calls[2]?.authorization, "Bearer result-capability-token-that-is-long-enough");
  const callback = calls[2]?.body as Record<string, unknown>;
  assert.equal(callback.state, "succeeded");
  assert.equal("source" in callback, false);
  assert.equal("objectKey" in callback, false);
  assert.equal("canonicalMetadata" in callback, false);
});

test("worker maps bounded extraction failure to a stable failed callback", async () => {
  let callback: unknown;
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/claim")) {
      return Response.json({
        job: { id: INPUT.jobId, attemptId: INPUT.attemptId, kind: "metadata_suggestion" },
        capability: { token: "result-capability-token-that-is-long-enough", expiresAt: "2026-08-18T12:10:00.000Z" },
        source: { method: "GET", url: "https://storage.example/signed-source", sizeBytes: 5, mediaType: "application/pdf", expiresAt: "2026-08-18T12:05:00.000Z" },
        callbackUrl: "https://core.example/api/internal/compute/jobs/job-1/result",
      });
    }
    if (url.endsWith("/result")) {
      callback = JSON.parse(String(init.body));
      return Response.json({ job: { state: "failed" } });
    }
    return new Response(null, { status: 500 });
  };
  const failingInspector: BoundedPdfTextSource = {
    async inspect() { throw new Error("unused"); },
    async inspectRange() { throw new Error("source range unavailable"); },
  };
  const outcome = await runComputeWorker(INPUT, { fetchImplementation, inspector: failingInspector });
  assert.equal(outcome.result.state, "failed");
  assert.deepEqual(callback, {
    jobId: INPUT.jobId,
    attemptId: INPUT.attemptId,
    kind: "metadata_suggestion",
    state: "failed",
    errorCode: "compute_source_unavailable",
  });
});
