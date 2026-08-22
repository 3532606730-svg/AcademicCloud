import assert from "node:assert/strict";
import { test } from "node:test";

import { createCanvas } from "@napi-rs/canvas";

import { OcrError } from "../src/ocr.js";
import { PaddleOcrSidecarAdapter } from "../src/paddle-ocr.js";

function renderTitlePage(): Uint8Array {
  const canvas = createCanvas(1200, 360);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "black";
  context.textBaseline = "top";
  context.font = "bold 58px sans-serif";
  context.fillText("The Mongols and the West", 40, 60);
  context.font = "42px sans-serif";
  context.fillText("Peter Jackson", 40, 200);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

test("release-local PP-OCRv6 small recognizes a rendered bibliographic page end-to-end", async (context) => {
  const adapter = new PaddleOcrSidecarAdapter();
  const releaseRuntimeConfigured = [
    process.env.PADDLE_OCR_PYTHON_PATH,
    process.env.PADDLE_OCR_SIDECAR_PATH,
    process.env.PADDLE_OCR_DETECTION_MODEL_PATH,
    process.env.PADDLE_OCR_RECOGNITION_MODEL_PATH,
  ].every((value) => typeof value === "string" && value.trim().length > 0);
  try {
    let result;
    try {
      result = await adapter.recognizePage({ imageBytes: renderTitlePage(), pageIndex: 1 });
    } catch (error: unknown) {
      if (!releaseRuntimeConfigured && error instanceof OcrError
        && ["engine_unavailable", "engine_version_mismatch", "engine_failure"].includes(error.code)) {
        context.skip("no release-local pinned PaddleOCR runtime is configured");
        return;
      }
      throw error;
    }
    assert.equal(result.status, "recognized");
    const normalized = result.text.toUpperCase().replace(/[^A-Z]+/gu, " ");
    assert.match(normalized, /MONGOLS/u);
    assert.match(normalized, /JACKSON/u);
    assert.ok(typeof result.confidence === "number" && result.confidence >= 55);
  } finally {
    await adapter.close();
  }
});
