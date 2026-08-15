import assert from "node:assert/strict";
import { test } from "node:test";

import { createContentDisposition } from "../../src/storage/authorization.js";

function extractStarValue(header: string): string {
  const match = /filename\*=UTF-8''([^;]*)/.exec(header);
  assert.ok(match, `missing filename* in: ${header}`);
  return decodeURIComponent(match[1]!);
}

function extractFallback(header: string): string {
  const match = /filename="([^"]*)"/.exec(header);
  assert.ok(match, `missing filename fallback in: ${header}`);
  return match[1]!;
}

test("attachment dispositions carry RFC 6266 fallback plus an RFC 5987 Unicode primary", () => {
  const cases = [
    { name: "研究资料.pdf", fallback: "____.pdf" },
    { name: "蒙古史料 01.pdf", fallback: "____ 01.pdf" },
    { name: "你好 世界.txt", fallback: "__ __.txt" },
    { name: "Résumé.pdf", fallback: "R_sum_.pdf" },
    { name: "a b (1).pdf", fallback: "a b (1).pdf" },
    { name: "ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ.pdf", fallback: "______ _____.pdf" },
  ];

  for (const { name, fallback } of cases) {
    const header = createContentDisposition(name, "attachment");

    assert.ok(header.startsWith("attachment; "), header);
    assert.equal(extractFallback(header), fallback, header);
    // The filename* form must round-trip the exact original Unicode name —
    // never mojibake, percent garbage, or an opaque key.
    assert.equal(extractStarValue(header), name, header);
  }
});

test("ASCII filenames remain unchanged and spaces/punctuation survive", () => {
  const header = createContentDisposition("a b (1).pdf", "attachment");

  assert.equal(extractFallback(header), "a b (1).pdf");
  assert.equal(extractStarValue(header), "a b (1).pdf");
});

test("inline dispositions carry no filename parameters that could induce download behavior", () => {
  assert.equal(createContentDisposition("研究资料.pdf", "inline"), "inline");
  assert.equal(createContentDisposition("plain.txt", "inline"), "inline");
});

test("path separators are neutralized instead of leaking traversal", () => {
  const header = createContentDisposition("../研究 资料.pdf", "attachment");

  assert.ok(!header.includes("../"));
  assert.ok(!header.includes("..\\"));
  assert.equal(extractStarValue(header), "../研究 资料.pdf".replace(/[\\/]/g, "_"));
});

test("unsafe or oversized filenames are rejected before signing", () => {
  assert.throws(() => createContentDisposition("", "attachment"), /safe filename/);
  assert.throws(() => createContentDisposition("   ", "attachment"), /safe filename/);
  assert.throws(() => createContentDisposition("bad\u0000name.pdf", "attachment"), /safe filename/);
  assert.throws(() => createContentDisposition("x".repeat(256), "attachment"), /safe filename/);
});
