import { describe, expect, it } from "vitest";

import { isSameRecoveredFile, normalizeRecoveredFilename } from "./recovery-identity.ts";

const MD5 = "YWNhZGVtaWNjbG91ZA==";

describe("normalizeRecoveredFilename", () => {
  it("normalizes to NFC and trims", () => {
    expect(normalizeRecoveredFilename("  e\u0301tude.pdf  ")).toBe("\u00e9tude.pdf");
    expect(normalizeRecoveredFilename("\u00e9tude.pdf")).toBe("\u00e9tude.pdf");
  });
});

describe("isSameRecoveredFile", () => {
  const existing = { displayName: "论文.pdf", sizeBytes: 1024, checksum: MD5 };

  it("accepts an NFC stored name with an NFD-selected name", () => {
    // NFC "é" (U+00E9) vs NFD "e" + combining acute (U+0301).
    const nfd = "e\u0301tude.pdf";
    const nfc = nfd.normalize("NFC");
    expect(nfc).not.toBe(nfd);
    expect(isSameRecoveredFile({ ...existing, displayName: nfc }, nfd, 1024, MD5)).toBe(true);
  });

  it("accepts the same bytes/size/checksum regardless of browser MIME", () => {
    // MIME is deliberately not part of recovery identity.
    expect(isSameRecoveredFile(existing, "论文.pdf", 1024, MD5)).toBe(true);
  });

  it("rejects a checksum mismatch", () => {
    expect(isSameRecoveredFile(existing, "论文.pdf", 1024, "AAAA")).toBe(false);
  });

  it("rejects a size mismatch", () => {
    expect(isSameRecoveredFile(existing, "论文.pdf", 1025, MD5)).toBe(false);
  });

  it("rejects a genuinely different normalized filename", () => {
    expect(isSameRecoveredFile(existing, "其他.pdf", 1024, MD5)).toBe(false);
  });
});
