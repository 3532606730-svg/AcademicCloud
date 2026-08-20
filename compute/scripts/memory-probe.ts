import assert from "node:assert/strict";

import { makeRealisticPdf } from "../test/fixtures/realistic-pdf.js";
import { PdfJsFrontMatterInspector } from "../src/pdf-text.js";
import type { OcrAdapter } from "../src/ocr.js";
import { computeMetadataSuggestions } from "../src/worker.js";
import type { PdfRangeSource } from "../src/suggestion.js";

const MiB = 1024 * 1024;
const runs = 5;
const realTesseract = [
  process.env.OCR_TESSERACT_PATH,
  process.env.OCR_TESSDATA_PATH,
  process.env.OCR_TESSERACT_LIBRARY_PATH,
].every((value) => typeof value === "string" && value.length > 0);
const probeOcr: OcrAdapter = {
  async recognizePage(input) {
    return {
      status: "recognized",
      text: input.pageIndex === 1
        ? "A Durable Compute Memory Probe\nby\nAcademicCloud"
        : "Copyright 2026 AcademicCloud Press\nISBN 978-0-306-40615-7",
      confidence: 90,
      engine: "memory-probe-ocr",
    };
  },
};
const inspector = realTesseract
  ? new PdfJsFrontMatterInspector()
  : new PdfJsFrontMatterInspector(probeOcr);

class MemoryRangeSource implements PdfRangeSource {
  readonly length: number;

  constructor(private readonly bytes: Uint8Array) {
    this.length = bytes.byteLength;
  }

  async read(begin: number, end: number): Promise<Uint8Array> {
    return new Uint8Array(this.bytes.subarray(begin, end));
  }
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  globalThis.gc?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
  globalThis.gc?.();
}

await settle();
const cleanStartRssBytes = process.memoryUsage.rss();
let peakRssBytes = cleanStartRssBytes;
const samples: Array<{ run: number; preRssBytes: number; peakRssBytes: number; postRssBytes: number }> = [];

for (let run = 1; run <= runs; run += 1) {
  await settle();
  const preRssBytes = process.memoryUsage.rss();
  let runPeakRssBytes = preRssBytes;
  const sampler = setInterval(() => {
    runPeakRssBytes = Math.max(runPeakRssBytes, process.memoryUsage.rss());
  }, 5);
  try {
    const body = "This is bounded ordinary body text used to measure repeat cleanup. ".repeat(120);
    const pages = Array.from({ length: 20 }, (_, index) => index < 2 ? "" : body);
    const source = new MemoryRangeSource(makeRealisticPdf(pages, {
      info: { title: "A Durable Compute Memory Probe" },
    }));
    const result = await computeMetadataSuggestions(source, inspector);
    assert.equal(result.window.pageIndices.length, 20);
    assert.ok(result.candidates.length > 0);
  } finally {
    clearInterval(sampler);
  }
  runPeakRssBytes = Math.max(runPeakRssBytes, process.memoryUsage.rss());
  peakRssBytes = Math.max(peakRssBytes, runPeakRssBytes);
  await settle();
  samples.push({ run, preRssBytes, peakRssBytes: runPeakRssBytes, postRssBytes: process.memoryUsage.rss() });
}

const postJobRssBytes = samples.at(-1)!.postRssBytes;
const retainedGrowthBytes = postJobRssBytes - cleanStartRssBytes;
const repeatDriftBytes = samples.at(-1)!.postRssBytes - samples[0]!.postRssBytes;
assert.ok(peakRssBytes < 512 * MiB, `Compute peak RSS exceeded 512 MiB: ${peakRssBytes}`);
assert.ok(repeatDriftBytes < 64 * MiB, `repeat-run RSS drift exceeded 64 MiB: ${repeatDriftBytes}`);

process.stdout.write(`${JSON.stringify({
  status: "ok",
  cleanStartRssBytes,
  peakRssBytes,
  postJobRssBytes,
  retainedGrowthBytes,
  repeatDriftBytes,
  runs,
  ocrMode: realTesseract ? "release_local_tesseract" : "deterministic_fixture",
  samples,
})}\n`);
