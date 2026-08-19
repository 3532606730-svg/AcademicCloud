import assert from "node:assert/strict";
import { test } from "node:test";

import { createCanvas } from "@napi-rs/canvas";

import { extractSuggestions } from "../../src/suggestions/extractor.js";
import {
  OcrError,
  TesseractCliOcrAdapter,
  loadTesseractCliConfig,
  type OcrRecognition,
} from "../../src/suggestions/ocr.js";

/**
 * Real-Tesseract E2E.  This is the "actual Tesseract E2E" gate: it drives the
 * release-local Tesseract 5.5.3 CLI (not the deterministic fake) through a
 * rendered English bibliographic page and proves the TSV parser, script and
 * confidence gates, and the extractor still produce the expected facts.
 *
 * It skips when no real engine is configured, so ordinary Windows development
 * and the pre-build `npm test` step stay green; the production workflow runs it
 * explicitly against `output/release/runtime/tesseract`.
 */

const PROBE = new Uint8Array(createCanvas(48, 48).toBuffer("image/png"));

async function realAdapter(): Promise<TesseractCliOcrAdapter | null> {
  const adapter = new TesseractCliOcrAdapter(loadTesseractCliConfig());
  try {
    await adapter.recognizePage({ imageBytes: PROBE, pageIndex: 1 });
    return adapter;
  } catch (error: unknown) {
    if (error instanceof OcrError && ["engine_unavailable", "language_data_unavailable", "engine_version_mismatch"].includes(error.code)) {
      return null;
    }
    throw error;
  }
}

function renderEnglishTitlePage(): Uint8Array {
  const canvas = createCanvas(1200, 320);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "black";
  context.textBaseline = "top";
  context.font = "bold 56px sans-serif";
  context.fillText("The Mongols and the West", 40, 60);
  context.font = "40px sans-serif";
  context.fillText("Peter Jackson", 40, 180);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

function normalize(value: string): string {
  return value.normalize("NFC").toUpperCase().replace(/[^A-Z0-9]+/gu, " ");
}

test("release-local Tesseract recognizes a rendered bibliographic page end-to-end", async (context) => {
  const adapter = await realAdapter();
  if (!adapter) {
    context.skip("no release-local Tesseract 5.5.3 with chi_sim/chi_tra/eng is configured");
    return;
  }

  const recognition: OcrRecognition = await adapter.recognizePage({ imageBytes: renderEnglishTitlePage(), pageIndex: 1 });
  assert.equal(recognition.status, "recognized", "real Tesseract returned no recognized text");
  assert.ok(typeof recognition.confidence === "number" && recognition.confidence >= 55, "real Tesseract confidence is too low");
  const normalized = normalize(recognition.text);
  assert.match(normalized, /MONGOLS/u, `real OCR missed the title: ${recognition.text}`);
  assert.match(normalized, /JACKSON/u, `real OCR missed the author: ${recognition.text}`);

  const result = extractSuggestions({
    pages: [{ pageIndex: 1, text: recognition.text, evidenceOrigin: "ocr", ocrEngine: recognition.engine, ocrConfidence: recognition.confidence }],
    embeddedMetadata: {},
    filename: "scan.pdf",
  });
  assert.equal(result.status, "ready");
  const title = result.candidates.find((candidate) => candidate.fieldPath === "canonicalTitle");
  const author = result.candidates.find((candidate) => candidate.authorityRole === "author");
  assert.ok(title && /Mongols/iu.test(title.value), `extractor missed the title: ${title?.value}`);
  assert.ok(author && /Jackson/iu.test(author.value), `extractor missed the author: ${author?.value}`);
});
