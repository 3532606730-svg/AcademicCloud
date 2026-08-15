// Pure, deterministic upload progress metrics. Speed is measured over a
// bounded sliding window of real upload progress events only — never during
// checksum calculation, where no network transfer exists.
export interface UploadProgressSample {
  loaded: number;
  atMilliseconds: number;
}

export interface UploadMetricsSnapshot {
  fraction: number;
  speedBytesPerSecond: number | null;
  etaSeconds: number | null;
}

export const SPEED_WINDOW_MILLISECONDS = 2_000;
export const MIN_SAMPLE_WINDOW_MILLISECONDS = 500;

export class UploadProgressTracker {
  private readonly samples: UploadProgressSample[] = [];

  constructor(private readonly totalBytes: number) {}

  record(loaded: number, atMilliseconds: number): UploadMetricsSnapshot {
    this.samples.push({ loaded, atMilliseconds });

    while (
      this.samples.length > 1 &&
      atMilliseconds - this.samples[0]!.atMilliseconds > SPEED_WINDOW_MILLISECONDS
    ) {
      this.samples.shift();
    }

    const fraction = this.totalBytes > 0 ? Math.min(1, loaded / this.totalBytes) : 0;
    const first = this.samples[0]!;
    const windowMilliseconds = atMilliseconds - first.atMilliseconds;
    const transferred = loaded - first.loaded;

    if (windowMilliseconds >= MIN_SAMPLE_WINDOW_MILLISECONDS && transferred > 0 && this.totalBytes > 0) {
      const speedBytesPerSecond = transferred / (windowMilliseconds / 1_000);
      const remaining = Math.max(0, this.totalBytes - loaded);
      return {
        fraction,
        speedBytesPerSecond,
        etaSeconds: remaining > 0 ? Math.ceil(remaining / speedBytesPerSecond) : 0,
      };
    }

    return { fraction, speedBytesPerSecond: null, etaSeconds: null };
  }
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
