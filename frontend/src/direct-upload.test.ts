import { afterEach, describe, expect, it, vi } from "vitest";

import type { MultipartPartAuthorization, UploadAuthorization } from "./api.ts";
import { createUploadForm, uploadDirectly, uploadPartDirectly } from "./direct-upload.ts";

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

const PART_AUTHORIZATION: MultipartPartAuthorization = {
  method: "PUT",
  url: "https://storage.invalid/object?uploadId=opaque&partNumber=2",
  headers: {
    "Content-Length": "6",
    "Content-MD5": "K7Il8LqaWJMHV6ho7VfZow==",
  },
  expiresAt: "2026-08-13T00:00:00.000Z",
};

class FakeXhr extends EventTarget {
  readonly upload = new EventTarget();
  status = 0;
  timeout = 0;
  readonly open = vi.fn();
  readonly setRequestHeader = vi.fn();
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

  it("stalls bounded when progress events repeat the same loaded byte count", async () => {
    vi.useFakeTimers();
    const xhr = new FakeXhr();
    const promise = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
      inactivityTimeoutMs: 120_000,
    });
    const expectation = expect(promise).rejects.toThrow("stalled");

    // Duplicate progress events with an identical (non-advancing) loaded
    // value for longer than the inactivity window must NOT keep the
    // transfer alive: liveness requires strictly increasing bytes.
    for (let index = 0; index < 5; index += 1) {
      xhr.upload.dispatchEvent(progress(3, 10));
      await vi.advanceTimersByTimeAsync(30_000);
    }

    await expectation;
    expect(xhr.abort).toHaveBeenCalledOnce();
    // Exactly-once settlement: nothing else may fire afterwards.
    await vi.advanceTimersByTimeAsync(600_000);
  });

  it("does not treat a zero-byte progress event as liveness", async () => {
    vi.useFakeTimers();
    const xhr = new FakeXhr();
    const promise = uploadDirectly(AUTHORIZATION, new File(["source"], "paper.pdf"), {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
      inactivityTimeoutMs: 120_000,
    });
    const expectation = expect(promise).rejects.toThrow("stalled");

    // Advance close to the deadline, then emit a loaded=0 progress event:
    // zero bytes advanced, so the ORIGINAL deadline must still apply.
    await vi.advanceTimersByTimeAsync(119_000);
    xhr.upload.dispatchEvent(progress(0, 10));
    await vi.advanceTimersByTimeAsync(1_001);

    await expectation;
    expect(xhr.abort).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(600_000);
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

describe("uploadPartDirectly", () => {
  it.each([200, 201, 204])("uses exact PUT headers and accepts provider status %s", async (status) => {
    const xhr = new FakeXhr();
    const bytes = new Blob(["source"]);
    const onProgress = vi.fn();
    const onMetrics = vi.fn();
    const promise = uploadPartDirectly(PART_AUTHORIZATION, bytes, {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
      onProgress,
      onMetrics,
      timeoutMs: 4321,
    });

    xhr.upload.dispatchEvent(progress(3, 6));
    xhr.status = status;
    xhr.dispatchEvent(new Event("load"));

    await expect(promise).resolves.toBeUndefined();
    expect(xhr.open).toHaveBeenCalledWith("PUT", PART_AUTHORIZATION.url, true);
    expect(xhr.setRequestHeader.mock.calls).toEqual([
      ["Content-MD5", "K7Il8LqaWJMHV6ho7VfZow=="],
    ]);
    expect(xhr.timeout).toBe(4321);
    expect(xhr.send).toHaveBeenCalledWith(bytes);
    expect(onMetrics).toHaveBeenCalledWith({ loaded: 3, total: 6 });
    expect(onProgress).toHaveBeenNthCalledWith(1, 0.5);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it("aborts the active PUT without converting pause into abandonment", async () => {
    const xhr = new FakeXhr();
    const controller = new AbortController();
    const promise = uploadPartDirectly(PART_AUTHORIZATION, new Blob(["source"]), {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
      signal: controller.signal,
    });

    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(xhr.abort).toHaveBeenCalledOnce();
  });

  it("rejects a Blob whose browser-derived Content-Length would not match the signature", async () => {
    const xhr = new FakeXhr();
    await expect(uploadPartDirectly(PART_AUTHORIZATION, new Blob(["short"]), {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
    })).rejects.toThrow("does not match");
    expect(xhr.open).not.toHaveBeenCalled();
    expect(xhr.send).not.toHaveBeenCalled();
  });

  it("rejects provider, network, and fixed-timeout failures", async () => {
    const rejected = new FakeXhr();
    const rejectedPromise = uploadPartDirectly(PART_AUTHORIZATION, new Blob(["source"]), {
      xhrFactory: () => rejected as unknown as XMLHttpRequest,
    });
    rejected.status = 403;
    rejected.dispatchEvent(new Event("load"));
    await expect(rejectedPromise).rejects.toMatchObject({ code: "upload_rejected" });

    const unreachable = new FakeXhr();
    const unreachablePromise = uploadPartDirectly(PART_AUTHORIZATION, new Blob(["source"]), {
      xhrFactory: () => unreachable as unknown as XMLHttpRequest,
    });
    unreachable.dispatchEvent(new Event("error"));
    await expect(unreachablePromise).rejects.toMatchObject({ code: "upload_unreachable" });

    const timedOut = new FakeXhr();
    const timeoutPromise = uploadPartDirectly(PART_AUTHORIZATION, new Blob(["source"]), {
      xhrFactory: () => timedOut as unknown as XMLHttpRequest,
    });
    timedOut.dispatchEvent(new Event("timeout"));
    await expect(timeoutPromise).rejects.toMatchObject({ code: "upload_timed_out" });
  });

  it("fails a stalled part after the bounded inactivity window", async () => {
    vi.useFakeTimers();
    const xhr = new FakeXhr();
    const promise = uploadPartDirectly(PART_AUTHORIZATION, new Blob(["source"]), {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
      inactivityTimeoutMs: 1000,
    });
    const expectation = expect(promise).rejects.toMatchObject({ code: "upload_stalled" });

    await vi.advanceTimersByTimeAsync(1001);
    await expectation;
    expect(xhr.abort).toHaveBeenCalledOnce();
  });
});
