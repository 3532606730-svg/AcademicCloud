import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inspectPdfFrontMatter,
  inspectPdfFrontMatterRange,
  inspectPdfText,
  pdfRangeAccessPolicy,
  PdfTextInspectionError,
} from "../src/pdf-text.js";
import { OcrError, type OcrAdapter, type OcrRecognition } from "../src/ocr.js";
import { SUGGESTION_LIMITS, type SuggestionLimits } from "../src/suggestion.js";
import { makeOversizedRealisticPdf } from "./fixtures/realistic-pdf.js";

function makePdf(pages: string[], mediaBox = "0 0 612 792"): Uint8Array {
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  const fontObject = 3 + pages.length * 2;
  pages.forEach((value, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const escaped = value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
    const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [${mediaBox}] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(output);
}

function limits(overrides: Partial<SuggestionLimits> = {}): Readonly<SuggestionLimits> {
  return { ...SUGGESTION_LIMITS, ...overrides };
}

test("production PDF inspection keeps real-resource parser headroom inside the total request budget", () => {
  assert.equal(SUGGESTION_LIMITS.timeoutMilliseconds, 120_000);
  assert.equal(SUGGESTION_LIMITS.totalRequestTimeoutMilliseconds, 300_000);
  assert.ok(SUGGESTION_LIMITS.timeoutMilliseconds < SUGGESTION_LIMITS.totalRequestTimeoutMilliseconds);
  assert.equal(SUGGESTION_LIMITS.maxPdfJsBufferBytes, 1024 * 1024 * 1024);
  const currentProduction = pdfRangeAccessPolicy(62_990_004);
  const over64MiBProduction = pdfRangeAccessPolicy(72_459_070);
  assert.equal(currentProduction.maximumBytes, 62_990_004);
  assert.equal(over64MiBProduction.maximumBytes, 72_459_070);
  assert.equal(over64MiBProduction.maximumRequests, Math.ceil(72_459_070 / SUGGESTION_LIMITS.rangeChunkBytes));
  assert.ok(over64MiBProduction.maximumBytes > 64 * 1024 * 1024);
});

test("range policy rejects before PDF.js allocates beyond its qualified buffer envelope", async () => {
  let reads = 0;
  await assert.rejects(
    () => inspectPdfFrontMatterRange({
      length: SUGGESTION_LIMITS.maxPdfJsBufferBytes + 1,
      async read() { reads += 1; return new Uint8Array(); },
    }, new RecordingOcrAdapter(async () => recognized("unused"))),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "too_large",
  );
  assert.equal(reads, 0);
});

class RecordingOcrAdapter implements OcrAdapter {
  readonly calls: Array<{ pageIndex: number; imageBytes: number }> = [];

  constructor(readonly recognize: (pageIndex: number, signal?: AbortSignal) => Promise<OcrRecognition>) {}

  async recognizePage(input: { imageBytes: Uint8Array; pageIndex: number }, signal?: AbortSignal): Promise<OcrRecognition> {
    this.calls.push({ pageIndex: input.pageIndex, imageBytes: input.imageBytes.byteLength });
    assert.deepEqual([...input.imageBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    return this.recognize(input.pageIndex, signal);
  }
}

function recognized(text: string, confidence = 88): OcrRecognition {
  return { status: "recognized", text, confidence, engine: "test-local-ocr" };
}

test("inspector reads exactly first 15 plus last 5 pages with 1-based evidence indices", async () => {
  const bytes = makePdf(Array.from({ length: 25 }, (_, index) => `Page ${index + 1} title evidence`));
  const inspection = await inspectPdfText(bytes);
  assert.equal(inspection.pageCount, 25);
  assert.deepEqual(inspection.pageIndices, [
    ...Array.from({ length: 15 }, (_, index) => index + 1),
    21, 22, 23, 24, 25,
  ]);
  assert.equal(inspection.pages.length, 20);
  assert.equal(inspection.pages[0]?.pageIndex, 1);
  assert.equal(inspection.pages.at(-1)?.pageIndex, 25);
  assert.equal(inspection.hasUsableTextLayer, true);
});

test("inspector rejects malformed and oversized input without rendering/OCR", async () => {
  await assert.rejects(
    () => inspectPdfText(new TextEncoder().encode("not a pdf")),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "invalid_pdf",
  );
  const oversized = new Uint8Array(32 * 1024 * 1024 + 1);
  oversized.set(new TextEncoder().encode("%PDF-"));
  await assert.rejects(
    () => inspectPdfText(oversized),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "too_large",
  );
});

test("a valid image-only/textless PDF is reported as OCR deferred", async () => {
  const inspection = await inspectPdfText(makePdf(["", ""]));
  assert.deepEqual(inspection.pageIndices, [1, 2]);
  assert.equal(inspection.hasUsableTextLayer, false);
  assert.deepEqual(inspection.pages.map((page) => page.text), ["", ""]);
});

test("malformed control characters are removed before evidence limits are applied", async () => {
  const inspection = await inspectPdfText(makePdf(["Title\u0085\u0090 page"]));
  assert.equal(inspection.hasUsableTextLayer, true);
  assert.equal(/[\u0080-\u009f]/u.test(inspection.pages[0]?.text ?? ""), false);
});

test("native text bypasses OCR while image-only and mixed bounded pages use fallback selectively", async () => {
  const nativeOnly = new RecordingOcrAdapter(async () => recognized("must not run"));
  const nativeInspection = await inspectPdfFrontMatter(makePdf(["Native title page"]), nativeOnly);
  assert.equal(nativeOnly.calls.length, 0);
  assert.equal(nativeInspection.pages[0]?.evidenceOrigin, "native_text");

  const imageOnly = new RecordingOcrAdapter(async (pageIndex) => recognized(`OCR title page ${pageIndex}`, 86));
  const imageInspection = await inspectPdfFrontMatter(makePdf([""]), imageOnly);
  assert.deepEqual(imageOnly.calls.map((call) => call.pageIndex), [1]);
  assert.equal(imageInspection.pages[0]?.text, "OCR title page 1");
  assert.equal(imageInspection.pages[0]?.evidenceOrigin, "ocr");
  assert.equal(imageInspection.pages[0]?.ocrEngine, "test-local-ocr");
  assert.equal(imageInspection.pages[0]?.ocrConfidence, 86);

  const mixed = new RecordingOcrAdapter(async (pageIndex) => recognized(`OCR page ${pageIndex}`));
  const mixedInspection = await inspectPdfFrontMatter(makePdf(["Native page", "", "Native ending"]), mixed);
  assert.deepEqual(mixed.calls.map((call) => call.pageIndex), [2]);
  assert.deepEqual(mixedInspection.pages.map((page) => page.evidenceOrigin), ["native_text", "ocr", "native_text"]);
  assert.equal(mixedInspection.nativePageCount, 2);
  assert.equal(mixedInspection.ocrPageCount, 1);
});

test("pages outside first 15 plus last 5 are never rendered or OCRed and short windows deduplicate", async () => {
  const pages = Array.from({ length: 25 }, (_, index) => index === 15 ? "" : `Native page ${index + 1}`);
  const adapter = new RecordingOcrAdapter(async (pageIndex) => recognized(`OCR page ${pageIndex}`));
  const inspection = await inspectPdfFrontMatter(makePdf(pages), adapter);
  assert.deepEqual(inspection.pageIndices, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25]);
  assert.deepEqual(adapter.calls, []);
  assert.deepEqual((await inspectPdfFrontMatter(makePdf(Array(10).fill("Native page")), adapter)).pageIndices, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("render dimensions are rejected before allocation or OCR", async () => {
  const adapter = new RecordingOcrAdapter(async () => recognized("must not run"));
  await assert.rejects(
    () => inspectPdfFrontMatter(makePdf([""], "0 0 100000 100000"), adapter),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "limit_exceeded",
  );
  assert.equal(adapter.calls.length, 0);
});

test("OCR timeout and engine failure fail closed without returning partial evidence", async () => {
  for (const failure of [new OcrError("timeout"), new OcrError("engine_failure")]) {
    const adapter = new RecordingOcrAdapter(async () => { throw failure; });
    await assert.rejects(
      () => inspectPdfFrontMatter(makePdf([""]), adapter),
      (error: unknown) => error instanceof PdfTextInspectionError
        && (error.code === "ocr_timeout" || error.code === "ocr_engine_failure"),
    );
  }
});

test("per-page and total OCR text limits plus total request timeout are enforced", async () => {
  const bounded = new RecordingOcrAdapter(async () => recognized("A".repeat(SUGGESTION_LIMITS.maxOcrOutputCharactersPerPage + 500)));
  const onePage = await inspectPdfFrontMatter(makePdf([""]), bounded);
  assert.equal(onePage.pages[0]?.text.length, SUGGESTION_LIMITS.maxOcrOutputCharactersPerPage);

  const total = new RecordingOcrAdapter(async () => recognized("A".repeat(SUGGESTION_LIMITS.maxOcrOutputCharactersPerPage)));
  await assert.rejects(
    () => inspectPdfFrontMatter(makePdf(["", "", "", "", ""]), total),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "limit_exceeded",
  );

  const slow = new RecordingOcrAdapter((_pageIndex, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new OcrError("aborted")), { once: true });
  }));
  await assert.rejects(
    () => inspectPdfFrontMatter(makePdf([""]), slow, limits({
      perPageOcrTimeoutMilliseconds: 20,
      totalRequestTimeoutMilliseconds: 20,
    })),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "ocr_timeout",
  );
});

test("aggregate OCR deadline preserves completed pages as an explicit partial window", async () => {
  const adapter = new RecordingOcrAdapter((pageIndex, signal) => {
    if (pageIndex === 1) {
      return new Promise((resolve) => setTimeout(() => resolve(recognized("First page evidence")), 20));
    }
    return new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new OcrError("aborted")), { once: true });
    });
  });
  const inspection = await inspectPdfFrontMatter(makePdf(["", ""]), adapter, limits({
    perPageOcrTimeoutMilliseconds: 100,
    totalRequestTimeoutMilliseconds: 50,
  }));
  assert.equal(inspection.complete, false);
  assert.deepEqual(inspection.pages.map((page) => [page.pageIndex, page.text]), [[1, "First page evidence"]]);
  assert.deepEqual(adapter.calls.map((call) => call.pageIndex), [1]);
});

test("only one OCR-bearing request is active and cancellation releases capacity", async () => {
  let markEntered!: () => void;
  const entered = new Promise<void>((resolve) => { markEntered = resolve; });
  const holding = new RecordingOcrAdapter((_pageIndex, signal) => new Promise((_resolve, reject) => {
    markEntered();
    signal?.addEventListener("abort", () => reject(new OcrError("aborted")), { once: true });
  }));
  const controller = new AbortController();
  const first = inspectPdfFrontMatter(makePdf([""]), holding, SUGGESTION_LIMITS, controller.signal);
  await entered;
  const secondAdapter = new RecordingOcrAdapter(async () => recognized("must not run"));
  await assert.rejects(
    () => inspectPdfFrontMatter(makePdf([""]), secondAdapter),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "ocr_capacity",
  );
  assert.equal(secondAdapter.calls.length, 0);
  controller.abort();
  await assert.rejects(
    () => first,
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "aborted",
  );
  const recovered = new RecordingOcrAdapter(async () => recognized("Recovered"));
  assert.equal((await inspectPdfFrontMatter(makePdf([""]), recovered)).pages[0]?.text, "Recovered");
});

test("range-backed inspector accepts an object larger than the whole-object compatibility ceiling", async () => {
  const base = new TextDecoder().decode(makePdf(["Range-backed title evidence"]));
  const startxref = Number(base.match(/startxref\n(\d+)/u)?.[1] ?? 0);
  const padding = "%".repeat(33 * 1024 * 1024);
  const largeText = `${base}${padding}\nstartxref\n${startxref}\n%%EOF`;
  const bytes = new TextEncoder().encode(largeText);
  const requests: Array<[number, number]> = [];
  const source = {
    length: bytes.byteLength,
    async read(begin: number, end: number): Promise<Uint8Array> {
      requests.push([begin, end]);
      if (requests.length <= 8) console.log("R", requests.length, begin, end);
      return bytes.slice(begin, end);
    },
  };
  await assert.rejects(
    () => inspectPdfFrontMatterRange(source, new RecordingOcrAdapter(async () => recognized("unused")), limits({ timeoutMilliseconds: 250, totalRequestTimeoutMilliseconds: 250 })),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code !== "too_large",
  );
  assert.ok(requests.length >= 1);
  assert.ok(requests.every(([begin, end]) => end > begin && end - begin <= SUGGESTION_LIMITS.rangeChunkBytes));
});

test("range-backed inspector ignores a stale response after PDF.js settles its reader", async () => {
  const bytes = makeOversizedRealisticPdf(["Range-backed title evidence"]);
  let reads = 0;
  const source = {
    length: bytes.byteLength,
    read(begin: number, end: number): Promise<Uint8Array> {
      reads += 1;
      if (reads === 1) return Promise.resolve(bytes.slice(begin, end));
      // Simulate a provider response racing PDF.js reader completion. The
      // second callback is stale and must not surface as a parser failure.
      return {
        then(onFulfilled: (value: Uint8Array) => void) {
          const chunk = bytes.slice(begin, end);
          onFulfilled(chunk);
          onFulfilled(chunk);
          return { catch() {} };
        },
      } as unknown as Promise<Uint8Array>;
    },
  };
  const inspection = await inspectPdfFrontMatterRange(
    source,
    new RecordingOcrAdapter(async () => recognized("unused")),
    limits({ timeoutMilliseconds: 1_000, totalRequestTimeoutMilliseconds: 1_000 }),
  );
  assert.equal(inspection.pageCount, 1);
  assert.ok(reads >= 2);
});
