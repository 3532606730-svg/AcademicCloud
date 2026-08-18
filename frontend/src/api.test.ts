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
  version: "f".repeat(43),
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
  version: "g".repeat(43),
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

  it("sends credential redemption only in a same-origin JSON body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const api = new ApiClient({ fetcher });

    await api.redeemCredentialReset("R".repeat(43), "new-password-456");

    expect(fetcher).toHaveBeenCalledOnce();
    const [path, init] = fetcher.mock.calls[0]!;
    expect(path).toBe("/api/auth/credential-reset");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({
      token: "R".repeat(43),
      newPassword: "new-password-456",
    }));
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

  it("reveals archived accounts only through the explicit query and sends exact lifecycle states", async () => {
    const archived = { id: "member / one", loginName: "Reader", role: "member", state: "archived", createdAt: "2026-08-17T00:00:00.000Z" };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [archived] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ account: archived }), { status: 200, headers: { "content-type": "application/json" } }));
    const api = new ApiClient({ fetcher });

    await api.listAccounts();
    await api.listAccounts(true);
    await api.setAccountState(archived.id, "archived");

    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/accounts");
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/accounts?includeArchived=true");
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/accounts/member%20%2F%20one/state");
    expect(fetcher.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({ state: "archived" }));
  });

  it("uses announcement read/admin contracts and bodyless publication actions", async () => {
    const announcement = {
      id: "announcement / one",
      title: "Notice",
      body: "Body",
      severity: "info",
      linkUrl: null,
      isActive: false,
      publishedAt: null,
      expiresAt: null,
      createdByAccountId: "owner-1",
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };
    const input = { title: "Notice", body: "Body", severity: "info" as const, linkUrl: null, expiresAt: null };
    const responses = [
      new Response(JSON.stringify({ announcements: [announcement] }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ announcements: [announcement] }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ announcement }), { status: 201, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ announcement }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ announcement: { ...announcement, isActive: true } }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ announcement }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(null, { status: 204 }),
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    const api = new ApiClient({ fetcher });

    await api.listAnnouncements();
    await api.listAllAnnouncements();
    await api.createAnnouncement(input);
    await api.updateAnnouncement(announcement.id, input);
    await api.publishAnnouncement(announcement.id);
    await api.unpublishAnnouncement(announcement.id);
    await api.deleteAnnouncement(announcement.id);

    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/announcements");
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/announcements/admin");
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/announcements");
    expect(fetcher.mock.calls[2]?.[1]?.body).toBe(JSON.stringify(input));
    expect(fetcher.mock.calls[3]?.[0]).toBe("/api/announcements/announcement%20%2F%20one");
    expect(fetcher.mock.calls[3]?.[1]?.method).toBe("PATCH");
    expect(fetcher.mock.calls[4]?.[0]).toBe("/api/announcements/announcement%20%2F%20one/publish");
    assertBodylessRequestInit(fetcher.mock.calls[4]?.[1], "POST");
    expect(fetcher.mock.calls[5]?.[0]).toBe("/api/announcements/announcement%20%2F%20one/unpublish");
    assertBodylessRequestInit(fetcher.mock.calls[5]?.[1], "POST");
    expect(fetcher.mock.calls[6]?.[0]).toBe("/api/announcements/announcement%20%2F%20one");
    assertBodylessRequestInit(fetcher.mock.calls[6]?.[1], "DELETE");
  });

  it("uses bounded keyset pagination for the Owner audit contract", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      events: [], nextBeforeId: 19, retentionPolicy: "latest_20000_events",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const api = new ApiClient({ fetcher });
    const controller = new AbortController();
    await api.listAuditEvents(42, 25, controller.signal);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/audit/events?beforeId=42&limit=25",
      expect.objectContaining({ credentials: "same-origin", signal: controller.signal }),
    );
  });

  it("sends one exact bounded bulk JSON request and returns atomic item results", async () => {
    const input = {
      action: "move" as const,
      items: [
        { kind: "folder" as const, id: FOLDER.id, version: FOLDER.version },
        { kind: "file" as const, id: FILE.id, version: FILE.version },
      ],
      destinationFolderId: null,
    };
    const result = {
      action: "move" as const,
      atomic: true as const,
      items: input.items.map((item) => ({ ...item, outcome: "succeeded" as const })),
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const api = new ApiClient({ fetcher });

    await expect(api.bulkOperation(input)).resolves.toEqual(result);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/drive/bulk",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(input),
      }),
    );
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("uses strict scholarly record create, attach, read, and bodyless detach contracts", async () => {
    const record = {
      id: "record / one",
      label: "Private source",
      createdAt: "2026-08-17T12:00:00.000Z",
      updatedAt: "2026-08-17T12:00:00.000Z",
      artifactCount: 0,
      artifacts: [],
      nextBeforeArtifactId: null,
    };
    const responses = [
      new Response(JSON.stringify({ records: [record], nextBeforeId: null }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ record }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ record }), { status: 201, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ record }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ record }), { status: 200, headers: { "content-type": "application/json" } }),
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    const api = new ApiClient({ fetcher });

    await api.listScholarlyRecords(undefined, "record / cursor", 10);
    await api.getScholarlyRecord(record.id, undefined, "artifact / cursor", 5);
    await api.createScholarlyRecord(record.label);
    await api.attachFileToScholarlyRecord(record.id, "file / one");
    await api.detachScholarlyArtifact(record.id, "artifact / one");

    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/research/records?beforeId=record+%2F+cursor&limit=10");
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/research/records/record%20%2F%20one?beforeArtifactId=artifact+%2F+cursor&limit=5");
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/research/records");
    expect(fetcher.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({ label: record.label }));
    expect(fetcher.mock.calls[3]?.[0]).toBe("/api/research/records/record%20%2F%20one/artifacts");
    expect(fetcher.mock.calls[3]?.[1]?.body).toBe(JSON.stringify({ fileId: "file / one" }));
    expect(fetcher.mock.calls[4]?.[0]).toBe("/api/research/records/record%20%2F%20one/artifacts/artifact%20%2F%20one");
    assertBodylessRequestInit(fetcher.mock.calls[4]?.[1], "DELETE");
  });

  it("uses scoped Library contribution submit/review/withdraw/download contracts", async () => {
    const contribution = {
      id: "contribution / one",
      libraryId: "library / one",
      artifactId: "artifact / one",
      state: "submitted" as const,
      revision: 0,
      recordId: "record-1",
      recordLabel: "Source",
      submitterLoginName: "Member",
      file: { id: "file-1", displayName: "source.pdf", mediaType: "application/pdf", sizeBytes: 12, state: "active" as const },
      submittedAt: "2026-08-18T00:00:00.000Z",
      reviewedAt: null,
    };
    const responses = [
      new Response(JSON.stringify({ contribution }), { status: 201, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ contributions: [contribution] }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ contributions: [contribution] }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ contribution: { ...contribution, state: "approved" } }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ contribution: { ...contribution, state: "withdrawn" } }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ download: { method: "GET", url: "https://example.invalid/signed", expiresAt: "2026-08-18T00:05:00.000Z" } }), { status: 200, headers: { "content-type": "application/json" } }),
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    const api = new ApiClient({ fetcher });

    await api.submitLibraryContribution(contribution.libraryId, contribution.artifactId);
    await api.listLibraryContributions(contribution.libraryId);
    await api.listMyLibraryContributions(contribution.libraryId);
    await api.reviewLibraryContribution(contribution.libraryId, contribution.id, "approve");
    await api.withdrawLibraryContribution(contribution.libraryId, contribution.id);
    await api.createContributionDownload(contribution.libraryId, contribution.id, "inline");

    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/libraries/library%20%2F%20one/contributions");
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ artifactId: contribution.artifactId }));
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/libraries/library%20%2F%20one/contributions");
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/libraries/library%20%2F%20one/contributions/mine");
    expect(fetcher.mock.calls[3]?.[0]).toBe("/api/libraries/library%20%2F%20one/contributions/contribution%20%2F%20one/approve");
    assertBodylessRequestInit(fetcher.mock.calls[3]?.[1], "POST");
    expect(fetcher.mock.calls[4]?.[0]).toBe("/api/libraries/library%20%2F%20one/contributions/contribution%20%2F%20one/withdraw");
    assertBodylessRequestInit(fetcher.mock.calls[4]?.[1], "POST");
    expect(fetcher.mock.calls[5]?.[0]).toBe("/api/libraries/library%20%2F%20one/contributions/contribution%20%2F%20one/download?disposition=inline");
  });

  it("uses exact Library/file metadata and domain-authority contracts without authority injection", async () => {
    const detail = {
      displayTitle: "Canonical title",
      originalFilename: "source.pdf",
      metadataVersion: "m".repeat(43),
      metadata: null,
      canEditMetadata: true,
      file: { id: "file / one", mediaType: "application/pdf", sizeBytes: 12, updatedAt: "2026-08-18T00:00:00.000Z" },
    };
    const authority = { id: "authority-1", type: "person" as const, canonicalLabel: "Author", aliases: [], version: "a".repeat(43) };
    const input = {
      metadataVersion: detail.metadataVersion,
      materialType: "book" as const,
      canonicalTitle: "Canonical title",
      subtitle: null,
      alternativeTitles: [],
      dateStatement: null,
      identifiers: [],
      typeFields: { editionStatement: "First edition" },
      authorityLinks: [{ authorityId: authority.id, role: "author" as const }],
    };
    const responses = [
      new Response(JSON.stringify(detail), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ ...detail, metadataVersion: "n".repeat(43) }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ authorities: [authority], nextBeforeId: null }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ authority }), { status: 201, headers: { "content-type": "application/json" } }),
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    const api = new ApiClient({ fetcher });

    await api.getLibraryHoldingDetails("library / one", "file / one");
    await api.updateLibraryHoldingMetadata("library / one", "file / one", input);
    await api.listLibraryAuthorities("library / one", "person");
    await api.createLibraryAuthority("library / one", { type: "person", canonicalLabel: "Author", aliases: [] });

    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/libraries/library%20%2F%20one/holdings/file%20%2F%20one/details");
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/libraries/library%20%2F%20one/holdings/file%20%2F%20one/metadata");
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify(input));
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).not.toMatchObject({ recordId: expect.anything(), ownerDomainId: expect.anything(), actorAccountId: expect.anything() });
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/libraries/library%20%2F%20one/authorities?type=person");
    expect(fetcher.mock.calls[3]?.[0]).toBe("/api/libraries/library%20%2F%20one/authorities");
    expect(fetcher.mock.calls[3]?.[1]?.body).toBe(JSON.stringify({ type: "person", canonicalLabel: "Author", aliases: [] }));
  });

  it("uses bounded metadata-suggestion generation, review, and explicit acceptance contracts", async () => {
    const run = {
      id: "run-1",
      libraryId: "library / one",
      fileId: "file / one",
      status: "ready" as const,
      rulesetVersion: "rf-metasuggest-v1",
      sourceVersion: "v".repeat(43),
      window: { firstPages: 15, lastPages: 5, pageCount: 20, pageIndices: [1, 2, 20], complete: true },
      candidates: [{
        id: "run-1:0", position: 0, fieldPath: "canonicalTitle" as const, typeFieldName: null,
        authorityType: null, authorityRole: null, identifierScheme: null, value: "The Mongols and the West",
        sourceType: "title_page" as const, sourcePageIndex: 3, pageClass: "title_page" as const,
        confidence: "high" as const, precedenceRank: 1, evidenceExcerpt: "The Mongols and the West",
        rulesetVersion: "rf-metasuggest-v1",
      }],
      createdAt: "2026-08-18T00:00:00.000Z",
    };
    const detail = {
      displayTitle: "The Mongols and the West",
      originalFilename: "mongols.pdf",
      metadataVersion: "m".repeat(43),
      metadata: null,
      canEditMetadata: true,
      file: { id: "file / one", mediaType: "application/pdf", sizeBytes: 12, updatedAt: "2026-08-18T00:00:00.000Z" },
    };
    const responses = [
      new Response(JSON.stringify({ run }), { status: 201, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ run }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ detail, run: { ...run, status: "accepted" } }), { status: 200, headers: { "content-type": "application/json" } }),
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    const api = new ApiClient({ fetcher });
    await expect(api.generateLibraryMetadataSuggestions("library / one", "file / one")).resolves.toEqual(run);
    await expect(api.getLibraryMetadataSuggestions("library / one", "file / one")).resolves.toEqual(run);
    const acceptance = {
      acceptedCandidateIds: ["run-1:0"],
      metadataVersion: detail.metadataVersion,
      metadata: {
        materialType: "book" as const,
        canonicalTitle: "The Mongols and the West",
        subtitle: null,
        alternativeTitles: [],
        dateStatement: null,
        identifiers: [],
        typeFields: {},
        authorityLinks: [],
      },
    };
    await expect(api.acceptLibraryMetadataSuggestions("library / one", "file / one", "run-1", acceptance)).resolves.toMatchObject({ detail });
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/libraries/library%20%2F%20one/holdings/file%20%2F%20one/metadata/suggestions");
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetcher.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/libraries/library%20%2F%20one/holdings/file%20%2F%20one/metadata/suggestions");
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/libraries/library%20%2F%20one/holdings/file%20%2F%20one/metadata/suggestions/run-1/accept");
  });

  it("uses scoped Library recycle/list/restore contracts with opaque versions", async () => {
    const recycled = {
      version: "r".repeat(43),
      file: {
        id: "file / one",
        displayName: "source.pdf",
        mediaType: "application/pdf",
        sizeBytes: 12,
        deletedAt: "2026-08-18T00:00:00.000Z",
      },
    };
    const responses = [
      new Response(null, { status: 204 }),
      new Response(JSON.stringify({ files: [recycled] }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response(null, { status: 204 }),
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    const api = new ApiClient({ fetcher });
    const version = "v".repeat(43);

    await api.recycleLibraryHolding("library / one", "file / one", version);
    await expect(api.listLibraryRecycle("library / one")).resolves.toEqual([recycled]);
    await api.restoreLibraryHolding("library / one", "file / one", recycled.version);

    expect(fetcher.mock.calls[0]).toEqual([
      "/api/libraries/library%20%2F%20one/holdings/file%20%2F%20one/recycle",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ version }),
      }),
    ]);
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/libraries/library%20%2F%20one/recycle");
    expect(fetcher.mock.calls[2]).toEqual([
      "/api/libraries/library%20%2F%20one/recycle/file%20%2F%20one/restore",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ version: recycled.version }),
      }),
    ]);
    const restoreHeaders = new Headers(fetcher.mock.calls[2]?.[1]?.headers);
    expect(restoreHeaders.get("Content-Type")).toBe("application/json");
  });

  it("sends version-pinned account folder/file and Library permanent-delete requests to their own domains", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const api = new ApiClient({ fetcher });
    const folderVersion = "f".repeat(43);
    const fileVersion = "g".repeat(43);
    const libraryVersion = "h".repeat(43);

    await api.permanentlyDeleteFolder("folder / one", folderVersion);
    await api.permanentlyDeleteFile("file / one", fileVersion);
    await api.permanentlyDeleteLibraryHolding("library / one", "file / two", libraryVersion);

    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      "/api/drive/folders/folder%20%2F%20one/permanent",
      "/api/drive/files/file%20%2F%20one/permanent",
      "/api/libraries/library%20%2F%20one/recycle/file%20%2F%20two/permanent",
    ]);
    for (const [index, version] of [folderVersion, fileVersion, libraryVersion].entries()) {
      const init = fetcher.mock.calls[index]?.[1];
      expect(init?.method).toBe("DELETE");
      expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe(JSON.stringify({ version }));
    }
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
