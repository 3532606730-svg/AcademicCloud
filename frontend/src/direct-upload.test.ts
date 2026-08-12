import { describe, expect, it, vi } from "vitest";

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
});
