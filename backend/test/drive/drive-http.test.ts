import assert from "node:assert/strict";
import type { OutgoingHttpHeaders } from "node:http";
import { test, type TestContext } from "node:test";

import { AuthService } from "../../src/auth/auth-service.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { createApp, type CreateAppOptions } from "../../src/platform/app.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
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

  for (const id of ["owner-1", "owner-2"]) {
    persistence.repositories.accounts.create({
      id,
      loginName: id,
      passwordHash: "test:password",
      state: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  const authService = new AuthService({
    accounts: persistence.repositories.accounts,
    sessions: persistence.repositories.sessions,
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
  const { app, storage, login } = await fixture(context);
  const ownerCookie = await login("owner-1");
  const otherCookie = await login("owner-2");

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
    payload: { name: "Sources", ownerId: "owner-2" },
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
  const folderId = folderResponse.json<{ folder: { id: string } }>().folder.id;

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
    file: { id: string; ownerId?: string; objectKey?: string; storageProvider?: string; revision?: number };
    upload: { fields: Record<string, string> };
  }>();
  assert.equal(upload.file.ownerId, undefined);
  assert.equal(upload.file.objectKey, undefined);
  assert.equal(upload.file.storageProvider, undefined);
  assert.equal(upload.file.revision, undefined);
  assert.equal(upload.upload.fields["x-oss-forbid-overwrite"], "true");
  assert.equal(upload.upload.fields["Content-MD5"], MD5);
  const objectKey = upload.upload.fields.key!;
  storage.putObject({
    objectKey,
    sizeBytes: 7,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });

  const foreignComplete = await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${upload.file.id}/complete`,
    headers: { cookie: otherCookie, origin: ORIGIN },
  });
  assert.equal(foreignComplete.statusCode, 404);

  const completed = await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${upload.file.id}/complete`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
  });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.json<{ file: { state: string } }>().file.state, "active");

  const inlinePreview = await app.inject({
    method: "GET",
    url: `/api/drive/files/${upload.file.id}/download?disposition=inline`,
    headers: { cookie: ownerCookie },
  });
  assert.equal(inlinePreview.statusCode, 200);
  assert.match(decodeURIComponent(inlinePreview.json<{ download: { url: string } }>().download.url), /disposition=inline/);

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
  const unsafeUpload = unsafeUploadResponse.json<{ file: { id: string }; upload: { fields: Record<string, string> } }>();
  storage.putObject({
    objectKey: unsafeUpload.upload.fields.key!,
    sizeBytes: 7,
    etag: "etag-svg",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "image/svg+xml",
    modifiedAt: NOW,
  });
  assert.equal((await app.inject({
    method: "POST",
    url: `/api/drive/uploads/${unsafeUpload.file.id}/complete`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
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
    { method: "DELETE", url: "/api/drive/files/file/permanent", unsafe: true },
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

test("owner-scoped routes uniformly hide another account's resources", async (context) => {
  const { app, persistence, storage, driveService, login } = await fixture(context);
  const otherCookie = await login("owner-2");
  const activeFolder = driveService.createFolder("owner-1", "Active folder", null);
  const deletedFolder = driveService.createFolder("owner-1", "Deleted folder", null);
  driveService.deleteFolder("owner-1", deletedFolder.id);
  const pending = await driveService.createUpload("owner-1", {
    folderId: null,
    displayName: "pending.pdf",
    mediaType: "application/pdf",
    sizeBytes: 7,
    checksum: { algorithm: "md5", value: MD5 },
  });

  async function activeFile(name: string) {
    const upload = await driveService.createUpload("owner-1", {
      folderId: null,
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
  const deleted = await activeFile("deleted.pdf");
  driveService.deleteFile("owner-1", deleted.id);
  const attempts: Array<{ method: TestMethod; url: string; payload?: object }> = [
    { method: "GET", url: `/api/drive/entries?folderId=${activeFolder.id}` },
    { method: "PATCH", url: `/api/drive/folders/${activeFolder.id}`, payload: { name: "Stolen" } },
    { method: "DELETE", url: `/api/drive/folders/${activeFolder.id}` },
    { method: "POST", url: `/api/drive/folders/${deletedFolder.id}/restore` },
    { method: "GET", url: `/api/drive/uploads?folderId=${activeFolder.id}` },
    { method: "POST", url: `/api/drive/uploads/${pending.file.id}/authorization` },
    { method: "POST", url: `/api/drive/uploads/${pending.file.id}/complete` },
    { method: "GET", url: `/api/drive/files/${active.id}/download` },
    { method: "PATCH", url: `/api/drive/files/${active.id}`, payload: { displayName: "Stolen.pdf" } },
    { method: "DELETE", url: `/api/drive/files/${active.id}` },
    { method: "POST", url: `/api/drive/files/${deleted.id}/restore` },
    { method: "DELETE", url: `/api/drive/files/${deleted.id}/permanent` },
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
  assert.equal(persistence.repositories.folders.findById("owner-1", deletedFolder.id)?.state, "deleted");
  assert.equal(persistence.repositories.files.findById("owner-1", pending.file.id)?.state, "pending_upload");
  assert.equal(persistence.repositories.files.findById("owner-1", active.id)?.state, "active");
  assert.equal(persistence.repositories.files.findById("owner-1", deleted.id)?.state, "deleted");
});

test("drive authorization and destructive outcomes emit stable account-scoped audit events", async (context) => {
  const chunks: string[] = [];
  const stream = { write(chunk: string) { chunks.push(String(chunk)); } };
  const { app, driveService, login } = await fixture(context, { level: "info", stream });
  const ownerCookie = await login("owner-1");
  const otherCookie = await login("owner-2");
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
  assert.match(logs, /owner-2/);
  assert.doesNotMatch(logs, new RegExp(folder.id));
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
  const { app, storage, driveService, login } = await fixture(context);
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
  const upload = uploadResponse.json<{ file: { id: string }; upload: { fields: Record<string, string> } }>();
  storage.putObject({
    objectKey: upload.upload.fields.key!,
    sizeBytes: oversized,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  await driveService.completeUpload("owner-1", upload.file.id);

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
