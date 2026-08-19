import type { MultipartPartAuthorization, UploadAuthorization } from "./api.ts";

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

// Transport failures carry a stable code so the UI can present them through
// the localized error catalog instead of exposing raw English infrastructure
// messages (the message stays available as the technical detail).
export class DirectUploadError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DirectUploadError";
    this.code = code;
  }
}

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
    return Promise.reject(new DirectUploadError("upload_unavailable", "Unsupported direct upload method"));
  }

  const inactivityTimeoutMs = options.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const xhr = (options.xhrFactory ?? (() => new XMLHttpRequest()))();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    // Liveness is BYTE progress: only a strictly increasing, POSITIVE loaded
    // count resets the inactivity window. The baseline is zero, so a
    // loaded=0 event (no bytes advanced), repeated identical values, and
    // regressive values are never treated as proof of a live transfer.
    let lastLoaded = 0;

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

    // A stalled transfer (or one whose progress events never advance the
    // loaded byte count) fires the timer and fails cleanly.
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
            reject(new DirectUploadError("upload_stalled", "The upload stalled because no progress was received."));
          });
        }, inactivityTimeoutMs);
      }
    };

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      if (event.loaded > lastLoaded) {
        lastLoaded = event.loaded;
        scheduleStallTimeout();
      }
      options.onMetrics?.({ loaded: event.loaded, total: event.total });
      options.onProgress?.(Math.min(1, event.loaded / event.total));
    });
    xhr.addEventListener("load", () => {
      finish(() => {
        if (xhr.status === 201) {
          options.onProgress?.(1);
          resolve();
        } else {
          reject(new DirectUploadError("upload_rejected", `Object storage rejected the upload (${xhr.status || "no status"}).`));
        }
      });
    });
    xhr.addEventListener("error", () => finish(() => reject(new DirectUploadError("upload_unreachable", "Could not reach object storage."))));
    xhr.addEventListener("abort", () => finish(() => reject(new DOMException("The upload was cancelled.", "AbortError"))));
    xhr.addEventListener("timeout", () => finish(() => reject(new DirectUploadError("upload_timed_out", "The object-storage upload timed out."))));

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

export function uploadPartDirectly(
  authorization: MultipartPartAuthorization,
  bytes: Blob,
  options: DirectUploadOptions = {},
): Promise<void> {
  if (authorization.method !== "PUT") {
    return Promise.reject(new DirectUploadError("upload_unavailable", "Unsupported upload method"));
  }
  const signedContentLength = Object.entries(authorization.headers)
    .find(([name]) => name.toLowerCase() === "content-length")?.[1];
  if (signedContentLength !== undefined && signedContentLength !== String(bytes.size)) {
    return Promise.reject(new DirectUploadError("upload_metadata_mismatch", "Upload size does not match its authorization"));
  }
  const inactivityTimeoutMs = options.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const xhr = (options.xhrFactory ?? (() => new XMLHttpRequest()))();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let lastLoaded = 0;
    const clearStallTimer = () => {
      if (stallTimer !== undefined) clearTimeout(stallTimer);
      stallTimer = undefined;
    };
    const abort = () => xhr.abort();
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearStallTimer();
      options.signal?.removeEventListener("abort", abort);
      callback();
    };
    const scheduleStallTimeout = () => {
      clearStallTimer();
      if (inactivityTimeoutMs > 0) {
        stallTimer = setTimeout(() => finish(() => {
          try { xhr.abort(); } catch { /* request already ended */ }
          reject(new DirectUploadError("upload_stalled", "The multipart part stalled."));
        }), inactivityTimeoutMs);
      }
    };
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      if (event.loaded > lastLoaded) {
        lastLoaded = event.loaded;
        scheduleStallTimeout();
      }
      options.onMetrics?.({ loaded: event.loaded, total: event.total });
      options.onProgress?.(Math.min(1, event.loaded / event.total));
    });
    xhr.addEventListener("load", () => finish(() => {
      if ([200, 201, 204].includes(xhr.status)) {
        options.onProgress?.(1);
        resolve();
      } else {
        reject(new DirectUploadError("upload_rejected", `Object storage rejected the part (${xhr.status || "no status"}).`));
      }
    }));
    xhr.addEventListener("error", () => finish(() => reject(new DirectUploadError("upload_unreachable", "Could not reach object storage."))));
    xhr.addEventListener("abort", () => finish(() => reject(new DOMException("The upload was paused.", "AbortError"))));
    xhr.addEventListener("timeout", () => finish(() => reject(new DirectUploadError("upload_timed_out", "The multipart part timed out."))));
    if (options.signal?.aborted) {
      reject(new DOMException("The upload was paused.", "AbortError"));
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", authorization.url, true);
    for (const [name, value] of Object.entries(authorization.headers)) {
      // Content-Length is a forbidden browser request header. The user agent
      // derives the exact value from the Blob while the OSS V4 signature still
      // binds that value. Other signed headers (notably Content-MD5) are set
      // explicitly.
      if (name.toLowerCase() !== "content-length") xhr.setRequestHeader(name, value);
    }
    xhr.timeout = options.timeoutMs ?? 0;
    scheduleStallTimeout();
    xhr.send(bytes);
  });
}
