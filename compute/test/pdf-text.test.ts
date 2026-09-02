import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  inspectPdfFrontMatter,
  inspectPdfFrontMatterFile,
  inspectPdfFrontMatterRange,
  inspectPdfText,
  isUsableNativeText,
  pdfRangeAccessPolicy,
  PdfTextInspectionError,
} from "../src/pdf-text.js";
import { OcrError, type OcrAdapter, type OcrRecognition } from "../src/ocr.js";
import { SUGGESTION_LIMITS, type SuggestionLimits } from "../src/suggestion.js";
import { makeOversizedRealisticPdf, makeRealisticPdf } from "./fixtures/realistic-pdf.js";

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

test("initial range must contain the exact requested bytes", async () => {
  await assert.rejects(
    () => inspectPdfFrontMatterRange({
      length: 1_024,
      async read(begin: number, end: number) { return new Uint8Array(Math.max(0, end - begin - 1)); },
    }, new RecordingOcrAdapter(async () => recognized("unused"))),
    (error: unknown) => error instanceof PdfTextInspectionError
      && error.code === "source_unavailable"
      && error.diagnosticStage === "initial_range",
  );
});

class RecordingOcrAdapter implements OcrAdapter {
  readonly calls: Array<{ pageIndex: number; imageBytes: number; width: number; height: number }> = [];

  constructor(readonly recognize: (pageIndex: number, signal?: AbortSignal) => Promise<OcrRecognition>) {}

  async recognizePage(input: { imageBytes: Uint8Array; pageIndex: number }, signal?: AbortSignal): Promise<OcrRecognition> {
    assert.deepEqual([...input.imageBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const image = Buffer.from(input.imageBytes.buffer, input.imageBytes.byteOffset, input.imageBytes.byteLength);
    this.calls.push({
      pageIndex: input.pageIndex,
      imageBytes: input.imageBytes.byteLength,
      width: image.readUInt32BE(16),
      height: image.readUInt32BE(20),
    });
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

test("native-text usability is script-neutral across the scholarly corpus", () => {
  const valid = [
    "元代蒙古帝国政治史研究",
    "Mongolia Between China and the USSR",
    "История Монголии и Центральной Азии",
    "تاريخ منغوليا وآسيا الوسطى",
    "モンゴル帝国史研究",
    "མོང་གོལ་གྱི་ལོ་རྒྱུས།",
    "ᠮᠣᠩᠭᠣᠯ ᠤᠯᠤᠰ",
    "Činggis qaγan",
    "Möngke qaγan",
    "Qubilai qaγan",
    "ulaγan",
    "aγula",
    "ǰarlig",
    "čaǰa šöü γ ɣ",
    "C\u030cinggis qag\u0307an",
  ];
  for (const text of valid) assert.equal(isUsableNativeText(text), true, text);
});

test("native-text usability rejects script-neutral corruption evidence", () => {
  const invalid = [
    "\uFFFD\uFFFD\uFFFD\uFFFD",
    "\uE000\uE001\uE002\uE003",
    "\u0001\u0002\u0003\u0004ab",
    "★◆※—",
    "12345.",
    "aaaaaaaa",
    "ab".repeat(8),
    "A" + "!".repeat(20) + "B",
  ];
  for (const text of invalid) assert.equal(isUsableNativeText(text), false, JSON.stringify(text));
});

test("recognized OCR still requires script-neutral bibliographic evidence usability", async () => {
  const ocr = new RecordingOcrAdapter(async () => recognized("ず之 fO v f 107の652 1987", 60));
  const inspection = await inspectPdfFrontMatter(makeRealisticPdf([""]), ocr);
  assert.equal(inspection.ocrPageCount, 1);
  assert.equal(inspection.pages[0]?.evidenceOrigin, "ocr");
  assert.equal(inspection.pages[0]?.ocrConfidence, 60);
  assert.equal(inspection.pages[0]?.text, "");
  assert.equal(inspection.hasUsableEvidence, false);

  const labelled = new RecordingOcrAdapter(async () => recognized("题名：ず之", 60));
  const labelledInspection = await inspectPdfFrontMatter(makeRealisticPdf([""]), labelled);
  assert.equal(labelledInspection.pages[0]?.text, "");
  assert.equal(labelledInspection.hasUsableEvidence, false);
});

test("real Unicode Russian and Mongolistic PDFs stay on the native-text path", async () => {
  for (const { text, requiredFragments } of [
    { text: "История Монголии и Центральной Азии", requiredFragments: ["История", "Монголии", "Азии"] },
    { text: "Činggis qaγan · Möngke qaɣan · Qubilai qaγan · ǰarlig", requiredFragments: ["Činggis", "γ", "Möngke", "ɣ", "ǰarli"] },
    { text: "ᠮᠣᠩᠭᠣᠯ ᠤᠯᠤᠰ", requiredFragments: ["ᠮᠣᠩᠭᠣᠯ", "ᠤᠯᠤᠰ"] },
  ]) {
    const ocr = new RecordingOcrAdapter(async () => recognized("must not run"));
    const inspection = await inspectPdfFrontMatter(makeRealisticPdf([text]), ocr);
    assert.equal(ocr.calls.length, 0, text);
    assert.equal(inspection.pages[0]?.evidenceOrigin, "native_text", text);
    for (const fragment of requiredFragments) assert.equal(inspection.pages[0]?.text.includes(fragment), true, fragment);
  }
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
  assert.equal(imageInspection.pages[0]?.ocrRenderScale, SUGGESTION_LIMITS.renderScale);
  assert.deepEqual(
    imageOnly.calls.map(({ pageIndex, width, height }) => ({ pageIndex, width, height })),
    [{ pageIndex: 1, width: 918, height: 1188 }],
  );

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

test("oversized OCR pages scale down deterministically without cropping, distortion, or guard expansion", async () => {
  for (const mediaBox of ["0 0 2327 3891", "0 0 4000 2000"]) {
    const adapter = new RecordingOcrAdapter(async () => recognized("Bounded OCR evidence", 91));
    const inspection = await inspectPdfFrontMatter(makePdf([""], mediaBox), adapter);
    const call = adapter.calls[0]!;
    const [,, sourceWidth, sourceHeight] = mediaBox.split(" ").map(Number);
    assert.ok(call.width <= SUGGESTION_LIMITS.maxRenderedPageWidthPixels);
    assert.ok(call.height <= SUGGESTION_LIMITS.maxRenderedPageHeightPixels);
    assert.ok(call.width * call.height <= SUGGESTION_LIMITS.maxRenderedPagePixels);
    assert.ok(call.width * call.height * 4 <= SUGGESTION_LIMITS.maxRenderedBitmapBytes);
    assert.ok(Math.abs(call.width / call.height - sourceWidth! / sourceHeight!) < 0.002);
    assert.ok((inspection.pages[0]?.ocrRenderScale ?? 0) >= 0.1);
    assert.ok((inspection.pages[0]?.ocrRenderScale ?? Infinity) < SUGGESTION_LIMITS.renderScale);
    assert.equal(inspection.pages[0]?.text, "Bounded OCR evidence");
    assert.equal(inspection.pages[0]?.evidenceOrigin, "ocr");
  }
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
  const longEvidence = "Bibliographic evidence ".repeat(SUGGESTION_LIMITS.maxOcrOutputCharactersPerPage);
  const bounded = new RecordingOcrAdapter(async () => recognized(longEvidence));
  const onePage = await inspectPdfFrontMatter(makePdf([""]), bounded);
  assert.equal(onePage.pages[0]?.text.length, SUGGESTION_LIMITS.maxOcrOutputCharactersPerPage);

  const total = new RecordingOcrAdapter(async () => recognized(longEvidence));
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

test("range-backed document loading uses the aggregate request budget while later parser work stays bounded", async () => {
  const bytes = makeOversizedRealisticPdf(["Range-backed title evidence"], {}, 3 * 1024 * 1024);
  let reads = 0;
  const source = {
    length: bytes.byteLength,
    async read(begin: number, end: number): Promise<Uint8Array> {
      reads += 1;
      if (reads > 1) await new Promise((resolve) => setTimeout(resolve, 50));
      return bytes.slice(begin, end);
    },
  };
  const inspection = await inspectPdfFrontMatterRange(
    source,
    new RecordingOcrAdapter(async () => recognized("unused")),
    limits({
      rangeChunkBytes: 512 * 1024,
      timeoutMilliseconds: 20,
      totalRequestTimeoutMilliseconds: 1_000,
    }),
  );
  assert.equal(inspection.pages[0]?.text.includes("Range-backed title evidence"), true);
  assert.ok(reads > 1);
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

test("local-file fallback uses the same strict PDF.js front-matter inspector", async () => {
  const bytes = makePdf(["Local file title evidence"]);
  const directory = await mkdtemp(join(tmpdir(), "academiccloud-pdf-file-test-"));
  const path = join(directory, "fixture.pdf");
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    const inspection = await inspectPdfFrontMatterFile(
      path,
      bytes.byteLength,
      new RecordingOcrAdapter(async () => recognized("unused")),
    );
    assert.equal(inspection.pageCount, 1);
    assert.equal(inspection.pages[0]?.text.includes("Local file title evidence"), true);
  } finally {
    await unlink(path);
    await rmdir(directory);
  }
});

test("range-backed timeout aborts pending source reads and settles without hanging in PDF.js destroy", async () => {
  const bytes = makeOversizedRealisticPdf(["Range lifecycle evidence"], {}, 3 * 1024 * 1024);
  let reads = 0;
  let pendingReadAborted = false;
  const startedAt = Date.now();
  await assert.rejects(
    () => inspectPdfFrontMatterRange({
      length: bytes.byteLength,
      read(begin: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
        reads += 1;
        if (reads === 1) return Promise.resolve(bytes.slice(begin, end));
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            pendingReadAborted = true;
            reject(new Error("aborted"));
          }, { once: true });
        });
      },
    }, new RecordingOcrAdapter(async () => recognized("unused")), limits({
      timeoutMilliseconds: 30,
      totalRequestTimeoutMilliseconds: 30,
    })),
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "timeout",
  );
  assert.ok(reads >= 2);
  assert.equal(pendingReadAborted, true);
  assert.ok(Date.now() - startedAt < 2_000);
});

test("caller abort propagates to an active range source and remains an aborted inspection", async () => {
  const bytes = makeOversizedRealisticPdf(["Range abort evidence"], {}, 3 * 1024 * 1024);
  const controller = new AbortController();
  let reads = 0;
  let pendingReadAborted = false;
  let markPending!: () => void;
  const pending = new Promise<void>((resolve) => { markPending = resolve; });
  const operation = inspectPdfFrontMatterRange({
    length: bytes.byteLength,
    read(begin: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
      reads += 1;
      if (reads === 1) return Promise.resolve(bytes.slice(begin, end));
      markPending();
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          pendingReadAborted = true;
          reject(new Error("aborted"));
        }, { once: true });
      });
    },
  }, new RecordingOcrAdapter(async () => recognized("unused")), limits({
    timeoutMilliseconds: 5_000,
    totalRequestTimeoutMilliseconds: 5_000,
  }), controller.signal);
  await pending;
  controller.abort();
  await assert.rejects(
    () => operation,
    (error: unknown) => error instanceof PdfTextInspectionError && error.code === "aborted",
  );
  assert.equal(pendingReadAborted, true);
});
