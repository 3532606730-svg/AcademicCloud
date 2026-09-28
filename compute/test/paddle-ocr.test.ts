import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { OcrError } from "../src/ocr.js";

import {
  loadPaddleOcrConfig,
  PADDLE_OCR_ENGINE_ID,
  PaddleOcrSidecarAdapter,
} from "../src/paddle-ocr.js";

test("PaddleOCR sidecar keeps rendered bytes in memory and returns pinned bounded recognition", async () => {
  const adapter = new PaddleOcrSidecarAdapter({
    pythonPath: process.execPath,
    sidecarPath: "ignored-by-fixture",
    detectionModelPath: "det-model",
    recognitionModelPath: "rec-model",
    cachePath: join(tmpdir(), "academiccloud-paddlex"),
    device: "cpu",
    engineId: PADDLE_OCR_ENGINE_ID,
    executableArguments: [fileURLToPath(new URL("./fixtures/fake-paddle-sidecar.mjs", import.meta.url))],
  });
  try {
    const result = await adapter.recognizePage({ imageBytes: new Uint8Array([1, 2, 3]), pageIndex: 1 });
    assert.deepEqual(result, {
      status: "recognized",
      text: "近代中国史研究\n王明 著",
      confidence: 93,
      engine: PADDLE_OCR_ENGINE_ID,
    });
  } finally {
    await adapter.close();
  }
});

test("Reader sidecar requests retain uncertain text and report truncation without relaxing bibliography", async () => {
  const adapter = new PaddleOcrSidecarAdapter({
    pythonPath: process.execPath, sidecarPath: "ignored-by-fixture",
    detectionModelPath: "det-model", recognitionModelPath: "rec-model",
    cachePath: join(tmpdir(), "academiccloud-paddlex"), device: "cpu", engineId: PADDLE_OCR_ENGINE_ID,
    executableArguments: [fileURLToPath(new URL("./fixtures/fake-paddle-sidecar.mjs", import.meta.url))],
  });
  try {
    const legacy = await adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 2 });
    assert.equal(legacy.text, "");
    assert.equal(legacy.status, "low_confidence");
    const reader = await adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 2, readerMode: true });
    assert.equal(reader.text, "uncertain text");
    assert.equal(reader.status, "low_confidence");
    assert.equal(reader.truncated, false);
    await assert.rejects(adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 3 }),
      (error: unknown) => error instanceof OcrError && error.code === "output_limit");
    const bounded = await adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 3, readerMode: true });
    assert.equal(bounded.text.length, 16_384);
    assert.equal(bounded.text.isWellFormed(), true);
    assert.equal(bounded.truncated, true);
    await assert.rejects(adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 4, readerMode: true }),
      (error: unknown) => error instanceof OcrError && error.code === "engine_failure");
  } finally { await adapter.close(); }
});

test("production PaddleOCR resolves only release-local sidecar/models and rejects path overrides", () => {
  const config = loadPaddleOcrConfig({ NODE_ENV: "production" });
  assert.ok(PADDLE_OCR_ENGINE_ID.length <= 128, "candidate OCR provenance must fit migration 020");
  assert.match(config.pythonPath.replaceAll("\\", "/"), /runtime\/paddle\/venv\/bin\/python$/u);
  assert.match(config.sidecarPath.replaceAll("\\", "/"), /runtime\/paddle\/paddle_ocr_sidecar\.py$/u);
  assert.match(config.detectionModelPath.replaceAll("\\", "/"), /runtime\/paddle\/models\/PP-OCRv6_small_det$/u);
  assert.match(config.recognitionModelPath.replaceAll("\\", "/"), /runtime\/paddle\/models\/PP-OCRv6_small_rec$/u);
  assert.equal(config.cachePath, join(tmpdir(), "academiccloud-paddlex"));
  assert.equal(config.cachePath.includes(".paddlex"), false, "PaddleX must not write through the user home");
  assert.equal(config.device, "cpu");
  assert.equal(loadPaddleOcrConfig({ NODE_ENV: "production", PADDLE_OCR_DEVICE: "gpu" }).device, "gpu");
  assert.throws(() => loadPaddleOcrConfig({ PADDLE_OCR_DEVICE: "cuda" }), /PADDLE_OCR_DEVICE/u);
  assert.throws(() => loadPaddleOcrConfig({ NODE_ENV: "production", PADDLE_OCR_PYTHON_PATH: "/tmp/python" }), /release-local/u);
});
