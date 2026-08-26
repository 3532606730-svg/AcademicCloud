import assert from "node:assert/strict";
import { test } from "node:test";

import type { MetadataSuggestionComputeOutput } from "@academiccloud/compute-contracts";
import type { BoundedPdfTextSource } from "../src/suggestion.js";
import { BibliographicIntelligenceError } from "../src/bibliographic-intelligence.js";
import { PdfTextInspectionError } from "../src/pdf-text.js";
import { computeMetadataSuggestions, fitCallbackOutput, runComputeWorker } from "../src/worker.js";

const INPUT = {
  coreBaseUrl: "https://core.example",
  jobId: "job-1",
  attemptId: "attempt-1",
  bootstrapSecret: "worker-bootstrap-secret-that-is-long-enough",
};

const future = (milliseconds: number): string => new Date(Date.now() + milliseconds).toISOString();

function abortableStall(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    if (!signal) return;
    const fail = (): void => reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
}

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
        capability: { token: "result-capability-token-that-is-long-enough", expiresAt: future(10 * 60_000) },
        source: {
          method: "GET",
          url: "https://storage.example/signed-source",
          sizeBytes: 5,
          mediaType: "application/pdf",
          expiresAt: future(5 * 60_000),
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
  assert.deepEqual(outcome.sourceAccess, { sourceBytes: 5, rangeBudgetBytes: 5, rangeRequests: 1, rangeBytes: 5 });
  assert.equal(calls[0]?.authorization, `Bearer ${INPUT.bootstrapSecret}`);
  assert.deepEqual(calls[0]?.body, { attemptId: INPUT.attemptId });
  assert.equal(calls[2]?.authorization, "Bearer result-capability-token-that-is-long-enough");
  const callback = calls[2]?.body as Record<string, unknown>;
  assert.equal(callback.state, "succeeded");
  assert.equal("source" in callback, false);
  assert.equal("objectKey" in callback, false);
  assert.equal("canonicalMetadata" in callback, false);
});

test("worker preserves extracted candidates when the optional reasoner is unavailable", async () => {
  const output = await computeMetadataSuggestions(
    { length: 5, async read() { return new Uint8Array([37, 80, 68, 70, 45]); } },
    inspector(),
    undefined,
    {
      async infer() { throw new BibliographicIntelligenceError("reasoner_unavailable", "request_failed"); },
    },
  );
  assert.equal(output.bibliography, undefined);
  assert.equal(output.status, "ready");
  assert.ok(output.candidates.length > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(output), "utf8") < 256 * 1024);
});

test("worker drops an oversized optional bibliography before callback", async () => {
  const output = {
    status: "ready",
    window: { firstPages: 15, lastPages: 5, pageCount: 1, pageIndices: [1], complete: true },
    candidates: Array.from({ length: 256 }, (_, position) => ({
      position,
      fieldPath: "canonicalTitle",
      typeFieldName: null,
      authorityType: null,
      authorityRole: null,
      identifierScheme: null,
      value: "x".repeat(512),
      sourceType: "title_page",
      sourcePageIndex: 1,
      pageClass: "title_page",
      confidence: "medium",
      precedenceRank: 10,
      evidenceExcerpt: "x".repeat(512),
      evidenceOrigin: "native_text",
      ocrEngine: null,
      ocrConfidence: null,
      rulesetVersion: "rf-frontmatterocr-v1",
    })),
    bibliography: { oversized: "x".repeat(500_000) },
  } as unknown as MetadataSuggestionComputeOutput;

  const fitted = fitCallbackOutput(output);
  assert.equal(fitted.bibliography, undefined);
  assert.ok(fitted.candidates.length < output.candidates.length);
  assert.ok(Buffer.byteLength(JSON.stringify({
    jobId: "x".repeat(128),
    attemptId: "x".repeat(128),
    kind: "metadata_suggestion",
    state: "succeeded",
    output: fitted,
  }), "utf8") <= 256 * 1024);
});

test("worker maps bounded extraction failure to a stable failed callback", async () => {
  let callback: unknown;
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/claim")) {
      return Response.json({
        job: { id: INPUT.jobId, attemptId: INPUT.attemptId, kind: "metadata_suggestion" },
        capability: { token: "result-capability-token-that-is-long-enough", expiresAt: future(10 * 60_000) },
        source: { method: "GET", url: "https://storage.example/signed-source", sizeBytes: 5, mediaType: "application/pdf", expiresAt: future(5 * 60_000) },
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

test("worker reports only bounded PDF failure diagnostics outside the durable callback", async () => {
  let callback: unknown;
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/claim")) {
      return Response.json({
        job: { id: INPUT.jobId, attemptId: INPUT.attemptId, kind: "metadata_suggestion" },
        capability: { token: "result-capability-token-that-is-long-enough", expiresAt: future(10 * 60_000) },
        source: { method: "GET", url: "https://storage.example/signed-source", sizeBytes: 5, mediaType: "application/pdf", expiresAt: future(5 * 60_000) },
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
    async inspectRange() { throw new PdfTextInspectionError("timeout", "page_text", 4, 4096); },
    async close() { throw new Error("cleanup must not mask the inspection boundary"); },
  };
  const outcome = await runComputeWorker(INPUT, { fetchImplementation, inspector: failingInspector });
  assert.deepEqual(outcome.failureDiagnostic, { code: "timeout", stage: "page_text", rangeRequests: 4, rangeBytes: 4096 });
  assert.deepEqual(callback, {
    jobId: INPUT.jobId,
    attemptId: INPUT.attemptId,
    kind: "metadata_suggestion",
    state: "failed",
    errorCode: "compute_timeout",
  });
});

test("worker reports a controlled post-extraction diagnostic without exposing model output", async () => {
  let callback: unknown;
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/claim")) {
      return Response.json({
        job: { id: INPUT.jobId, attemptId: INPUT.attemptId, kind: "metadata_suggestion" },
        capability: { token: "result-capability-token-that-is-long-enough", expiresAt: future(10 * 60_000) },
        source: { method: "GET", url: "https://storage.example/signed-source", sizeBytes: 5, mediaType: "application/pdf", expiresAt: future(5 * 60_000) },
        callbackUrl: "https://core.example/api/internal/compute/jobs/job-1/result",
      });
    }
    if (url === "https://storage.example/signed-source") {
      return new Response(new Uint8Array([37, 80, 68, 70, 45]), { status: 206 });
    }
    if (url.endsWith("/result")) {
      callback = JSON.parse(String(init.body));
      return Response.json({ job: { state: "failed" } });
    }
    return new Response(null, { status: 404 });
  };
  const outcome = await runComputeWorker(INPUT, {
    fetchImplementation,
    inspector: inspector(),
    reasoner: {
      async infer() { throw new BibliographicIntelligenceError("invalid_result", "field_evidence_invalid"); },
      async close() { throw new Error("cleanup must not mask the reasoning boundary"); },
    },
  });
  assert.deepEqual(outcome.failureDiagnostic, {
    code: "invalid_result",
    stage: "bibliographic_reasoning",
    detail: "field_evidence_invalid",
  });
  assert.deepEqual(callback, {
    jobId: INPUT.jobId,
    attemptId: INPUT.attemptId,
    kind: "metadata_suggestion",
    state: "failed",
    errorCode: "compute_invalid_result",
  });
  assert.equal(JSON.stringify(outcome).includes("A Durable Compute Title"), false);
});

test("worker bounds successful-result callback retries and reports a terminal failure instead of stranding running state", async () => {
  const callbacks: unknown[] = [];
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/claim")) {
      return Response.json({
        job: { id: INPUT.jobId, attemptId: INPUT.attemptId, kind: "metadata_suggestion" },
        capability: { token: "result-capability-token-that-is-long-enough", expiresAt: future(10 * 60_000) },
        source: { method: "GET", url: "https://storage.example/signed-source", sizeBytes: 5, mediaType: "application/pdf", expiresAt: future(5 * 60_000) },
        callbackUrl: "https://core.example/api/internal/compute/jobs/job-1/result",
      });
    }
    if (url === "https://storage.example/signed-source") {
      return new Response(new Uint8Array([37, 80, 68, 70, 45]), { status: 206 });
    }
    if (url.endsWith("/result")) {
      const callback = JSON.parse(String(init.body));
      callbacks.push(callback);
      if ((callback as { state?: string }).state === "failed") {
        return Response.json({ job: { state: "failed" } });
      }
      return Response.json({ error: "internal_error" }, { status: 500 });
    }
    return new Response(null, { status: 404 });
  };

  await assert.rejects(
    () => runComputeWorker(INPUT, { fetchImplementation, inspector: inspector() }),
    /compute callback failed with status 500/u,
  );
  assert.equal(callbacks.filter((callback) => (callback as { state?: string }).state === "succeeded").length, 3);
  assert.deepEqual(callbacks.at(-1), {
    jobId: INPUT.jobId,
    attemptId: INPUT.attemptId,
    kind: "metadata_suggestion",
    state: "failed",
    errorCode: "compute_internal_error",
  });
});

test("worker does not retry stable result validation responses", async () => {
  const callbackStates: string[] = [];
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/claim")) {
      return Response.json({
        job: { id: INPUT.jobId, attemptId: INPUT.attemptId, kind: "metadata_suggestion" },
        capability: { token: "result-capability-token-that-is-long-enough", expiresAt: future(10 * 60_000) },
        source: { method: "GET", url: "https://storage.example/signed-source", sizeBytes: 5, mediaType: "application/pdf", expiresAt: future(5 * 60_000) },
        callbackUrl: "https://core.example/api/internal/compute/jobs/job-1/result",
      });
    }
    if (url === "https://storage.example/signed-source") {
      return new Response(new Uint8Array([37, 80, 68, 70, 45]), { status: 206 });
    }
    if (url.endsWith("/result")) {
      callbackStates.push((JSON.parse(String(init.body)) as { state: string }).state);
      return Response.json({ error: "invalid_compute_result" }, { status: 400 });
    }
    return new Response(null, { status: 404 });
  };

  await assert.rejects(
    () => runComputeWorker(INPUT, { fetchImplementation, inspector: inspector() }),
    /compute callback failed with status 400/u,
  );
  assert.deepEqual(callbackStates, ["succeeded", "failed"]);
});

test("stuck callbacks time out per request, retry finitely, and remain parent-cancellable", async () => {
  const makeFetch = (onCallback: (init: RequestInit) => Promise<Response>): typeof fetch => async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/claim")) {
      return Response.json({
        job: { id: INPUT.jobId, attemptId: INPUT.attemptId, kind: "metadata_suggestion" },
        capability: { token: "result-capability-token-that-is-long-enough", expiresAt: future(10 * 60_000) },
        source: { method: "GET", url: "https://storage.example/signed-source", sizeBytes: 5, mediaType: "application/pdf", expiresAt: future(5 * 60_000) },
        callbackUrl: "https://core.example/api/internal/compute/jobs/job-1/result",
      });
    }
    if (url === "https://storage.example/signed-source") {
      return new Response(new Uint8Array([37, 80, 68, 70, 45]), { status: 206 });
    }
    if (url.endsWith("/result")) return onCallback(init);
    return new Response(null, { status: 404 });
  };

  let timedOutCallbacks = 0;
  const startedAt = Date.now();
  await assert.rejects(
    () => runComputeWorker(INPUT, {
      inspector: inspector(),
      fetchImplementation: makeFetch((init) => { timedOutCallbacks += 1; return abortableStall(init.signal); }),
      networkTimeouts: { coreRequestMilliseconds: 10 },
    }),
    (error: unknown) => error instanceof DOMException && error.name === "TimeoutError",
  );
  assert.equal(timedOutCallbacks, 6);
  assert.ok(Date.now() - startedAt < 2_000);

  const shutdown = new AbortController();
  let cancelledCallbacks = 0;
  await assert.rejects(
    () => runComputeWorker(INPUT, {
      inspector: inspector(),
      signal: shutdown.signal,
      fetchImplementation: makeFetch((init) => {
        cancelledCallbacks += 1;
        setImmediate(() => shutdown.abort());
        return abortableStall(init.signal);
      }),
      networkTimeouts: { coreRequestMilliseconds: 1_000 },
    }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(cancelledCallbacks, 1);
});
