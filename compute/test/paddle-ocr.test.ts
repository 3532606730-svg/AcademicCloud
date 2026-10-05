import assert from "node:assert/strict";
import childProcess, { type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { OcrError } from "../src/ocr.js";
import { SUGGESTION_LIMITS } from "../src/suggestion.js";

import {
  loadPaddleOcrConfig,
  PADDLE_OCR_ENGINE_ID,
  PaddleOcrSidecarAdapter,
} from "../src/paddle-ocr.js";

function controlledSidecar() {
  const requests: { id: string }[] = [];
  let requestReceived!: () => void;
  const received = new Promise<void>((resolve) => { requestReceived = resolve; });
  let kills = 0;
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill() { kills++; return true; },
  }) as unknown as ChildProcessWithoutNullStreams & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough };
  child.stdin.on("data", (chunk: Buffer) => {
    requests.push(JSON.parse(chunk.toString("utf8")) as { id: string });
    requestReceived();
  });
  return { child, received, requests, get kills() { return kills; },
    ready() { child.stdout.write(JSON.stringify({ ready: true, engine: PADDLE_OCR_ENGINE_ID }) + "\n"); },
    exit() { child.emit("exit", null, "SIGKILL"); },
    closed() { child.emit("close", null, "SIGKILL"); },
  };
}

function controlledAdapter() {
  return new PaddleOcrSidecarAdapter({ pythonPath: "/mock", sidecarPath: "/mock", detectionModelPath: "/mock",
    recognitionModelPath: "/mock", cachePath: "/mock", device: "gpu", engineId: PADDLE_OCR_ENGINE_ID });
}

for (const trigger of ["abort", "timeout", "invalid_output"] as const) {
  test(`Paddle ${trigger} retains native closure before concurrent and repeated close can return`, async (t) => {
    const fixture = controlledSidecar();
    t.mock.method(childProcess, "spawn", (() => fixture.child) as unknown as typeof childProcess.spawn);
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    if (trigger === "timeout") t.mock.timers.enable({ apis: ["setTimeout"] });
    const adapter = controlledAdapter();
    const controller = new AbortController();
    const recognition = adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 1 }, controller.signal);
    const rejected = assert.rejects(recognition, (error: unknown) => error instanceof OcrError
      && error.code === (trigger === "invalid_output" ? "engine_failure" : trigger === "abort" ? "aborted" : "timeout"));
    fixture.ready();
    await fixture.received;
    if (trigger === "abort") controller.abort();
    else if (trigger === "timeout") t.mock.timers.tick(SUGGESTION_LIMITS.perPageOcrTimeoutMilliseconds);
    else fixture.child.stdout.write("not-json\n");
    await rejected;
    assert.equal(fixture.kills, 1);
    let closed = 0;
    const first = adapter.close().then(() => { closed++; });
    const second = adapter.close().then(() => { closed++; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(closed, 0, "issuing SIGKILL must not release native ownership");
    fixture.exit();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(closed, 0, "wait for process and stdio closure acknowledgement");
    fixture.closed();
    await Promise.all([first, second]);
    await adapter.close();
    assert.equal(closed, 2);
  });
}

test("Paddle restart waits for the old native child to close and ignores its late events", async (t) => {
  const first = controlledSidecar(), second = controlledSidecar();
  let starts = 0;
  t.mock.method(childProcess, "spawn", (() => (++starts === 1 ? first : second).child) as unknown as typeof childProcess.spawn);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const adapter = controlledAdapter();
  const controller = new AbortController();
  const recognition = adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 1 }, controller.signal);
  const rejected = assert.rejects(recognition, (error: unknown) => error instanceof OcrError && error.code === "aborted");
  first.ready(); await first.received; controller.abort(); await rejected;
  const restarted = adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 2 });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(starts, 1);
  first.exit();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(starts, 1, "exit without closed stdio must not overlap a replacement");
  first.closed();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(starts, 2);
  second.ready(); await second.received;
  first.child.stdout.write("late-invalid-output\n");
  first.child.emit("error", new Error("late old-child error"));
  second.child.stdout.write(JSON.stringify({ id: second.requests[0]!.id, status: "recognized", text: "replacement", confidence: 90 }) + "\n");
  assert.equal((await restarted).text, "replacement");
  assert.equal(second.kills, 0);
  const closing = adapter.close();
  second.exit(); second.closed(); await closing;
});

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

test("Reader geometry is explicitly requested and survives sidecar text cleanup", async () => {
  const adapter = new PaddleOcrSidecarAdapter({
    pythonPath: process.execPath, sidecarPath: "ignored-by-fixture",
    detectionModelPath: "det-model", recognitionModelPath: "rec-model",
    cachePath: join(tmpdir(), "academiccloud-paddlex"), device: "cpu", engineId: PADDLE_OCR_ENGINE_ID,
    executableArguments: [fileURLToPath(new URL("./fixtures/fake-paddle-sidecar.mjs", import.meta.url))],
  });
  try {
    await assert.rejects(adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 5, includeGeometry: true }),
      (error: unknown) => error instanceof OcrError && error.code === "input_limit");
    const result = await adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 5, readerMode: true, includeGeometry: true });
    assert.equal(result.text, "é\n𠮷");
    assert.equal(result.geometry?.status, "available");
    if (result.geometry?.status === "available") {
      assert.deepEqual(result.geometry.lineBoxes.map(({ start, end }) => [start, end]), [[0, 1], [2, 4]]);
    }
    const legacy = await adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 5 });
    assert.equal(legacy.geometry, undefined);
    const missing = await adapter.recognizePage({ imageBytes: new Uint8Array([1]), pageIndex: 2, readerMode: true, includeGeometry: true });
    assert.equal(missing.status, "low_confidence");
    assert.equal(missing.text, "uncertain text");
    assert.deepEqual(missing.geometry, { status: "unavailable" });
  } finally { await adapter.close(); }
});
