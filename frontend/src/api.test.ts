import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "./api.ts";

describe("ApiClient", () => {
  it("binds the browser fetch receiver for the default client", async () => {
    const original = globalThis.fetch;
    const receiver = globalThis;
    const fetcher = vi.fn(function (this: typeof globalThis) {
      if (this !== receiver) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify({ account: { id: "a", loginName: "Scholar" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });
    globalThis.fetch = fetcher as typeof fetch;
    try {
      await expect(new ApiClient().getSession()).resolves.toEqual({ id: "a", loginName: "Scholar" });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("uses same-origin credentials, strict JSON, and encodes folder IDs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ folder: null, folders: [], files: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = new ApiClient({ fetcher });

    await api.listEntries("folder / one");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/drive/entries?folderId=folder%20%2F%20one",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("maps stable errors and reports session expiry", async () => {
    const unauthorized = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "authentication_required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = new ApiClient({ fetcher, onUnauthorized: unauthorized });

    await expect(api.getSession()).rejects.toMatchObject({
      status: 401,
      code: "authentication_required",
    });
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it("requests inline only when explicitly previewing", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ download: { method: "GET", url: "https://signed.invalid", expiresAt: "2026-08-13T00:00:00Z" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = new ApiClient({ fetcher });

    await api.createDownload("file one", "inline");
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/drive/files/file%20one/download?disposition=inline");
  });
});
