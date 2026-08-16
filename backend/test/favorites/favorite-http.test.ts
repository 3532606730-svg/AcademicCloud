import assert from "node:assert/strict";
import type { OutgoingHttpHeaders } from "node:http";
import { test, type TestContext } from "node:test";

import { AuthService } from "../../src/auth/auth-service.js";
import type { PasswordHasher } from "../../src/auth/password-hasher.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { FavoriteService } from "../../src/favorites/favorite-service.js";
import { createApp, type CreateAppOptions } from "../../src/platform/app.js";
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
  const driveService = new DriveService(persistence, storage, () => NOW);
  const favoriteService = new FavoriteService(persistence, () => NOW);
  const app = await createApp({
    logger: false,
    auth: { service: authService, appOrigin: ORIGIN, environment: "test" },
    drive: { service: driveService },
    favorites: { service: favoriteService },
  } satisfies CreateAppOptions);
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

  async function activeFile(ownerId: string, name: string): Promise<{ fileId: string; folderId: string | null }> {
    const folder = await driveService.createFolder(ownerId, `${name}-folder`, null);
    const upload = await driveService.createUpload(ownerId, {
      folderId: folder.id,
      displayName: name,
      mediaType: "application/pdf",
      sizeBytes: 8,
      checksum: { algorithm: "md5", value: MD5 },
    });
    storage.putObject({
      objectKey: upload.upload.fields.key!,
      sizeBytes: 8,
      etag: "etag",
      checksumAlgorithm: "md5",
      checksum: MD5,
      mediaType: "application/pdf",
      modifiedAt: NOW,
    });
    await driveService.completeUpload(ownerId, upload.file.id);
    return { fileId: upload.file.id, folderId: folder.id };
  }

  return { app, persistence, driveService, favoriteService, login, activeFile };
}

test("favorites API enforces authentication, origin, exact status codes, and idempotency", async (context) => {
  const { app, login, activeFile } = await fixture(context);
  const ownerCookie = await login("owner-1");
  const otherCookie = await login("owner-2");
  const { fileId, folderId } = await activeFile("owner-1", "paper.pdf");

  // Anonymous requests are rejected.
  assert.equal((await app.inject({ method: "GET", url: "/api/favorites" })).statusCode, 401);

  // Unsafe writes enforce the exact origin.
  const badOrigin = await app.inject({
    method: "PUT",
    url: `/api/favorites/files/${fileId}`,
    headers: { cookie: ownerCookie, origin: "https://evil.example" },
  });
  assert.equal(badOrigin.statusCode, 403);

  // Bodyless PUT/DELETE: no Content-Type, no body — and idempotent.
  const put = await app.inject({
    method: "PUT",
    url: `/api/favorites/files/${fileId}`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
  });
  assert.equal(put.statusCode, 204);
  const putAgain = await app.inject({
    method: "PUT",
    url: `/api/favorites/files/${fileId}`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
  });
  assert.equal(putAgain.statusCode, 204);

  const putFolder = await app.inject({
    method: "PUT",
    url: `/api/favorites/folders/${folderId}`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
  });
  assert.equal(putFolder.statusCode, 204);

  const listing = await app.inject({
    method: "GET",
    url: "/api/favorites",
    headers: { cookie: ownerCookie },
  });
  assert.equal(listing.statusCode, 200);
  const body = listing.json<{ files: Array<{ id: string }>; folders: Array<{ id: string; ancestors: unknown[] }> }>();
  assert.deepEqual(body.files.map((f) => f.id), [fileId]);
  assert.deepEqual(body.folders.map((f) => f.id), [folderId]);
  assert.equal(body.folders[0]!.ancestors.length, 0);

  // Guessed foreign ids are indistinguishable from missing ones.
  const foreignPut = await app.inject({
    method: "PUT",
    url: `/api/favorites/files/${fileId}`,
    headers: { cookie: otherCookie, origin: ORIGIN },
  });
  assert.equal(foreignPut.statusCode, 404);
  assert.deepEqual(foreignPut.json(), { error: "not_found" });

  const foreignDelete = await app.inject({
    method: "DELETE",
    url: `/api/favorites/files/${fileId}`,
    headers: { cookie: otherCookie, origin: ORIGIN },
  });
  assert.equal(foreignDelete.statusCode, 404);

  // DELETE is idempotent and removes only the owner's relation.
  const remove = await app.inject({
    method: "DELETE",
    url: `/api/favorites/files/${fileId}`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
  });
  assert.equal(remove.statusCode, 204);
  const removeAgain = await app.inject({
    method: "DELETE",
    url: `/api/favorites/files/${fileId}`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
  });
  assert.equal(removeAgain.statusCode, 204);
  const after = await app.inject({ method: "GET", url: "/api/favorites", headers: { cookie: ownerCookie } });
  assert.deepEqual(after.json<{ files: unknown[] }>().files, []);
});

test("favorites listing hides soft-deleted resources and includes folder ancestors", async (context) => {
  const { app, login, activeFile, driveService } = await fixture(context);
  const ownerCookie = await login("owner-1");
  const { fileId, folderId } = await activeFile("owner-1", "paper.pdf");
  const child = driveService.createFolder("owner-1", "Child", folderId!);

  const putChild = await app.inject({
    method: "PUT",
    url: `/api/favorites/folders/${child.id}`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
  });
  assert.equal(putChild.statusCode, 204);

  const putFile = await app.inject({
    method: "PUT",
    url: `/api/favorites/files/${fileId}`,
    headers: { cookie: ownerCookie, origin: ORIGIN },
  });
  assert.equal(putFile.statusCode, 204);

  const before = await app.inject({ method: "GET", url: "/api/favorites", headers: { cookie: ownerCookie } });
  const beforeBody = before.json<{ files: Array<{ id: string }>; folders: Array<{ id: string; ancestors: Array<{ id: string }> }> }>();
  assert.deepEqual(beforeBody.folders.map((f) => f.id), [child.id]);
  assert.deepEqual(beforeBody.folders[0]!.ancestors.map((a) => a.id), [folderId!]);

  // Soft-delete hides without losing the relation.
  driveService.deleteFile("owner-1", fileId);
  const hidden = await app.inject({ method: "GET", url: "/api/favorites", headers: { cookie: ownerCookie } });
  assert.deepEqual(hidden.json<{ files: unknown[] }>().files, []);

  driveService.restoreFile("owner-1", fileId);
  const restored = await app.inject({ method: "GET", url: "/api/favorites", headers: { cookie: ownerCookie } });
  assert.deepEqual(restored.json<{ files: Array<{ id: string }> }>().files.map((f) => f.id), [fileId]);
});
