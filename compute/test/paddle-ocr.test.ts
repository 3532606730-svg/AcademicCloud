import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

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

test("production PaddleOCR resolves only release-local sidecar/models and rejects path overrides", () => {
  const config = loadPaddleOcrConfig({ NODE_ENV: "production" });
  assert.match(config.pythonPath.replaceAll("\\", "/"), /runtime\/paddle\/venv\/bin\/python$/u);
  assert.match(config.sidecarPath.replaceAll("\\", "/"), /runtime\/paddle\/paddle_ocr_sidecar\.py$/u);
  assert.match(config.detectionModelPath.replaceAll("\\", "/"), /runtime\/paddle\/models\/PP-OCRv6_small_det$/u);
  assert.match(config.recognitionModelPath.replaceAll("\\", "/"), /runtime\/paddle\/models\/PP-OCRv6_small_rec$/u);
  assert.throws(() => loadPaddleOcrConfig({ NODE_ENV: "production", PADDLE_OCR_PYTHON_PATH: "/tmp/python" }), /release-local/u);
});
