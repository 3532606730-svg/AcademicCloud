import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { createCanvas } from "@napi-rs/canvas";

import {
  OCR_LANGUAGES,
  OcrError,
  TESSERACT_ENGINE_ID,
  TESSERACT_VERSION,
  TesseractCliOcrAdapter,
  type TesseractCliConfig,
} from "../../src/suggestions/ocr.js";

const FIXTURE = fileURLToPath(new URL("../fixtures/fake-tesseract.mjs", import.meta.url));
const IMAGE = new Uint8Array(createCanvas(8, 8).toBuffer("image/png"));

function adapter(mode: string): TesseractCliOcrAdapter {
  const config: TesseractCliConfig = {
    executablePath: process.execPath,
    executableArguments: [FIXTURE, mode],
    expectedVersion: TESSERACT_VERSION,
    languages: OCR_LANGUAGES,
    engineId: TESSERACT_ENGINE_ID,
  };
  return new TesseractCliOcrAdapter(config);
}

test("local Tesseract adapter pins engine/languages and returns bounded TSV confidence", async () => {
  const result = await adapter("english").recognizePage({ imageBytes: IMAGE, pageIndex: 1 });
  assert.deepEqual(result, {
    status: "recognized",
    text: "The Mongols and the West",
    confidence: 88,
    engine: TESSERACT_ENGINE_ID,
  });
});

test("low-confidence and unsupported-script OCR never becomes usable evidence", async () => {
  const low = await adapter("low-confidence").recognizePage({ imageBytes: IMAGE, pageIndex: 1 });
  assert.deepEqual(low, { status: "low_confidence", text: "", confidence: 23, engine: TESSERACT_ENGINE_ID });
  const unsupported = await adapter("unsupported").recognizePage({ imageBytes: IMAGE, pageIndex: 1 });
  assert.deepEqual(unsupported, { status: "unsupported_script", text: "", confidence: 88, engine: TESSERACT_ENGINE_ID });
});

test("wrong engine version and missing local language data fail closed", async () => {
  await assert.rejects(
    () => adapter("wrong-version").recognizePage({ imageBytes: IMAGE, pageIndex: 1 }),
    (error: unknown) => error instanceof OcrError && error.code === "engine_version_mismatch",
  );
  await assert.rejects(
    () => adapter("missing-language").recognizePage({ imageBytes: IMAGE, pageIndex: 1 }),
    (error: unknown) => error instanceof OcrError && error.code === "language_data_unavailable",
  );
});

test("OCR output limits, engine failure, and caller cancellation terminate locally", async () => {
  await assert.rejects(
    () => adapter("oversized-text").recognizePage({ imageBytes: IMAGE, pageIndex: 1 }),
    (error: unknown) => error instanceof OcrError && error.code === "output_limit",
  );
  await assert.rejects(
    () => adapter("failure").recognizePage({ imageBytes: IMAGE, pageIndex: 1 }),
    (error: unknown) => error instanceof OcrError && error.code === "engine_failure",
  );
  const controller = new AbortController();
  const pending = adapter("hang").recognizePage({ imageBytes: IMAGE, pageIndex: 1 }, controller.signal);
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(
    () => pending,
    (error: unknown) => error instanceof OcrError && error.code === "aborted",
  );
});
