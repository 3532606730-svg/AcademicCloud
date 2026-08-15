// Pure, deterministic upload progress metrics over REAL XHR upload events.
// The XHR `loaded`/`total` pair covers the whole multipart body (file bytes
// plus boundaries and signed form fields), so every raw metric — fraction,
// speed, ETA — is derived from those XHR values only. File-size semantics
// enter only when the UI maps the network fraction onto display bytes, which
// never exceeds file.size and never exceeds 100%.
export interface UploadMetricsSnapshot {
  /** XHR network fraction = loaded / total, capped at 1. */
  fraction: number;
  /** Raw XHR throughput in bytes/second, or null before a meaningful window. */
  speedBytesPerSecond: number | null;
  /** Seconds remaining for the XHR body at the current raw speed. */
  etaSeconds: number | null;
}

export const SPEED_WINDOW_MILLISECONDS = 2_000;
export const MIN_SAMPLE_WINDOW_MILLISECONDS = 500;

export class UploadProgressTracker {
  private readonly samples: Array<{ loaded: number; atMilliseconds: number }> = [];

  record(loaded: number, total: number, atMilliseconds: number): UploadMetricsSnapshot {
    const clampedLoaded = Math.max(0, loaded);
    const safeTotal = total > 0 ? total : 1;

    this.samples.push({ loaded: clampedLoaded, atMilliseconds });

    while (
      this.samples.length > 1 &&
      atMilliseconds - this.samples[0]!.atMilliseconds > SPEED_WINDOW_MILLISECONDS
    ) {
      this.samples.shift();
    }

    const fraction = Math.min(1, clampedLoaded / safeTotal);
    const first = this.samples[0]!;
    const windowMilliseconds = atMilliseconds - first.atMilliseconds;
    const transferred = clampedLoaded - first.loaded;

    if (windowMilliseconds >= MIN_SAMPLE_WINDOW_MILLISECONDS && transferred > 0) {
      const speedBytesPerSecond = transferred / (windowMilliseconds / 1_000);
      const remaining = Math.max(0, safeTotal - clampedLoaded);
      return {
        fraction,
        speedBytesPerSecond,
        etaSeconds: remaining > 0 ? Math.ceil(remaining / speedBytesPerSecond) : 0,
      };
    }

    return { fraction, speedBytesPerSecond: null, etaSeconds: null };
  }
}

// Maps the XHR network fraction onto intuitive FILE bytes: the displayed
// value can never exceed fileSize (or 0 for degenerate fractions), so the
// UI never claims more than 100% of the selected file has been transferred.
export function displayFileBytes(fileSize: number, fraction: number): number {
  if (!Number.isFinite(fraction) || fraction <= 0 || fileSize <= 0) {
    return 0;
  }
  return Math.min(fileSize, Math.round(fraction * fileSize));
}

const SPEED_UNITS: ReadonlyArray<string> = ["B/s", "KB/s", "MB/s", "GB/s"];

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0) {
    return "—";
  }

  let value = bytesPerSecond;
  let index = 0;

  while (value >= 1_024 && index < SPEED_UNITS.length - 1) {
    value /= 1_024;
    index += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${SPEED_UNITS[index]}`;
}
