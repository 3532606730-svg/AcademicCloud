import assert from "node:assert/strict";
import { test } from "node:test";

import { BibliographicIntelligenceError } from "../src/bibliographic-intelligence.js";
import { runLocalPullWorker } from "../src/local-pull.js";
import { PdfTextInspectionError } from "../src/pdf-text.js";
import type { BoundedPdfTextSource } from "../src/suggestion.js";
import type { ComputeWorkerRuntime } from "../src/worker.js";

const MACHINE_SECRET = "diagnostic-test-machine-secret-private";
const CAPABILITY = "diagnostic-test-result-capability-private";
const SOURCE_URL = "https://storage.example/private-source?signature=private-signed-url";
const SOURCE_TEXT = "Private source title and original page contents";
const ERROR_MESSAGE = "private-error-payload-and-stack";

function pollutedError<T extends Error>(error: T): T {
  error.message = ERROR_MESSAGE;
  error.stack = `${ERROR_MESSAGE}: ${SOURCE_URL}`;
  return Object.assign(error, { sourceText: SOURCE_TEXT, capability: CAPABILITY, url: SOURCE_URL });
}

function usableInspector(): BoundedPdfTextSource {
  return {
    async inspect() { throw new Error("unused byte inspector"); },
    async inspectRange() {
      return {
        pageCount: 1, pageIndices: [1], complete: true, hasUsableTextLayer: true,
        pages: [{ pageIndex: 1, text: SOURCE_TEXT, evidenceOrigin: "native_text", ocrEngine: null, ocrConfidence: null }],
        embeddedMetadata: {},
      };
    },
  };
}

async function completeOne(runtime: ComputeWorkerRuntime) {
  const shutdown = new AbortController();
  const events: Array<Record<string, unknown>> = [];
  const callbacks: Array<Record<string, unknown>> = [];
  let pulls = 0;
  await runLocalPullWorker({
    coreBaseUrl: "https://core.example", workerId: "diagnostic-worker", machineSecret: MACHINE_SECRET,
    mode: "NORMAL", waitMilliseconds: 0, idleTtlMilliseconds: 60_000,
  }, {
    signal: shutdown.signal,
    runtimeFactory: () => runtime,
    fetchImplementation: async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/pull")) {
        pulls += 1;
        assert.equal(pulls, 1);
        const future = new Date(Date.now() + 60_000).toISOString();
        return Response.json({
          job: { id: "job-diagnostic", attemptId: "attempt-diagnostic", kind: "metadata_suggestion" },
          capability: { token: CAPABILITY, expiresAt: future },
          source: { method: "GET", url: SOURCE_URL, sizeBytes: 100, mediaType: "application/pdf", expiresAt: future },
          callbackUrl: "https://core.example/api/internal/compute/jobs/job-diagnostic/result",
          lease: { expiresAt: future, heartbeatAfterMilliseconds: 1_000 },
        });
      }
      if (url.pathname.endsWith("/result")) {
        callbacks.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Response.json({ accepted: true });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
    onEvent(event) {
      events.push(event);
      if (event.event === "compute.local_pull.completed" || event.event === "compute.local_pull.iteration_failed") shutdown.abort();
    },
  });
  assert.equal(callbacks.length, 1);
  assert.equal(events.filter((event) => event.event === "compute.local_pull.completed").length, 1);
  const serialized = JSON.stringify(events);
  for (const forbidden of [MACHINE_SECRET, CAPABILITY, SOURCE_URL, SOURCE_TEXT, ERROR_MESSAGE, "sourceText", '"stack"']) {
    assert.equal(serialized.includes(forbidden), false, `diagnostics must exclude ${forbidden}`);
  }
  for (const forbidden of [MACHINE_SECRET, CAPABILITY, SOURCE_URL, ERROR_MESSAGE]) {
    assert.equal(JSON.stringify(callbacks).includes(forbidden), false);
  }
  assert.equal("failureDiagnostic" in callbacks[0]!, false);
  return { event: events.find((event) => event.event === "compute.local_pull.completed"), callback: callbacks[0]! };
}

test("Local Pull completion preserves bounded PDF diagnostics without sensitive error properties", async () => {
  const { event, callback } = await completeOne({
    inspector: {
      async inspect() { throw new Error("unused"); },
      async inspectRange() { throw pollutedError(new PdfTextInspectionError("timeout", "page_text", 4, 4096)); },
    },
    async close() {},
  });
  assert.deepEqual(event, {
    event: "compute.local_pull.completed", jobId: "job-diagnostic", attemptId: "attempt-diagnostic", state: "failed",
    failureDiagnostic: { code: "timeout", stage: "page_text", rangeRequests: 4, rangeBytes: 4096 },
  });
  assert.equal(callback.errorCode, "compute_timeout");
});

test("Local Pull completion preserves the controlled reasoner stage and detail only", async () => {
  const { event, callback } = await completeOne({
    inspector: usableInspector(),
    reasoner: { async infer() { throw pollutedError(new BibliographicIntelligenceError("invalid_result", "canonical_schema_invalid")); } },
    async close() {},
  });
  assert.deepEqual(event, {
    event: "compute.local_pull.completed", jobId: "job-diagnostic", attemptId: "attempt-diagnostic", state: "failed",
    failureDiagnostic: { code: "invalid_result", stage: "bibliographic_reasoning", detail: "canonical_schema_invalid" },
  });
  assert.equal(callback.errorCode, "compute_invalid_result");
});

test("Local Pull unexpected failures retain a controlled code without the raw message", async () => {
  const { event } = await completeOne({
    inspector: usableInspector(),
    reasoner: { async infer() { throw pollutedError(new Error(ERROR_MESSAGE)); } },
    async close() {},
  });
  assert.deepEqual(event, {
    event: "compute.local_pull.completed", jobId: "job-diagnostic", attemptId: "attempt-diagnostic", state: "failed",
    failureDiagnostic: { code: "unclassified_error", stage: "bibliographic_reasoning" },
  });
});

test("Local Pull successful completion does not invent a failure diagnostic", async () => {
  const { event, callback } = await completeOne({
    inspector: usableInspector(),
    reasoner: { async infer() { return { status: "no_bibliography", overallConfidence: 0, canonical: null, classSupport: [], fields: [], warnings: [] }; } },
    async close() {},
  });
  assert.deepEqual(event, {
    event: "compute.local_pull.completed", jobId: "job-diagnostic", attemptId: "attempt-diagnostic", state: "succeeded",
  });
  assert.equal(callback.state, "succeeded");
});
