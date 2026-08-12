import assert from "node:assert/strict";
import type { OutgoingHttpHeaders } from "node:http";
import { test, type TestContext } from "node:test";

import { AuthService } from "../../src/auth/auth-service.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { createApp } from "../../src/platform/app.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const ORIGIN = "http://127.0.0.1:5173";
const NOW = new Date("2026-08-12T08:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

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

async function fixture(context: TestContext) {
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
  const app = await createApp({
    logger: false,
    auth: { service: authService, appOrigin: ORIGIN, environment: "test" },
    drive: { service: new DriveService(persistence, storage, () => NOW) },
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

  return { app, storage, login };
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
    file: { id: string; ownerId?: string; objectKey?: string; storageProvider?: string };
    upload: { fields: Record<string, string> };
  }>();
  assert.equal(upload.file.ownerId, undefined);
  assert.equal(upload.file.objectKey, undefined);
  assert.equal(upload.file.storageProvider, undefined);
  assert.equal(upload.upload.fields["x-oss-forbid-overwrite"], "true");
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
  assert.match(decodeURIComponent(inlinePreview.json<{ download: { url: string } }>().download.url), /disposition=inline;/);

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
