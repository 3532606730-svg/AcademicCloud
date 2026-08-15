import { afterEach, describe, expect, it, vi } from "vitest";

import type { UploadAuthorization } from "./api.ts";
import { createUploadForm, uploadDirectly } from "./direct-upload.ts";

const AUTHORIZATION: UploadAuthorization = {
  method: "POST",
  url: "https://storage.invalid",
  fields: {
    key: "objects/aa/example",
    policy: "signed-policy",
    "x-oss-forbid-overwrite": "true",
  },
  expiresAt: "2026-08-13T00:00:00.000Z",
};

class FakeXhr extends EventTarget {
  readonly upload = new EventTarget();
  status = 0;
  timeout = 0;
  readonly open = vi.fn();
  readonly send = vi.fn();
  readonly abort = vi.fn(() => this.dispatchEvent(new Event("abort")));
}

afterEach(() => {
  vi.useRealTimers();
});

function progress(loaded: number, total: number): ProgressEvent {
  return new ProgressEvent("progress", { lengthComputable: true, loaded, total });
}

describe("createUploadForm", () => {
  it("preserves every signed field and appends the file last", () => {
    const file = new File(["source"], "paper.pdf", { type: "application/pdf" });
    const form = createUploadForm(AUTHORIZATION, file);

    expect(Array.from(form.keys())).toEqual(["key", "policy", "x-oss-forbid-overwrite", "file"]);
    expect(form.get("key")).toBe("objects/aa/example");
    expect(form.get("file")).toBeInstanceOf(File);
  });

  it("reports progress and accepts only the policy-bound 201 response", async () => {
    const xhr = new FakeXhr();
    const onProgress = vi.fn();
    const promise = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
      onProgress,
      timeoutMs: 1234,
    });

    xhr.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: 5, total: 10 }));
    xhr.status = 201;
    xhr.dispatchEvent(new Event("load"));

    await expect(promise).resolves.toBeUndefined();
    expect(xhr.open).toHaveBeenCalledWith("POST", AUTHORIZATION.url, true);
    expect(xhr.timeout).toBe(1234);
    expect(xhr.send).toHaveBeenCalledWith(expect.any(FormData));
    expect(onProgress).toHaveBeenNthCalledWith(1, 0.5);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it("rejects a generic 2xx response and a storage timeout", async () => {
    const acceptedButWrongStatus = new FakeXhr();
    const wrongStatus = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => acceptedButWrongStatus as unknown as XMLHttpRequest,
    });
    acceptedButWrongStatus.status = 204;
    acceptedButWrongStatus.dispatchEvent(new Event("load"));
    await expect(wrongStatus).rejects.toThrow("rejected");

    const timedOut = new FakeXhr();
    const timeout = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => timedOut as unknown as XMLHttpRequest,
    });
    timedOut.dispatchEvent(new Event("timeout"));
    await expect(timeout).rejects.toThrow("timed out");
  });

  it("propagates an AbortSignal to the active request", async () => {
    const xhr = new FakeXhr();
    const controller = new AbortController();
    const promise = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
      signal: controller.signal,
    });

    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(xhr.abort).toHaveBeenCalledOnce();
  });

  it("emits real upload metrics alongside fraction progress", async () => {
    const xhr = new FakeXhr();
    const onMetrics = vi.fn();
    const promise = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
      onMetrics,
    });

    xhr.upload.dispatchEvent(progress(5, 10));
    expect(onMetrics).toHaveBeenCalledWith({ loaded: 5, total: 10 });

    xhr.status = 201;
    xhr.dispatchEvent(new Event("load"));
    await expect(promise).resolves.toBeUndefined();
  });

  it("keeps a progressing upload alive well beyond the old fixed total timeout", async () => {
    vi.useFakeTimers();
    const xhr = new FakeXhr();
    const onMetrics = vi.fn();
    const promise = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
      inactivityTimeoutMs: 120_000,
      onMetrics,
    });

    // 20 simulated minutes of steady progress: every progress event resets
    // the inactivity window, so the upload must stay pending.
    for (let index = 0; index < 10; index += 1) {
      xhr.upload.dispatchEvent(progress(index + 1, 10));
      await vi.advanceTimersByTimeAsync(119_000);
    }
    expect(onMetrics).toHaveBeenCalledTimes(10);

    xhr.status = 201;
    xhr.dispatchEvent(new Event("load"));
    await expect(promise).resolves.toBeUndefined();
    expect(xhr.timeout).toBe(0);
  });

  it("fails bounded when no progress arrives within the inactivity window", async () => {
    vi.useFakeTimers();
    const xhr = new FakeXhr();
    const promise = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
      inactivityTimeoutMs: 120_000,
    });

    // Attach the rejection expectation BEFORE the stall timer fires so the
    // rejection is always handled.
    const expectation = expect(promise).rejects.toThrow("stalled");
    await vi.advanceTimersByTimeAsync(120_001);
    await expectation;
    expect(xhr.abort).toHaveBeenCalledOnce();
  });

  it("clears stall timers exactly once on load, abort, and network error", async () => {
    vi.useFakeTimers();

    const loaded = new FakeXhr();
    const loadPromise = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => loaded as unknown as XMLHttpRequest,
      inactivityTimeoutMs: 120_000,
    });
    loaded.status = 201;
    loaded.dispatchEvent(new Event("load"));
    await expect(loadPromise).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(600_000); // nothing may settle twice or throw

    const aborted = new FakeXhr();
    const abortController = new AbortController();
    const abortPromise = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => aborted as unknown as XMLHttpRequest,
      inactivityTimeoutMs: 120_000,
      signal: abortController.signal,
    });
    abortController.abort();
    await expect(abortPromise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(600_000);

    const errored = new FakeXhr();
    const errorPromise = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => errored as unknown as XMLHttpRequest,
      inactivityTimeoutMs: 120_000,
    });
    errored.dispatchEvent(new Event("error"));
    await expect(errorPromise).rejects.toThrow("reach object storage");
    await vi.advanceTimersByTimeAsync(600_000);
  });
});
