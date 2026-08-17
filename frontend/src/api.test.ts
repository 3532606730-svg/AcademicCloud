import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "./api.ts";

const FOLDER = {
  id: "folder-1",
  parentId: null,
  name: "Folder",
  state: "active",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  deletedAt: null,
};

const FILE = {
  id: "file-1",
  folderId: "folder-1",
  displayName: "paper.pdf",
  mediaType: "application/pdf",
  sizeBytes: 4096,
  checksumAlgorithm: "md5",
  checksum: "GvL9/U7aoQyRRZXavZXUiw==",
  state: "active",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  activatedAt: "2026-08-15T00:00:00.000Z",
  deletedAt: null,
  purgedAt: null,
};

function assertBodylessRequestInit(init: RequestInit | undefined, method: string) {
  expect(init?.method).toBe(method);
  expect(init?.body).toBeUndefined();
  const headers = new Headers(init?.headers);
  expect(headers.get("Content-Type")).toBeNull();
  expect(headers.get("Accept")).toBe("application/json");
}
describe("ApiClient", () => {
  it("binds the browser fetch receiver for the default client", async () => {
    const original = globalThis.fetch;
    const receiver = globalThis;
    const fetcher = vi.fn(function (this: typeof globalThis) {
      if (this !== receiver) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify({ account: { id: "a", loginName: "Scholar", role: "owner" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });
    globalThis.fetch = fetcher as typeof fetch;
    try {
      await expect(new ApiClient().getSession()).resolves.toEqual({ id: "a", loginName: "Scholar", role: "owner" });
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

  it("sends body-bearing JSON requests with Content-Type and a serialized body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ account: { id: "a", loginName: "Scholar", role: "owner" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = new ApiClient({ fetcher });

    await api.login("Scholar", "valid-password");

    expect(fetcher).toHaveBeenCalledOnce();
    const [path, init] = fetcher.mock.calls[0]!;
    expect(path).toBe("/api/auth/login");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Accept")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ loginName: "Scholar", password: "valid-password" }));
  });

  it("sends every bodyless action with NO Content-Type and NO body", async () => {
    const responses = [
      new Response(null, { status: 204 }), // logout
      new Response(JSON.stringify({ folder: FOLDER }), { status: 200, headers: { "content-type": "application/json" } }), // restoreFolder
      new Response(JSON.stringify({ upload: { method: "POST", url: "https://upload.invalid", fields: { key: "k" }, expiresAt: "2026-08-15T00:00:00Z" } }), { status: 200, headers: { "content-type": "application/json" } }), // renewUpload
      new Response(JSON.stringify({ file: FILE }), { status: 200, headers: { "content-type": "application/json" } }), // completeUpload
      new Response(JSON.stringify({ file: FILE }), { status: 200, headers: { "content-type": "application/json" } }), // restoreFile
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    const api = new ApiClient({ fetcher });

    await api.logout();
    await api.restoreFolder("folder-1");
    await api.renewUpload("file-1");
    await api.completeUpload("file-1");
    await api.restoreFile("file-1");

    expect(fetcher).toHaveBeenCalledTimes(5);
    const calls = fetcher.mock.calls.map(([path, init]) => ({ path, init }));

    expect(calls[0]?.path).toBe("/api/auth/logout");
    assertBodylessRequestInit(calls[0]?.init, "POST");
    expect(calls[1]?.path).toBe("/api/drive/folders/folder-1/restore");
    assertBodylessRequestInit(calls[1]?.init, "POST");
    expect(calls[2]?.path).toBe("/api/drive/uploads/file-1/authorization");
    assertBodylessRequestInit(calls[2]?.init, "POST");
    expect(calls[3]?.path).toBe("/api/drive/uploads/file-1/complete");
    assertBodylessRequestInit(calls[3]?.init, "POST");
    expect(calls[4]?.path).toBe("/api/drive/files/file-1/restore");
    assertBodylessRequestInit(calls[4]?.init, "POST");
  });

  it("uses the invitation and account-administration contracts without leaking tokens into request paths", async () => {
    const invitation = {
      id: "invite / one",
      createdByAccountId: "owner-1",
      createdAt: "2026-08-17T00:00:00.000Z",
      expiresAt: "2026-08-24T00:00:00.000Z",
      consumedAt: null,
      consumedByAccountId: null,
      revokedAt: null,
      status: "available",
    };
    const account = { id: "member / one", loginName: "Reader", role: "member", state: "active", createdAt: "2026-08-17T00:00:00.000Z" };
    const responses = [
      new Response(JSON.stringify({ account }), { status: 201, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ invitation, rawToken: "T".repeat(43) }), { status: 201, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ invitations: [invitation] }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ invitation: { ...invitation, status: "revoked" } }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ accounts: [account] }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ account: { ...account, state: "disabled" } }), { status: 200, headers: { "content-type": "application/json" } }),
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    const api = new ApiClient({ fetcher });

    await api.registerMember("R".repeat(43), "Reader", "member-password-123");
    await api.createInvitation();
    await api.listInvitations();
    await api.revokeInvitation("invite / one");
    await api.listAccounts();
    await api.setAccountState("member / one", "disabled");

    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/auth/register");
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ inviteToken: "R".repeat(43), loginName: "Reader", password: "member-password-123" }));
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/accounts/invitations");
    assertBodylessRequestInit(fetcher.mock.calls[1]?.[1], "POST");
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/accounts/invitations");
    expect(fetcher.mock.calls[3]?.[0]).toBe("/api/accounts/invitations/invite%20%2F%20one");
    assertBodylessRequestInit(fetcher.mock.calls[3]?.[1], "DELETE");
    expect(fetcher.mock.calls[4]?.[0]).toBe("/api/accounts");
    expect(fetcher.mock.calls[5]?.[0]).toBe("/api/accounts/member%20%2F%20one/state");
    expect(fetcher.mock.calls[5]?.[1]?.body).toBe(JSON.stringify({ state: "disabled" }));
  });

  it("sends favorites writes as bodyless PUT/DELETE without Content-Type or body", async () => {
    const responses = [
      new Response(null, { status: 204 }), // setFileFavorite(true)
      new Response(null, { status: 204 }), // setFileFavorite(false)
      new Response(null, { status: 204 }), // setFolderFavorite(true)
      new Response(null, { status: 204 }), // setFolderFavorite(false)
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    const api = new ApiClient({ fetcher });

    await api.setFileFavorite("file-1", true);
    await api.setFileFavorite("file-1", false);
    await api.setFolderFavorite("folder-1", true);
    await api.setFolderFavorite("folder-1", false);

    expect(fetcher).toHaveBeenCalledTimes(4);
    const calls = fetcher.mock.calls.map(([path, init]) => ({ path, init }));

    expect(calls[0]?.path).toBe("/api/favorites/files/file-1");
    assertBodylessRequestInit(calls[0]?.init, "PUT");
    expect(calls[1]?.path).toBe("/api/favorites/files/file-1");
    assertBodylessRequestInit(calls[1]?.init, "DELETE");
    expect(calls[2]?.path).toBe("/api/favorites/folders/folder-1");
    assertBodylessRequestInit(calls[2]?.init, "PUT");
    expect(calls[3]?.path).toBe("/api/favorites/folders/folder-1");
    assertBodylessRequestInit(calls[3]?.init, "DELETE");
  });
});
