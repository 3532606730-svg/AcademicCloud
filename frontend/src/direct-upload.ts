import type { UploadAuthorization } from "./api.ts";

export type XhrFactory = () => XMLHttpRequest;

export interface UploadProgressMetrics {
  loaded: number;
  total: number;
}

export interface DirectUploadOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  onMetrics?: (metrics: UploadProgressMetrics) => void;
  xhrFactory?: XhrFactory;
  /** Legacy fixed total timeout; defaults to disabled (0). Prefer the
   *  inactivity timeout, which tolerates long-running uploads that keep
   *  making real progress. */
  timeoutMs?: number;
  inactivityTimeoutMs?: number;
}

export const DEFAULT_INACTIVITY_TIMEOUT_MS = 120_000;

export function createUploadForm(authorization: UploadAuthorization, file: File): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(authorization.fields)) {
    form.append(name, value);
  }
  form.append("file", file, file.name);
  return form;
}

export function uploadDirectly(
  authorization: UploadAuthorization,
  file: File,
  options: DirectUploadOptions = {},
): Promise<void> {
  if (authorization.method !== "POST") {
    return Promise.reject(new TypeError("Unsupported direct upload method"));
  }

  const inactivityTimeoutMs = options.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const xhr = (options.xhrFactory ?? (() => new XMLHttpRequest()))();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const clearStallTimer = () => {
      if (stallTimer !== undefined) {
        clearTimeout(stallTimer);
        stallTimer = undefined;
      }
    };

    const abort = () => xhr.abort();

    // Exactly-once settlement: every path (load, error, abort, timeout, stall,
    // signal) goes through finish, which also performs single cleanup.
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearStallTimer();
      options.signal?.removeEventListener("abort", abort);
      callback();
    };

    // Any real progress event proves liveness and resets the inactivity
    // window; a stalled transfer fires the timer and fails cleanly.
    const scheduleStallTimeout = () => {
      clearStallTimer();
      if (inactivityTimeoutMs > 0) {
        stallTimer = setTimeout(() => {
          finish(() => {
            try {
              xhr.abort();
            } catch {
              // The connection may already be gone; the rejection is what matters.
            }
            reject(new Error("The upload stalled because no progress was received. Check your connection and try again."));
          });
        }, inactivityTimeoutMs);
      }
    };

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      scheduleStallTimeout();
      options.onMetrics?.({ loaded: event.loaded, total: event.total });
      options.onProgress?.(Math.min(1, event.loaded / event.total));
    });
    xhr.addEventListener("load", () => {
      finish(() => {
        if (xhr.status === 201) {
          options.onProgress?.(1);
          resolve();
        } else {
          reject(new Error(`Object storage rejected the upload (${xhr.status || "no status"}).`));
        }
      });
    });
    xhr.addEventListener("error", () => finish(() => reject(new Error("Could not reach object storage."))));
    xhr.addEventListener("abort", () => finish(() => reject(new DOMException("The upload was cancelled.", "AbortError"))));
    xhr.addEventListener("timeout", () => finish(() => reject(new Error("The object-storage upload timed out."))));

    if (options.signal?.aborted) {
      reject(new DOMException("The upload was cancelled.", "AbortError"));
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    xhr.open("POST", authorization.url, true);
    xhr.timeout = options.timeoutMs ?? 0;
    scheduleStallTimeout();
    xhr.send(createUploadForm(authorization, file));
  });
}
