import { describe, expect, it } from "vitest";

import { displayFileBytes, formatSpeed, UploadProgressTracker } from "./upload-metrics.ts";

describe("UploadProgressTracker", () => {
  it("reports no speed before a meaningful sample window", () => {
    const tracker = new UploadProgressTracker();
    expect(tracker.record(10, 2_000, 0)).toEqual({ fraction: 0.005, speedBytesPerSecond: null, etaSeconds: null });
    expect(tracker.record(20, 2_000, 100)).toEqual({ fraction: 0.01, speedBytesPerSecond: null, etaSeconds: null });
  });

  it("computes raw XHR speed, ETA, and fraction from multipart totals", () => {
    const tracker = new UploadProgressTracker();

    expect(tracker.record(500, 2_000, 1_000)).toEqual({ fraction: 0.25, speedBytesPerSecond: null, etaSeconds: null });
    expect(tracker.record(1_000, 2_000, 1_500)).toEqual({
      fraction: 0.5,
      speedBytesPerSecond: 1_000,
      etaSeconds: 1,
    });
  });

  it("caps the network fraction at 1 even when loaded exceeds total", () => {
    const tracker = new UploadProgressTracker();
    expect(tracker.record(3_000, 2_000, 1_000).fraction).toBe(1);
  });

  it("drops samples outside the sliding window", () => {
    const tracker = new UploadProgressTracker();

    tracker.record(0, 2_000, 0);
    tracker.record(500, 2_000, 2_500); // window 2500 ms: sample evicted, no speed
    expect(tracker.record(600, 2_000, 3_000)).toEqual({
      fraction: 0.3,
      speedBytesPerSecond: 200,
      etaSeconds: 7,
    });
  });

  it("treats regressive loaded values as non-progress for liveness math", () => {
    const tracker = new UploadProgressTracker();

    tracker.record(1_000, 2_000, 0);
    tracker.record(500, 2_000, 1_000); // regressive: transferred is clamped, no speed
    expect(tracker.record(600, 2_000, 1_500).speedBytesPerSecond).toBeNull();
  });
});

describe("displayFileBytes", () => {
  it("maps the XHR fraction onto file bytes without ever exceeding file.size", () => {
    expect(displayFileBytes(1_000, 0.5)).toBe(500);
    expect(displayFileBytes(1_000, 1)).toBe(1_000);
    expect(displayFileBytes(1_000, 1.5)).toBe(1_000); // capped at 100%
    expect(displayFileBytes(1_000, 0)).toBe(0);
    expect(displayFileBytes(1_000, -0.2)).toBe(0);
  });

  it("proves XHR-total-larger-than-file semantics never leak multipart bytes", () => {
    // file.size = 1000, XHR total = 2000 (boundaries + form fields).
    const tracker = new UploadProgressTracker();
    const snapshot = tracker.record(1_000, 2_000, 1_000);

    expect(snapshot.fraction).toBe(0.5);
    expect(snapshot.speedBytesPerSecond).toBeNull();
    // Displayed bytes are fraction × file.size, never the raw 1000 loaded
    // multipart bytes mapped onto the 1000-byte file as 100%.
    expect(displayFileBytes(1_000, snapshot.fraction)).toBe(500);
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
