import assert from "node:assert/strict";
import test from "node:test";

import { OcrError, type OcrAdapter, type OcrRecognition } from "../src/ocr.js";
import { PdfTextInspectionError } from "../src/pdf-text.js";
import { ExplicitPageOcrInspector, ReaderOcrPageOutOfRangeError } from "../src/reader-ocr-inspector.js";
import { SUGGESTION_LIMITS } from "../src/suggestion.js";
import { makeRealisticPdf } from "./fixtures/realistic-pdf.js";

function recognition(overrides: Partial<OcrRecognition> = {}): OcrRecognition {
  return { status: "recognized", text: "A private page", confidence: 92, engine: "test-engine", ...overrides };
}

test("Reader OCR renders only the explicit middle page even when a native text layer exists", async () => {
  const pages: number[] = [];
  const inspector = new ExplicitPageOcrInspector({
    async recognizePage(input) {
      pages.push(input.pageIndex);
      assert.equal(input.readerMode, true);
      assert.deepEqual([...input.imageBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      return recognition();
    },
  });
  const bytes = makeRealisticPdf(Array.from({ length: 32 }, (_, index) => `Native page ${index + 1}`));
  const reads: Array<[number, number]> = [];
  const result = await inspector.inspectRange({
    length: bytes.byteLength,
    async read(begin, end) { reads.push([begin, end]); return bytes.slice(begin, end); },
  }, 20);
  assert.deepEqual(pages, [20]);
  assert.equal(result.physicalPage, 20);
  assert.equal(result.pageCount, 32);
  assert.equal(result.text, "A private page");
  assert.equal(result.truncated, false);
  assert.equal(result.rangeBytes, bytes.byteLength);
  assert.equal(result.rangeRequests, 1);
  assert.equal(reads.length, 1);
});

test("Reader OCR retains distinct blank, low-confidence, unsupported and truncated outcomes", async () => {
  const bytes = makeRealisticPdf([""]);
  for (const value of [
    recognition({ status: "no_text", text: "", confidence: null }),
    recognition({ status: "low_confidence", text: "uncertain word", confidence: 30 }),
    recognition({ status: "unsupported_script", text: "", confidence: null }),
    recognition({ text: "abcdefghijk", truncated: false }),
  ]) {
    const inspector = new ExplicitPageOcrInspector({ async recognizePage() { return value; } }, {
      ...SUGGESTION_LIMITS, maxOcrOutputCharactersPerPage: 10,
    });
    const result = await inspector.inspect(bytes, 1);
    assert.equal(result.status, value.status);
    assert.equal(result.text, value.text.slice(0, 10));
    assert.equal(result.truncated, value.text.length > 10);
    assert.equal(result.confidence, value.confidence);
  }
});

test("Reader rejects invalid and out-of-range pages without invoking the engine", async () => {
  let calls = 0;
  const inspector = new ExplicitPageOcrInspector({ async recognizePage() { calls += 1; return recognition(); } });
  const bytes = makeRealisticPdf([""]);
  for (const page of [0, -1, 1.5, 2, 1_000_001]) {
    await assert.rejects(inspector.inspect(bytes, page), ReaderOcrPageOutOfRangeError);
  }
  assert.equal(calls, 0);
});

test("Reader honors render and source allocation bounds before OCR", async () => {
  let calls = 0;
  const inspector = new ExplicitPageOcrInspector({ async recognizePage() { calls += 1; return recognition(); } });
  await assert.rejects(inspector.inspectRange({ length: SUGGESTION_LIMITS.maxPdfJsBufferBytes + 1,
    async read() { throw new Error("must not read"); } }, 1),
  (error: unknown) => error instanceof PdfTextInspectionError && error.code === "too_large");
  await assert.rejects(inspector.inspect(makeRealisticPdf([""], { mediaBox: "0 0 100000 100000" }), 1),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "limit_exceeded");
  assert.equal(calls, 0);
});

test("Reader cancellation during inference aborts the engine and a subsequent page remains usable", async () => {
  let started!: () => void;
  const inEngine = new Promise<void>((resolve) => { started = resolve; });
  const controller = new AbortController();
  const adapter: OcrAdapter = { async recognizePage(_input, signal) {
    started();
    return new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new OcrError("aborted")), { once: true });
    });
  } };
  const inspector = new ExplicitPageOcrInspector(adapter);
  const pending = inspector.inspect(makeRealisticPdf([""]), 1, controller.signal);
  await inEngine;
  await assert.rejects(inspector.inspect(makeRealisticPdf([""]), 1),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "ocr_capacity");
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof PdfTextInspectionError && error.code === "aborted");
  await assert.rejects(inspector.inspect(makeRealisticPdf([""]), 2), ReaderOcrPageOutOfRangeError);
  const next = await new ExplicitPageOcrInspector({ async recognizePage() { return recognition(); } })
    .inspect(makeRealisticPdf([""]), 1);
  assert.equal(next.status, "recognized");
});

test("Reader timeout cancels hanging source reads and inference", async () => {
  let sourceSignal: AbortSignal | undefined;
  const inspector = new ExplicitPageOcrInspector({ async recognizePage() { return recognition(); } }, {
    ...SUGGESTION_LIMITS, timeoutMilliseconds: 20,
  });
  await assert.rejects(inspector.inspectRange({ length: 10, async read(_begin, _end, signal) {
    sourceSignal = signal; return new Promise(() => {});
  } }, 1), (error: unknown) => error instanceof PdfTextInspectionError && error.code === "timeout");
  assert.equal(sourceSignal?.aborted, true);
  const hanging = new ExplicitPageOcrInspector({ async recognizePage(_input, signal) {
    return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new OcrError("aborted")), { once: true }));
  } }, { ...SUGGESTION_LIMITS, perPageOcrTimeoutMilliseconds: 20 });
  await assert.rejects(hanging.inspect(makeRealisticPdf([""]), 1),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "ocr_timeout");
});

test("Reader rejects inconsistent empty recognized text and preserves typed source failures", async () => {
  const inspector = new ExplicitPageOcrInspector({ async recognizePage() { return recognition({ text: "" }); } });
  await assert.rejects(inspector.inspect(makeRealisticPdf([""]), 1),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "ocr_engine_failure");
  await assert.rejects(inspector.inspectRange({ length: 10, async read() { return new Uint8Array(9); } }, 1),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "source_unavailable");
});
