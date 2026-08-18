import assert from "node:assert/strict";
import type { OutgoingHttpHeaders } from "node:http";
import { test, type TestContext } from "node:test";

import { AuthService } from "../../src/auth/auth-service.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { driveEntryVersion } from "../../src/drive/bulk.js";
import { createApp, type CreateAppOptions } from "../../src/platform/app.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { MULTIPART_PART_SIZE_BYTES } from "../../src/transfer/multipart-transfer.js";
import { createTestPersistence } from "../persistence/helpers.js";

const ORIGIN = "http://127.0.0.1:5173";
const NOW = new Date("2026-08-12T08:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";
type TestMethod = "GET" | "POST" | "PATCH" | "DELETE";

const hasher: PasswordHasher = {
  hash: (value) => Promise.resolve(`test:${value}`),
  verify: (encoded, value) => Promise.resolve(encoded === `test:${value}`),
};

function cookieFrom(headers: OutgoingHttpHeaders): string {
  const header = headers["set-cookie"];
  assert.ok(header);
  const value = Array.isArray(header) ? header[0]! : String(header);
  return value.split(";", 1)[0]!;
}

async function fixture(
  context: TestContext,
  logger: CreateAppOptions["logger"] = false,
) {
  const { persistence } = createTestPersistence(context);

  for (const id of ["owner-1", "member-2"]) {
    persistence.repositories.accounts.create({
      id,
      loginName: id,
      passwordHash: "test:password",
      role: id === "owner-1" ? "owner" : "member",
      state: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  const authService = new AuthService({
    persistence,
    passwordHasher: hasher,
    now: () => NOW,
  });
  const storage = new InMemoryStorageAdapter(() => NOW);
  const driveService = new DriveService(persistence, storage, () => NOW);
  const app = await createApp({
    logger,
    auth: { service: authService, appOrigin: ORIGIN, environment: "test" },
    drive: { service: driveService },
  });
  context.after(() => app.close());

  async function login(loginName: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN },
      payload: { loginName, password: "password" },
    });
    assert.equal(response.statusCode, 200);
    return cookieFrom(response.headers);
  }

  return { app, persistence, storage, driveService, login };
}

test("drive HTTP flow is authenticated, origin-protected, owner-scoped, and hides storage internals", async (context) => {
  const { app, persistence, storage, login } = await fixture(context);
  const ownerCookie = await login("owner-1");
  const otherCookie = await login("member-2");

  const anonymous = await app.inject({ method: "GET", url: "/api/drive/entries" });
  assert.equal(anonymous.statusCode, 401);

  const badOrigin = await app.inject({
    method: "POST",
    url: "/api/drive/folders",
    headers: { cookie: ownerCookie, origin: "https://evil.example" },
    payload: { name: "Sources" },
  });
  assert.equal(badOrigin.statusCode, 403);

  const rejectedOwner = await app.inject({
    method: "POST",
    url: "/api/drive/folders",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: {
      name: "Sources",
      ownerId: "member-2",
      ownerDomainId: "account:member-2",
      createdByAccountId: "member-2",
      role: "owner",
    },
  });
  assert.equal(rejectedOwner.statusCode, 400);
  assert.deepEqual(rejectedOwner.json(), { error: "invalid_request" });

  const folderResponse = await app.inject({
    method: "POST",
    url: "/api/drive/folders",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: { name: "Sources" },
  });
  assert.equal(folderResponse.statusCode, 201);
  const folderPayload = folderResponse.json<{
    folder: { id: string; ownerDomainId?: string; createdByAccountId?: string };
  }>().folder;
  const folderId = folderPayload.id;
  assert.equal(folderPayload.ownerDomainId, undefined);
  assert.equal(folderPayload.createdByAccountId, undefined);

  const rejectedUploader = await app.inject({
    method: "POST",
    url: "/api/drive/uploads",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: {
      folderId,
      displayName: "spoofed.pdf",
      mediaType: "application/pdf",
      sizeBytes: 7,
      checksum: { algorithm: "md5", value: MD5 },
      ownerDomainId: "account:member-2",
      uploaderAccountId: "member-2",
    },
  });
  assert.equal(rejectedUploader.statusCode, 400);
  assert.deepEqual(rejectedUploader.json(), { error: "invalid_request" });

  const uploadResponse = await app.inject({
    method: "POST",
    url: "/api/drive/uploads",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: {
      folderId,
      displayName: "paper.pdf",
      mediaType: "application/pdf",
      sizeBytes: 7,
      checksum: { algorithm: "md5", value: MD5 },
    },
  });
  assert.equal(uploadResponse.statusCode, 201);
  const upload = uploadResponse.json<{
    file: {
      id: string;
      ownerId?: string;
      ownerDomainId?: string;
      uploaderAccountId?: string;
      objectKey?: string;
      storageProvider?: string;
      revision?: number;
    };
    transfer: { kind: string; version: string; totalParts: number };
    upload?: unknown;
  }>();
  assert.equal(upload.file.ownerId, undefined);
  assert.equal(upload.file.ownerDomainId, undefined);
  assert.equal(upload.file.uploaderAccountId, undefined);
  assert.equal(upload.file.objectKey, undefined);
  assert.equal(upload.file.storageProvider, undefined);
  assert.equal(upload.file.revision, undefined);
  assert.equal(upload.upload, undefined);
  assert.equal(upload.transfer.kind, "multipart");
  assert.equal(upload.transfer.totalParts, 1);
  assert.equal("providerUploadId" in upload.transfer, false);
  assert.equal("objectKey" in upload.transfer, false);
  const persistedUpload = persistence.repositories.multipartUploads!.findByFileId("owner-1", upload.file.id)!;
  storage.putMultipartPart(persistedUpload.providerUploadId, 1, 7, "etag-1");

  const foreignComplete = await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${upload.file.id}/multipart/complete`,
    headers: { cookie: otherCookie, origin: ORIGIN },
    payload: { version: upload.transfer.version },
  });
  assert.equal(foreignComplete.statusCode, 404);

  const completed = await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${upload.file.id}/multipart/complete`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: { version: upload.transfer.version },
  });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.json<{ file: { state: string } }>().file.state, "active");

  const inlinePreview = await app.inject({
    method: "GET",
    url: `/api/drive/files/${upload.file.id}/download?disposition=inline`,
    headers: { cookie: ownerCookie },
  });
  assert.equal(inlinePreview.statusCode, 200);
  const previewDownload = inlinePreview.json<{ download: { url: string; sizeBytes: number; etag: string; acceptRanges: string } }>().download;
  assert.match(decodeURIComponent(previewDownload.url), /disposition=inline/);
  assert.equal(previewDownload.sizeBytes, 7);
  assert.equal(previewDownload.etag, `multipart-${persistedUpload.providerUploadId}`);
  assert.equal(previewDownload.acceptRanges, "bytes");

  const invalidDisposition = await app.inject({
    method: "GET",
    url: `/api/drive/files/${upload.file.id}/download?disposition=preview`,
    headers: { cookie: ownerCookie },
  });
  assert.equal(invalidDisposition.statusCode, 400);
  assert.deepEqual(invalidDisposition.json(), { error: "invalid_request" });

  const unsafeUploadResponse = await app.inject({
    method: "POST",
    url: "/api/drive/uploads",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: {
      folderId,
      displayName: "diagram.svg",
      mediaType: "image/svg+xml",
      sizeBytes: 7,
      checksum: { algorithm: "md5", value: MD5 },
    },
  });
  const unsafeUpload = unsafeUploadResponse.json<{ file: { id: string }; transfer: { version: string } }>();
  const unsafeMultipart = persistence.repositories.multipartUploads!.findByFileId("owner-1", unsafeUpload.file.id)!;
  storage.putMultipartPart(unsafeMultipart.providerUploadId, 1, 7, "etag-svg");
  assert.equal((await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${unsafeUpload.file.id}/multipart/complete`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: { version: unsafeUpload.transfer.version },
  })).statusCode, 200);
  const unsafeInline = await app.inject({
    method: "GET",
    url: `/api/drive/files/${unsafeUpload.file.id}/download?disposition=inline`,
    headers: { cookie: ownerCookie },
  });
  assert.equal(unsafeInline.statusCode, 409);
  assert.deepEqual(unsafeInline.json(), { error: "invalid_state" });

  const entries = await app.inject({
    method: "GET",
    url: `/api/drive/entries?folderId=${folderId}`,
    headers: { cookie: ownerCookie },
  });
  assert.equal(entries.statusCode, 200);
  assert.equal(entries.json<{ files: unknown[] }>().files.length, 2);

  const foreignEntries = await app.inject({
    method: "GET",
    url: `/api/drive/entries?folderId=${folderId}`,
    headers: { cookie: otherCookie },
  });
  assert.equal(foreignEntries.statusCode, 404);
});

test("multipart HTTP lifecycle is owner-scoped, CAS-bound, resumable, and distinct from legacy compatibility", async (context) => {
  const { app, persistence, storage, driveService, login } = await fixture(context);
  const ownerCookie = await login("owner-1");
  const memberCookie = await login("member-2");
  const headers = { cookie: ownerCookie, origin: ORIGIN };

  const createdResponse = await app.inject({
    method: "POST",
    url: "/api/drive/uploads",
    headers,
    payload: {
      folderId: null,
      displayName: "resumable.pdf",
      mediaType: "application/pdf",
      sizeBytes: MULTIPART_PART_SIZE_BYTES + 5,
      checksum: { algorithm: "md5", value: MD5 },
    },
  });
  assert.equal(createdResponse.statusCode, 201);
  const created = createdResponse.json<{
    file: { id: string };
    transfer: {
      kind: "multipart";
      state: string;
      version: string;
      totalParts: number;
      completedParts: Array<{ partNumber: number }>;
    };
    upload?: unknown;
  }>();
  assert.equal(created.upload, undefined);
  assert.equal(created.transfer.kind, "multipart");
  assert.equal(created.transfer.totalParts, 2);

  const foreignStatus = await app.inject({
    method: "GET",
    url: `/api/drive/uploads/${created.file.id}/status`,
    headers: { cookie: memberCookie },
  });
  assert.equal(foreignStatus.statusCode, 404);
  assert.equal((await app.inject({
    method: "GET",
    url: "/api/drive/uploads/guessed-upload/status",
    headers: { cookie: ownerCookie },
  })).statusCode, 404);

  const partAuthorization = await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${created.file.id}/parts/1/authorization`,
    headers,
    payload: {
      version: created.transfer.version,
      sizeBytes: MULTIPART_PART_SIZE_BYTES,
      contentMd5: MD5,
    },
  });
  assert.equal(partAuthorization.statusCode, 200);
  const part = partAuthorization.json<{ authorization: { method: string; headers: Record<string, string>; uploadId?: string } }>().authorization;
  assert.equal(part.method, "PUT");
  assert.equal(part.headers["Content-Length"], String(MULTIPART_PART_SIZE_BYTES));
  assert.equal(part.headers["Content-MD5"], MD5);
  assert.equal(part.uploadId, undefined);

  const pausedResponse = await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${created.file.id}/pause`,
    headers,
    payload: { version: created.transfer.version },
  });
  assert.equal(pausedResponse.statusCode, 200);
  const paused = pausedResponse.json<{ transfer: { state: string; version: string } }>().transfer;
  assert.equal(paused.state, "paused");
  assert.equal((await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${created.file.id}/resume`,
    headers,
    payload: { version: created.transfer.version },
  })).statusCode, 409);

  const resumedResponse = await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${created.file.id}/resume`,
    headers,
    payload: { version: paused.version },
  });
  assert.equal(resumedResponse.statusCode, 200);
  const resumed = resumedResponse.json<{ transfer: { state: string; version: string } }>().transfer;
  assert.equal(resumed.state, "uploading");

  const provider = persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id)!;
  storage.putMultipartPart(provider.providerUploadId, 1, MULTIPART_PART_SIZE_BYTES, "etag-1");
  const statusResponse = await app.inject({
    method: "GET",
    url: `/api/drive/uploads/${created.file.id}/status`,
    headers: { cookie: ownerCookie },
  });
  const status = statusResponse.json<{ transfer: { version: string; completedParts: Array<{ partNumber: number }> } }>().transfer;
  assert.deepEqual(status.completedParts.map((item) => item.partNumber), [1]);
  storage.putMultipartPart(provider.providerUploadId, 2, 5, "etag-2");
  const completed = await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${created.file.id}/multipart/complete`,
    headers,
    payload: { version: status.version },
  });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.json<{ file: { state: string } }>().file.state, "active");

  const abandonedResponse = await app.inject({
    method: "POST",
    url: "/api/drive/uploads",
    headers,
    payload: {
      folderId: null,
      displayName: "abandon.pdf",
      mediaType: "application/pdf",
      sizeBytes: 3,
      checksum: { algorithm: "md5", value: MD5 },
    },
  });
  const abandoned = abandonedResponse.json<{ file: { id: string }; transfer: { version: string } }>();
  const abandonedProvider = persistence.repositories.multipartUploads!.findByFileId("owner-1", abandoned.file.id)!;
  assert.equal((await app.inject({
    method: "DELETE",
    url: `/api/drive/uploads/${abandoned.file.id}/multipart`,
    headers,
    payload: { version: abandoned.transfer.version },
  })).statusCode, 204);
  assert.equal(storage.hasMultipartUpload(abandonedProvider.providerUploadId), false);
  assert.equal(persistence.repositories.files.findById("owner-1", abandoned.file.id), null);

  const legacy = await driveService.createUpload("owner-1", {
    folderId: null,
    displayName: "legacy.pdf",
    mediaType: "application/pdf",
    sizeBytes: 3,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const legacyStatus = await app.inject({
    method: "GET",
    url: `/api/drive/uploads/${legacy.file.id}/status`,
    headers: { cookie: ownerCookie },
  });
  assert.equal(legacyStatus.json<{ transfer: { kind: string } }>().transfer.kind, "legacy");
  const legacyAuthorization = await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${legacy.file.id}/authorization`,
    headers,
  });
  assert.equal(legacyAuthorization.statusCode, 200);
  assert.equal(legacyAuthorization.json<{ upload: { method: string } }>().upload.method, "POST");
  assert.equal((await app.inject({
    method: "DELETE",
    url: `/api/drive/uploads/${legacy.file.id}/multipart`,
    headers,
    payload: { version: resumed.version },
  })).statusCode, 409);
  assert.notEqual(persistence.repositories.files.findById("owner-1", legacy.file.id), null);
  assert.equal((await app.inject({
    method: "DELETE",
    url: `/api/drive/uploads/${legacy.file.id}/legacy`,
    headers,
  })).statusCode, 204);

  const disabledTarget = await driveService.createMultipartUpload("owner-1", {
    folderId: null,
    displayName: "disabled.pdf",
    mediaType: "application/pdf",
    sizeBytes: 3,
    checksum: { algorithm: "md5", value: MD5 },
  });
  assert.equal(persistence.repositories.accounts.updateState("owner-1", "active", "disabled", NOW), true);
  assert.equal((await app.inject({
    method: "GET",
    url: `/api/drive/uploads/${disabledTarget.file.id}/status`,
    headers: { cookie: ownerCookie },
  })).statusCode, 401);
});

test("every drive route enforces authentication and every unsafe route enforces origin", async (context) => {
  const { app } = await fixture(context);
  const validUpload = {
    displayName: "paper.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1,
    checksum: { algorithm: "md5", value: MD5 },
  };
  const routes: Array<{ method: TestMethod; url: string; payload?: object; unsafe?: boolean }> = [
    { method: "POST", url: "/api/drive/folders", payload: { name: "Folder" }, unsafe: true },
    { method: "GET", url: "/api/drive/entries" },
    { method: "PATCH", url: "/api/drive/folders/folder", payload: { name: "Renamed" }, unsafe: true },
    { method: "DELETE", url: "/api/drive/folders/folder", unsafe: true },
    { method: "DELETE", url: "/api/drive/folders/folder/permanent", payload: { version: "v".repeat(43) }, unsafe: true },
    { method: "POST", url: "/api/drive/folders/folder/restore", unsafe: true },
    { method: "POST", url: "/api/drive/uploads", payload: validUpload, unsafe: true },
    { method: "GET", url: "/api/drive/uploads" },
    { method: "POST", url: "/api/drive/uploads/file/authorization", unsafe: true },
    { method: "POST", url: "/api/drive/uploads/file/complete", unsafe: true },
    { method: "GET", url: "/api/drive/files/file/download" },
    { method: "PATCH", url: "/api/drive/files/file", payload: { displayName: "Renamed.pdf" }, unsafe: true },
    { method: "DELETE", url: "/api/drive/files/file", unsafe: true },
    { method: "POST", url: "/api/drive/files/file/restore", unsafe: true },
    { method: "GET", url: "/api/drive/recycle" },
    { method: "DELETE", url: "/api/drive/files/file/permanent", payload: { version: "v".repeat(43) }, unsafe: true },
  ];

  for (const route of routes) {
    const anonymous = await app.inject({
      method: route.method,
      url: route.url,
      headers: route.unsafe ? { origin: ORIGIN } : {},
      ...(route.payload ? { payload: route.payload } : {}),
    });
    assert.equal(anonymous.statusCode, 401, `${route.method} ${route.url} must require auth`);

    if (route.unsafe) {
      const badOrigin = await app.inject({
        method: route.method,
        url: route.url,
        headers: { origin: "https://evil.example" },
        ...(route.payload ? { payload: route.payload } : {}),
      });
      assert.equal(badOrigin.statusCode, 403, `${route.method} ${route.url} must reject origin`);
    }
  }
});

test("owner-scoped routes uniformly hide another account's resources from a Member", async (context) => {
  const { app, persistence, storage, driveService, login } = await fixture(context);
  const otherCookie = await login("member-2");
  const activeFolder = driveService.createFolder("owner-1", "Active folder", null);
  const nestedFolder = driveService.createFolder("owner-1", "Nested folder", activeFolder.id);
  const deletedFolder = driveService.createFolder("owner-1", "Deleted folder", null);
  driveService.deleteFolder("owner-1", deletedFolder.id);
  const pending = await driveService.createUpload("owner-1", {
    folderId: null,
    displayName: "pending.pdf",
    mediaType: "application/pdf",
    sizeBytes: 7,
    checksum: { algorithm: "md5", value: MD5 },
  });

  async function activeFile(name: string, folderId: string | null = null) {
    const upload = await driveService.createUpload("owner-1", {
      folderId,
      displayName: name,
      mediaType: "application/pdf",
      sizeBytes: 7,
      checksum: { algorithm: "md5", value: MD5 },
    });
    storage.putObject({
      objectKey: upload.file.objectKey,
      sizeBytes: 7,
      etag: null,
      checksumAlgorithm: "md5",
      checksum: MD5,
      mediaType: "application/pdf",
      modifiedAt: NOW,
    });
    return driveService.completeUpload("owner-1", upload.file.id);
  }

  const active = await activeFile("active.pdf");
  const nested = await activeFile("nested.pdf", nestedFolder.id);
  const deleted = await activeFile("deleted.pdf");
  driveService.deleteFile("owner-1", deleted.id);
  const attempts: Array<{ method: TestMethod; url: string; payload?: object }> = [
    { method: "GET", url: `/api/drive/entries?folderId=${activeFolder.id}` },
    { method: "PATCH", url: `/api/drive/folders/${activeFolder.id}`, payload: { name: "Stolen" } },
    { method: "PATCH", url: `/api/drive/folders/${nestedFolder.id}`, payload: { parentId: null } },
    { method: "DELETE", url: `/api/drive/folders/${activeFolder.id}` },
    { method: "POST", url: `/api/drive/folders/${deletedFolder.id}/restore` },
    { method: "DELETE", url: `/api/drive/folders/${deletedFolder.id}/permanent`, payload: { version: "v".repeat(43) } },
    { method: "GET", url: `/api/drive/uploads?folderId=${activeFolder.id}` },
    { method: "POST", url: `/api/drive/uploads/${pending.file.id}/authorization` },
    { method: "POST", url: `/api/drive/uploads/${pending.file.id}/complete` },
    { method: "GET", url: `/api/drive/files/${active.id}/download` },
    { method: "GET", url: `/api/drive/files/${active.id}/download?disposition=inline` },
    { method: "PATCH", url: `/api/drive/files/${active.id}`, payload: { displayName: "Stolen.pdf" } },
    { method: "PATCH", url: `/api/drive/files/${nested.id}`, payload: { folderId: null } },
    { method: "DELETE", url: `/api/drive/files/${active.id}` },
    { method: "POST", url: `/api/drive/files/${deleted.id}/restore` },
    { method: "DELETE", url: `/api/drive/files/${deleted.id}/permanent`, payload: { version: driveEntryVersion(deleted) } },
  ];

  for (const attempt of attempts) {
    const response = await app.inject({
      method: attempt.method,
      url: attempt.url,
      headers: {
        cookie: otherCookie,
        ...(attempt.method === "GET" ? {} : { origin: ORIGIN }),
      },
      ...(attempt.payload ? { payload: attempt.payload } : {}),
    });
    assert.equal(response.statusCode, 404, `${attempt.method} ${attempt.url} must be opaque`);
  }

  const otherRecycle = await app.inject({
    method: "GET",
    url: "/api/drive/recycle",
    headers: { cookie: otherCookie },
  });
  assert.deepEqual(otherRecycle.json(), { folders: [], files: [] });
  assert.equal(persistence.repositories.folders.findById("owner-1", activeFolder.id)?.name, "Active folder");
  assert.equal(persistence.repositories.folders.findById("owner-1", nestedFolder.id)?.parentId, activeFolder.id);
  assert.equal(persistence.repositories.folders.findById("owner-1", deletedFolder.id)?.state, "deleted");
  assert.equal(persistence.repositories.files.findById("owner-1", pending.file.id)?.state, "pending_upload");
  assert.equal(persistence.repositories.files.findById("owner-1", active.id)?.state, "active");
  assert.equal(persistence.repositories.files.findById("owner-1", nested.id)?.folderId, nestedFolder.id);
  assert.equal(persistence.repositories.files.findById("owner-1", deleted.id)?.state, "deleted");
  assert.deepEqual(
    persistence.repositories.audit.listBefore(null, 50)
      .filter((event) => event.actorAccountId === "member-2" && event.outcome === "denied" && event.action.startsWith("drive."))
      .map((event) => ({ action: event.action, target: event.targetId, reason: event.reason }))
      .sort((left, right) => left.action.localeCompare(right.action)),
    [
      { action: "drive.file_purge_request", target: null, reason: "not_found" },
      { action: "drive.file_purge_request", target: null, reason: "not_found" },
      { action: "drive.file_recycle", target: null, reason: "not_found" },
      { action: "drive.file_restore", target: null, reason: "not_found" },
      { action: "drive.folder_recycle", target: null, reason: "not_found" },
      { action: "drive.folder_restore", target: null, reason: "not_found" },
      { action: "drive.upload_activate", target: null, reason: "not_found" },
    ],
  );
});

test("drive authorization and destructive outcomes emit stable account-scoped audit events", async (context) => {
  const chunks: string[] = [];
  const stream = { write(chunk: string) { chunks.push(String(chunk)); } };
  const { app, driveService, login } = await fixture(context, { level: "info", stream });
  const ownerCookie = await login("owner-1");
  const otherCookie = await login("member-2");
  const folder = driveService.createFolder("owner-1", "Disposable", null);

  await app.inject({
    method: "DELETE",
    url: `/api/drive/folders/${folder.id}`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
  });
  await app.inject({
    method: "GET",
    url: `/api/drive/entries?folderId=${folder.id}`,
    headers: { cookie: otherCookie },
  });

  const logs = chunks.join("");
  assert.match(logs, /drive\.folder_soft_delete/);
  assert.match(logs, /drive\.owner_scope_check/);
  assert.match(logs, /owner-1/);
  assert.match(logs, /member-2/);
  assert.doesNotMatch(logs, new RegExp(folder.id));
});

test("a global Member cannot permanently delete even their own recycled account file", async (context) => {
  const { app, storage, driveService, login } = await fixture(context);
  const memberCookie = await login("member-2");
  const upload = await driveService.createUpload("member-2", {
    folderId: null,
    displayName: "member-disposable.pdf",
    mediaType: "application/pdf",
    sizeBytes: 7,
    checksum: { algorithm: "md5", value: MD5 },
  });
  storage.putObject({
    objectKey: upload.file.objectKey,
    sizeBytes: 7,
    etag: null,
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  await driveService.completeUpload("member-2", upload.file.id);
  driveService.deleteFile("member-2", upload.file.id);
  const recycled = driveService.listRecycle("member-2").files[0]!;

  const response = await app.inject({
    method: "DELETE",
    url: `/api/drive/files/${recycled.id}/permanent`,
    headers: { cookie: memberCookie, origin: ORIGIN, "content-type": "application/json" },
    payload: { version: driveEntryVersion(recycled) },
  });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "not_found" });
  assert.equal(driveService.listRecycle("member-2").files[0]?.state, "deleted");
  assert.notEqual(await storage.statObject(upload.file.objectKey), null);
});

test("permanent-delete provider failure records a target-free failed completion attempt", async (context) => {
  const { app, persistence, storage, driveService, login } = await fixture(context);
  const ownerCookie = await login("owner-1");
  const upload = await driveService.createUpload("owner-1", {
    folderId: null,
    displayName: "disposable.pdf",
    mediaType: "application/pdf",
    sizeBytes: 7,
    checksum: { algorithm: "md5", value: MD5 },
  });
  storage.putObject({
    objectKey: upload.file.objectKey,
    sizeBytes: 7,
    etag: null,
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  await driveService.completeUpload("owner-1", upload.file.id);
  driveService.deleteFile("owner-1", upload.file.id);
  Object.defineProperty(storage, "deleteObject", {
    value: async () => { throw new Error("provider failure sentinel"); },
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/drive/files/${upload.file.id}/permanent`,
    headers: { cookie: ownerCookie, origin: ORIGIN, "content-type": "application/json" },
    payload: { version: driveEntryVersion(driveService.listRecycle("owner-1").files[0]!) },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(persistence.repositories.files.findById("owner-1", upload.file.id)?.state, "purging");
  assert.deepEqual(
    persistence.repositories.audit.listBefore(null, 20)
      .filter((event) => event.action === "drive.file_purge_request" || event.action === "drive.file_purge_complete")
      .map((event) => ({ action: event.action, outcome: event.outcome, target: event.targetId, reason: event.reason })),
    [
      { action: "drive.file_purge_complete", outcome: "failed", target: null, reason: "storage_unavailable" },
      { action: "drive.file_purge_request", outcome: "succeeded", target: upload.file.id, reason: null },
    ],
  );
});

test("inline preview without a browser endpoint returns 503 preview_unavailable", async (context) => {
  const { app, driveService, storage, login } = await fixture(context);
  const ownerCookie = await login("owner-1");
  const upload = await driveService.createUpload("owner-1", {
    folderId: null,
    displayName: "paper.pdf",
    mediaType: "application/pdf",
    sizeBytes: 7,
    checksum: { algorithm: "md5", value: MD5 },
  });
  storage.putObject({
    objectKey: upload.upload.fields.key!,
    sizeBytes: 7,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  await driveService.completeUpload("owner-1", upload.file.id);
  Object.defineProperty(storage, "browserPreviewAvailable", { value: false });

  const inline = await app.inject({
    method: "GET",
    url: `/api/drive/files/${upload.file.id}/download?disposition=inline`,
    headers: { cookie: ownerCookie },
  });
  assert.equal(inline.statusCode, 503);
  assert.deepEqual(inline.json(), { error: "preview_unavailable" });

  // Attachment download remains available without the custom domain.
  const attachment = await app.inject({
    method: "GET",
    url: `/api/drive/files/${upload.file.id}/download`,
    headers: { cookie: ownerCookie },
  });
  assert.equal(attachment.statusCode, 200);
  assert.match(attachment.json<{ download: { url: string } }>().download.url, /^memory:\/\/download/);
});

test("oversized inline preview returns 503 preview_too_large while download stays available", async (context) => {
  const { app, persistence, storage, driveService, login } = await fixture(context);
  const ownerCookie = await login("owner-1");
  const oversized = 512 * 1024 * 1024 + 1;

  const uploadResponse = await app.inject({
    method: "POST",
    url: "/api/drive/uploads",
    headers: { cookie: ownerCookie, origin: ORIGIN },
    payload: {
      folderId: null,
      displayName: "huge.pdf",
      mediaType: "application/pdf",
      sizeBytes: oversized,
      checksum: { algorithm: "md5", value: MD5 },
    },
  });
  assert.equal(uploadResponse.statusCode, 201);
  const upload = uploadResponse.json<{ file: { id: string }; transfer: { kind: string } }>();
  assert.equal(upload.transfer.kind, "multipart");
  const stored = persistence.repositories.files.findById("owner-1", upload.file.id)!;
  storage.putObject({
    objectKey: stored.objectKey,
    sizeBytes: oversized,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  assert.equal((await driveService.getUploadStatus("owner-1", upload.file.id)).kind, "complete");

  const inline = await app.inject({
    method: "GET",
    url: `/api/drive/files/${upload.file.id}/download?disposition=inline`,
    headers: { cookie: ownerCookie },
  });
  assert.equal(inline.statusCode, 503);
  assert.deepEqual(inline.json(), { error: "preview_too_large" });

  const attachment = await app.inject({
    method: "GET",
    url: `/api/drive/files/${upload.file.id}/download`,
    headers: { cookie: ownerCookie },
  });
  assert.equal(attachment.statusCode, 200);
  assert.match(attachment.json<{ download: { url: string } }>().download.url, /disposition=attachment/);
});
