import type { UploadAuthorization } from "./api.ts";

export type XhrFactory = () => XMLHttpRequest;

export interface DirectUploadOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  xhrFactory?: XhrFactory;
  timeoutMs?: number;
}

const DEFAULT_UPLOAD_TIMEOUT_MS = 15 * 60 * 1_000;

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

  return new Promise((resolve, reject) => {
    const xhr = (options.xhrFactory ?? (() => new XMLHttpRequest()))();
    const abort = () => xhr.abort();

    const finish = (callback: () => void) => {
      options.signal?.removeEventListener("abort", abort);
      callback();
    };

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(Math.min(1, event.loaded / event.total));
      }
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
    xhr.timeout = options.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
    xhr.send(createUploadForm(authorization, file));
  });
}
