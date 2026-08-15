import { describe, expect, it } from "vitest";

import { formatSpeed, UploadProgressTracker } from "./upload-metrics.ts";

describe("UploadProgressTracker", () => {
  it("reports no speed before a meaningful sample window", () => {
    const tracker = new UploadProgressTracker(1_000);
    expect(tracker.record(10, 0)).toEqual({ fraction: 0.01, speedBytesPerSecond: null, etaSeconds: null });
    expect(tracker.record(20, 100)).toEqual({ fraction: 0.02, speedBytesPerSecond: null, etaSeconds: null });
  });

  it("computes speed and ETA from real progress events only", () => {
    const tracker = new UploadProgressTracker(1_000);

    expect(tracker.record(500, 1_000)).toEqual({ fraction: 0.5, speedBytesPerSecond: null, etaSeconds: null });
    expect(tracker.record(1_000, 1_500)).toEqual({
      fraction: 1,
      speedBytesPerSecond: 1_000,
      etaSeconds: 0,
    });
  });

  it("drops samples outside the sliding window", () => {
    const tracker = new UploadProgressTracker(1_000);

    tracker.record(0, 0);
    tracker.record(500, 2_500); // window 2500 ms: sample evicted, no speed
    expect(tracker.record(600, 3_000)).toEqual({
      fraction: 0.6,
      speedBytesPerSecond: 200,
      etaSeconds: 2,
    });
  });

  it("caps the fraction at 1", () => {
    const tracker = new UploadProgressTracker(10);
    expect(tracker.record(50, 1_000).fraction).toBe(1);
  });
});

describe("formatSpeed", () => {
  it("formats bytes, kilobytes, and megabytes", () => {
    expect(formatSpeed(512)).toBe("512 B/s");
    expect(formatSpeed(2_048)).toBe("2.0 KB/s");
    expect(formatSpeed(3.8 * 1_024 * 1_024)).toBe("3.8 MB/s");
  });

  it("never fabricates a speed for invalid input", () => {
    expect(formatSpeed(-1)).toBe("—");
    expect(formatSpeed(Number.NaN)).toBe("—");
  });
});
