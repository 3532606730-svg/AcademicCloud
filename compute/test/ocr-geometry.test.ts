import assert from "node:assert/strict";
import test from "node:test";
import { prepareOcrGeometry } from "../src/ocr-geometry.js";

const box = (start: number, end: number) => ({ start, end, x: 0.1, y: 0.2, width: 0.3, height: 0.1 });
const geometry = (lineBoxes: unknown[]) => ({ status: "available", imageWidth: 100, imageHeight: 200, lineBoxes });

test("geometry spans follow NFC, CRLF, controls, trim and non-BMP text", () => {
  const raw = "  e\u0301\r\n𠮷\u0001x  ";
  const result = prepareOcrGeometry(raw, geometry([box(2, 4), box(6, 10)]), 100);
  assert.equal(result.text, "é\n𠮷x");
  assert.deepEqual(result.geometry, geometry([box(0, 1), box(2, 5)]));
  assert.equal(result.truncated, false);
});

test("truncation drops a partial line box and never splits a surrogate pair", () => {
  const result = prepareOcrGeometry("A\n𠮷BC", geometry([box(0, 1), box(2, 6)]), 3);
  assert.equal(result.text, "A\n");
  assert.equal(result.truncated, true);
  assert.deepEqual(result.geometry, { ...geometry([box(0, 1)]), status: "limited" });
});

test("normalization crossing a geometry boundary fails layout without losing text", () => {
  for (const [raw, boxes] of [
    ["e\u0301", [box(0, 1), box(1, 2)]],
    ["A\r\nB", [box(0, 2), box(2, 4)]],
  ] as const) {
    const result = prepareOcrGeometry(raw, geometry([...boxes]), 100);
    assert.equal(result.geometry.status, "invalid");
    assert.equal(result.text, raw.normalize("NFC").replace(/\r\n?/gu, "\n"));
  }
});

test("malformed optional layout never changes useful recognized text", () => {
  const bad = [
    null, { status: "unavailable", imageWidth: 100 },
    geometry([box(0, 2), box(1, 3)]), geometry([box(1, 2)]),
    geometry([{ ...box(0, 3), x: NaN }]), geometry([{ ...box(0, 3), width: 0 }]),
    geometry([{ ...box(0, 3), x: 0.9 }]), geometry([{ ...box(0, 3), x: -0.1 }]),
    geometry([{ ...box(0, 3), extra: true }]),
    { ...geometry([box(0, 3)]), imageWidth: 100.1 },
    { ...geometry([box(0, 3)]), imageHeight: 3_000 },
    geometry(Array.from({ length: 513 }, () => box(0, 3))),
  ];
  for (const value of bad) {
    const result = prepareOcrGeometry("𠮷x", value, 100);
    assert.equal(result.text, "𠮷x");
    assert.equal(result.geometry.status, "invalid");
  }
  assert.deepEqual(prepareOcrGeometry("𠮷x", undefined, 100).geometry, { status: "unavailable" });
});

test("geometry must match the actual submitted bitmap, not just its aspect ratio", () => {
  const result = prepareOcrGeometry("ABC", geometry([box(0, 3)]), 100, { width: 200, height: 400 });
  assert.equal(result.text, "ABC");
  assert.equal(result.geometry.status, "invalid");
});

test("512 ordered boxes remain bounded and unchanged cleaning is idempotent", () => {
  const raw = Array.from({ length: 512 }, () => "x").join("\n");
  const boxes = Array.from({ length: 512 }, (_, i) => box(i * 2, i * 2 + 1));
  const first = prepareOcrGeometry(raw, geometry(boxes), 16_384);
  assert.deepEqual(first.geometry, geometry(boxes));
  assert.deepEqual(prepareOcrGeometry(first.text, first.geometry, 16_384), first);
});
