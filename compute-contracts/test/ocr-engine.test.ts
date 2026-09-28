import assert from "node:assert/strict";
import test from "node:test";

import {
  OCR_ENGINE_MAX_LINE_BOXES,
  OCR_ENGINE_MAX_TEXT_UNITS,
  parseOcrEngineCapabilities,
  parseOcrEnginePageRequest,
  parseOcrEnginePageResult,
  type OcrEngineAdapter,
  type OcrEngineCapabilities,
  type OcrEnginePageResult,
} from "../src/index.js";

const capabilities: OcrEngineCapabilities = {
  engineId: "fixture-engine",
  engineVersion: "1.0.0",
  modelVersion: "revision-1",
  inputMimeTypes: ["image/png", "image/jpeg"],
  scriptHints: ["Hans", "Hant", "en"],
  maxImageBytes: 8,
  canReturnGeometry: true,
};
const requestId = "opaque-request_1";
const expected = { requestId, capabilities };
function result(): OcrEnginePageResult {
  return {
    requestId,
    status: "recognized",
    text: "第一行\nSecond line",
    truncated: false,
    confidence: 82.5,
    provenance: {
      engineId: capabilities.engineId,
      engineVersion: capabilities.engineVersion,
      modelVersion: capabilities.modelVersion,
    },
    lineBoxes: [
      { start: 0, end: 3, x: 0.1, y: 0.1, width: 0.7, height: 0.1 },
      { start: 4, end: 15, x: 0.1, y: 0.4, width: 0.7, height: 0.1 },
    ],
  };
}
function plainResult(): OcrEnginePageResult {
  const value = result();
  delete value.lineBoxes;
  return value;
}
function request() {
  return { requestId, image: new Uint8Array([1, 2, 3]), mimeType: "image/png", languageHints: ["zh-Hant", "en"] };
}

test("capabilities are bounded claims with optional undisclosed model revision", () => {
  assert.deepEqual(parseOcrEngineCapabilities(capabilities), capabilities);
  assert.deepEqual(parseOcrEngineCapabilities({ ...capabilities, modelVersion: null, scriptHints: [] }), { ...capabilities, modelVersion: null, scriptHints: [] });
  for (const patch of [
    { maxImageBytes: 0 }, { maxImageBytes: 1.5 }, { maxImageBytes: Infinity },
    { maxImageBytes: Number.MAX_SAFE_INTEGER + 1 }, { inputMimeTypes: [] },
    { inputMimeTypes: ["image/png", "image/png"] }, { inputMimeTypes: ["application/pdf"] },
    { inputMimeTypes: ["image/svg+xml"] }, { scriptHints: ["en", "en"] },
    { scriptHints: ["https://example.test"] }, { scriptHints: Array(33).fill("en") },
    { canReturnGeometry: "true" }, { engineVersion: "../secret" }, { endpoint: "https://example.test" },
  ]) assert.throws(() => parseOcrEngineCapabilities({ ...capabilities, ...patch }), TypeError);
});

test("binary page requests snapshot bounded bytes and do not create a JSON transport", () => {
  const input = request();
  const parsed = parseOcrEnginePageRequest(input, capabilities);
  assert.deepEqual(parsed, input);
  input.image[0] = 9;
  input.languageHints[0] = "en";
  assert.equal(parsed.image[0], 1);
  assert.equal(parsed.languageHints[0], "zh-Hant");
  assert.throws(() => parseOcrEnginePageRequest(JSON.parse(JSON.stringify(request())), capabilities), TypeError);
  for (const patch of [
    { image: new Uint8Array() }, { image: new Uint8Array(9) }, { image: [1, 2, 3] },
    { image: new Uint16Array([1]) }, { image: "data:image/png;base64,AAAA" },
    { mimeType: "image/webp" }, { mimeType: "application/pdf" }, { languageHints: ["en", "en"] },
    { languageHints: Array(9).fill("en") }, { languageHints: ["a".repeat(65)] },
    { requestId: "https://example.test" }, { requestId: "../document.pdf" },
    { resourceId: "resource-1" }, { ownerId: "owner" }, { role: "owner" },
    { credentials: { token: "secret" } }, { sourceUrl: "https://example.test/signed" },
  ]) assert.throws(() => parseOcrEnginePageRequest({ ...request(), ...patch }, capabilities), TypeError);
  assert.equal(parseOcrEnginePageRequest({ ...request(), image: new Uint8Array(8) }, capabilities).image.byteLength, 8);
});

test("page results preserve text and normalized geometry with fresh objects", () => {
  const input = result();
  const parsed = parseOcrEnginePageResult(input, expected);
  assert.deepEqual(parsed, input);
  assert.notEqual(parsed, input);
  assert.notEqual(parsed.provenance, input.provenance);
  assert.notEqual(parsed.lineBoxes, input.lineBoxes);
  assert.deepEqual(parseOcrEnginePageResult(plainResult(), expected), plainResult());
});

test("correlation and every engine provenance field must match the capability snapshot", () => {
  assert.throws(() => parseOcrEnginePageResult({ ...result(), requestId: "other-page" }, expected), TypeError);
  for (const field of ["engineId", "engineVersion", "modelVersion"] as const) {
    assert.throws(() => parseOcrEnginePageResult({ ...result(), provenance: { ...result().provenance, [field]: "other" } }, expected), TypeError);
  }
  assert.throws(() => parseOcrEnginePageResult({ ...result(), provenance: { ...result().provenance, modelVersion: null } }, expected), TypeError);
  const opaque = { ...expected, capabilities: { ...capabilities, modelVersion: null } };
  assert.equal(parseOcrEnginePageResult({ ...result(), provenance: { ...result().provenance, modelVersion: null } }, opaque).provenance.modelVersion, null);
});

test("results reject authority, URL, path and secret fields at every permitted object layer", () => {
  for (const key of ["ownerId", "accountId", "role", "canonical", "sourceId", "resourceId", "sourceUrl", "path", "credentials", "rawResponse"]) {
    assert.throws(() => parseOcrEnginePageResult({ ...result(), [key]: "private-value" }, expected), TypeError);
    assert.throws(() => parseOcrEnginePageResult({ ...result(), provenance: { ...result().provenance, [key]: "private-value" } }, expected), TypeError);
    assert.throws(() => parseOcrEnginePageResult({ ...result(), lineBoxes: [{ ...result().lineBoxes![0], [key]: "private-value" }] }, expected), TypeError);
  }
  for (const field of ["requestId", "status", "text", "truncated", "confidence", "provenance"]) {
    const value = { ...result() } as Record<string, unknown>;
    delete value[field];
    assert.throws(() => parseOcrEnginePageResult(value, expected), TypeError);
  }
});

test("all four quality states preserve their meaning without inventing confidence thresholds", () => {
  for (const status of ["recognized", "low_confidence"] as const) {
    for (const confidence of [null, 0, 54, 100]) {
      assert.equal(parseOcrEnginePageResult({ ...plainResult(), status, confidence }, expected).confidence, confidence);
    }
  }
  for (const status of ["no_text", "unsupported_script", "low_confidence"] as const) {
    assert.equal(parseOcrEnginePageResult({ ...plainResult(), status, text: null, confidence: null }, expected).text, null);
  }
  for (const patch of [
    { status: "failed" }, { status: "succeeded" }, { text: null },
    { status: "no_text" }, { status: "unsupported_script" },
    { status: "no_text", text: null, truncated: true },
    { status: "low_confidence", text: null, truncated: true },
    { truncated: 1 }, { confidence: -1 }, { confidence: 100.01 },
    { confidence: NaN }, { confidence: Infinity }, { confidence: "99" },
  ]) assert.throws(() => parseOcrEnginePageResult({ ...plainResult(), ...patch }, expected), TypeError);
});

test("text limit counts UTF-16 units and rejects malformed Unicode without truncating silently", () => {
  const text = "𠀀".repeat(OCR_ENGINE_MAX_TEXT_UNITS / 2);
  assert.equal(parseOcrEnginePageResult({ ...plainResult(), text, truncated: true }, expected).text, text);
  for (const text of ["a".repeat(OCR_ENGINE_MAX_TEXT_UNITS + 1), "𠀀".repeat(OCR_ENGINE_MAX_TEXT_UNITS / 2 + 1), "\ud800", "\udc00", "prefix\ud800x", "a\u0000b", "a\u001bb", "", " \n\t"]) {
    assert.throws(() => parseOcrEnginePageResult({ ...plainResult(), text }, expected), TypeError);
  }
  const scholarly = "甲\r\n乙\t𠀀 e\u0301 葛\u{E0100}";
  assert.equal(parseOcrEnginePageResult({ ...plainResult(), text: scholarly }, expected).text, scholarly);
});

test("geometry is optional, bounded, declared by the adapter and anchored to available text", () => {
  const withoutGeometry = { ...expected, capabilities: { ...capabilities, canReturnGeometry: false } };
  assert.deepEqual(parseOcrEnginePageResult(plainResult(), withoutGeometry), plainResult());
  assert.throws(() => parseOcrEnginePageResult(result(), withoutGeometry), TypeError);
  assert.throws(() => parseOcrEnginePageResult({ ...plainResult(), lineBoxes: undefined }, expected), TypeError);
  assert.throws(() => parseOcrEnginePageResult({ ...plainResult(), status: "no_text", text: null, lineBoxes: [] }, expected), TypeError);
  const boxes = Array.from({ length: OCR_ENGINE_MAX_LINE_BOXES }, (_, start) => ({ start, end: start + 1, x: 0, y: 0, width: 1, height: 1 }));
  assert.equal(parseOcrEnginePageResult({ ...plainResult(), text: "a".repeat(boxes.length), lineBoxes: boxes }, expected).lineBoxes?.length, OCR_ENGINE_MAX_LINE_BOXES);
  assert.throws(() => parseOcrEnginePageResult({ ...plainResult(), text: "a".repeat(boxes.length + 1), lineBoxes: [...boxes, boxes[0]] }, expected), TypeError);
});

test("line boxes reject invalid coordinates, overlapping offsets and split surrogate pairs", () => {
  const box = result().lineBoxes![0]!;
  for (const patch of [
    { x: -0.01 }, { y: NaN }, { width: Infinity }, { height: 0 }, { x: 0.9 },
    { y: 1 }, { width: "0.5" }, { start: -1 }, { start: 0.5 }, { end: 0 },
    { end: 99 }, { end: NaN }, { start: "0" },
  ]) assert.throws(() => parseOcrEnginePageResult({ ...result(), lineBoxes: [{ ...box, ...patch }] }, expected), TypeError);
  assert.throws(() => parseOcrEnginePageResult({ ...result(), lineBoxes: [box, { ...box, start: 2, end: 4 }] }, expected), TypeError);
  for (const [start, end] of [[0, 1], [1, 2]]) {
    assert.throws(() => parseOcrEnginePageResult({ ...plainResult(), text: "𠀀乙", lineBoxes: [{ ...box, start, end }] }, expected), TypeError);
  }
  assert.equal(parseOcrEnginePageResult({ ...plainResult(), text: "𠀀乙", lineBoxes: [{ ...box, start: 0, end: 2 }] }, expected).lineBoxes?.[0]?.end, 2);
});

test("plain-data validators reject inherited, symbolic, accessor and sparse result fields", () => {
  assert.throws(() => parseOcrEnginePageResult(Object.create(result()), expected), TypeError);
  assert.throws(() => parseOcrEnginePageResult({ ...result(), [Symbol("private")]: true }, expected), TypeError);
  let called = false;
  const accessor = Object.defineProperty(result(), "text", { get() { called = true; return "secret"; }, enumerable: true });
  assert.throws(() => parseOcrEnginePageResult(accessor, expected), TypeError);
  assert.equal(called, false);
  assert.throws(() => parseOcrEnginePageResult({ ...result(), lineBoxes: new Array(2) }, expected), TypeError);
  const lines = result().lineBoxes!;
  Object.assign(lines, { sourceUrl: "https://example.test" });
  assert.throws(() => parseOcrEnginePageResult({ ...result(), lineBoxes: lines }, expected), TypeError);
  assert.doesNotThrow(() => parseOcrEnginePageResult(Object.assign(Object.create(null), result()), expected));
});

test("adapter surface passes cancellation and supports resource cleanup without a provider", async () => {
  let closed = false;
  const adapter: OcrEngineAdapter = {
    async capabilities() { return capabilities; },
    async recognize(input, { signal }) { signal.throwIfAborted(); return { ...plainResult(), requestId: input.requestId }; },
    async close() { closed = true; },
  };
  const input = parseOcrEnginePageRequest(request(), await adapter.capabilities());
  const controller = new AbortController();
  assert.equal(parseOcrEnginePageResult(await adapter.recognize(input, { signal: controller.signal }), expected).requestId, requestId);
  controller.abort();
  await assert.rejects(adapter.recognize(input, { signal: controller.signal }), { name: "AbortError" });
  await adapter.close();
  await adapter.close();
  assert.equal(closed, true);
});
