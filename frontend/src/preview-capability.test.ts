import { describe, expect, it } from "vitest";
import { canPreviewFile } from "./preview-capability.ts";

describe("inline preview presentation policy", () => {
  it.each([
    ["application/pdf", 512 * 1024 * 1024],
    ["image/png", 128 * 1024 * 1024],
    ["text/plain", 16 * 1024 * 1024],
  ])("keeps %s available through its exact size boundary", (mediaType, sizeBytes) => {
    expect(canPreviewFile({ mediaType, sizeBytes })).toBe(true);
    expect(canPreviewFile({ mediaType, sizeBytes: sizeBytes + 1 })).toBe(false);
  });

  it.each([null, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/html", "image/svg+xml"])(
    "does not advertise inline rendering for %s", (mediaType) => {
      expect(canPreviewFile({ mediaType, sizeBytes: 1024 })).toBe(false);
    },
  );
});
