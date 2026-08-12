import { describe, expect, it } from "vitest";

import { calculateFileMd5, hexToBase64 } from "./md5.ts";

describe("calculateFileMd5", () => {
  it("calculates canonical Base64 MD5 across binary chunks and reports progress", async () => {
    const progress: number[] = [];
    const value = await calculateFileMd5(new Blob([new Uint8Array([0, 1, 2, 3, 255])]), {
      chunkSize: 2,
      onProgress: (fraction) => progress.push(fraction),
    });

    expect(value).toBe("tZEhNBqyZ2Zym38df34MLw==");
    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
  });

  it("honors cancellation without reading more chunks", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(calculateFileMd5(new Blob(["academic"]), { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects malformed digests", () => {
    expect(() => hexToBase64("bad")).toThrow(/16-byte/);
  });
});
