import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { NewAccount } from "../../src/auth/account.js";
import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import { FavoriteError } from "../../src/favorites/favorite.js";
import { FavoriteService } from "../../src/favorites/favorite-service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-12T08:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

function account(id: string): NewAccount {
  return { id, loginName: id, passwordHash: "test", state: "active", createdAt: NOW, updatedAt: NOW };
}

function fixture(context: TestContext) {
  const { database, persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create(account("user-a"));
  persistence.repositories.accounts.create(account("user-b"));
  const storage = new InMemoryStorageAdapter(() => NOW);
  const drive = new DriveService(persistence, storage, () => NOW);
  const favorites = new FavoriteService(persistence, () => NOW);
  return { database, persistence, storage, drive, favorites };
}

async function activeFile(drive: DriveService, storage: InMemoryStorageAdapter, ownerId: string, name: string) {
  const result = await drive.createUpload(ownerId, {
    folderId: null,
    displayName: name,
    mediaType: "application/pdf",
    sizeBytes: 8,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const objectKey = result.upload.fields.key!;
  storage.putObject({
    objectKey,
    sizeBytes: 8,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  await drive.completeUpload(ownerId, result.file.id);
  return result.file;
}

test("favorite relations are per-account and account-scoped", async (context) => {
  const { storage, drive, favorites, persistence } = fixture(context);
  const fileA = await activeFile(drive, storage, "user-a", "a.pdf");
  const fileB = await activeFile(drive, storage, "user-b", "b.pdf");

  favorites.setFileFavorite("user-a", fileA.id, true);
  assert.deepEqual(favorites.listFavorites("user-a").files.map((f) => f.id), [fileA.id]);

  // B does not see A's favorite.
  assert.deepEqual(favorites.listFavorites("user-b").files, []);
  favorites.setFileFavorite("user-b", fileB.id, true);
  assert.deepEqual(favorites.listFavorites("user-b").files.map((f) => f.id), [fileB.id]);

  // B cannot favorite or unfavorite A's resource by guessed id.
  assert.throws(() => favorites.setFileFavorite("user-b", fileA.id, true), (error: unknown) => error instanceof FavoriteError && error.code === "not_found");
  assert.throws(() => favorites.setFileFavorite("user-b", fileA.id, false), (error: unknown) => error instanceof FavoriteError && error.code === "not_found");

  // Removing A's favorite does not affect B's relationships.
  favorites.setFileFavorite("user-a", fileA.id, false);
  assert.deepEqual(favorites.listFavorites("user-a").files, []);
  assert.deepEqual(favorites.listFavorites("user-b").files.map((f) => f.id), [fileB.id]);
  assert.equal(persistence.repositories.favorites.listFileIds("user-b").length, 1);
});

test("favorite adds and removes are idempotent", async (context) => {
  const { storage, drive, favorites, persistence } = fixture(context);
  const file = await activeFile(drive, storage, "user-a", "a.pdf");

  favorites.setFileFavorite("user-a", file.id, true);
  favorites.setFileFavorite("user-a", file.id, true);
  assert.equal(persistence.repositories.favorites.listFileIds("user-a").length, 1);

  favorites.setFileFavorite("user-a", file.id, false);
  favorites.setFileFavorite("user-a", file.id, false);
  assert.equal(persistence.repositories.favorites.listFileIds("user-a").length, 0);
});

test("folder favorites include a root-first ancestor chain", async (context) => {
  const { drive, favorites } = fixture(context);
  const root = drive.createFolder("user-a", "Sources", null);
  const child = drive.createFolder("user-a", "Primary", root.id);
  const leaf = drive.createFolder("user-a", "元代文献", child.id);

  favorites.setFolderFavorite("user-a", leaf.id, true);
  const snapshot = favorites.listFavorites("user-a");
  assert.equal(snapshot.folders.length, 1);
  assert.equal(snapshot.folders[0]!.folder.id, leaf.id);
  assert.deepEqual(snapshot.folders[0]!.ancestors.map((f) => f.id), [root.id, child.id]);
});

test("soft-delete hides favorites, restore resurfaces them, purge removes the relation", async (context) => {
  const { storage, drive, favorites, persistence } = fixture(context);
  const file = await activeFile(drive, storage, "user-a", "a.pdf");
  favorites.setFileFavorite("user-a", file.id, true);

  drive.deleteFile("user-a", file.id);
  assert.deepEqual(favorites.listFavorites("user-a").files, []); // hidden while deleted
  assert.equal(persistence.repositories.favorites.listFileIds("user-a").length, 1); // relation retained

  await drive.restoreFile("user-a", file.id);
  assert.deepEqual(favorites.listFavorites("user-a").files.map((f) => f.id), [file.id]); // resurfaces

  // Permanent delete stays a Recycle-only path: soft-delete first, then purge.
  drive.deleteFile("user-a", file.id);
  await drive.permanentlyDeleteFile("user-a", file.id);
  assert.deepEqual(favorites.listFavorites("user-a").files, []);
  assert.equal(persistence.repositories.favorites.listFileIds("user-a").length, 0); // purge cleanup
});

test("folder soft-delete hides and restore resurfaces the favorite", async (context) => {
  const { drive, favorites, persistence } = fixture(context);
  const folder = drive.createFolder("user-a", "Sources", null);
  favorites.setFolderFavorite("user-a", folder.id, true);

  drive.deleteFolder("user-a", folder.id);
  assert.deepEqual(favorites.listFavorites("user-a").folders, []);
  assert.equal(persistence.repositories.favorites.listFolderIds("user-a").length, 1);

  drive.restoreFolder("user-a", folder.id);
  assert.deepEqual(favorites.listFavorites("user-a").folders.map((f) => f.folder.id), [folder.id]);
});

test("favoriting a non-active or unknown file fails with not_found", async (context) => {
  const { storage, drive, favorites } = fixture(context);
  const file = await activeFile(drive, storage, "user-a", "a.pdf");
  drive.deleteFile("user-a", file.id);

  assert.throws(() => favorites.setFileFavorite("user-a", file.id, true), (error: unknown) => error instanceof FavoriteError && error.code === "not_found");
  assert.throws(() => favorites.setFileFavorite("user-a", "missing-id", true), (error: unknown) => error instanceof FavoriteError && error.code === "not_found");
});

test("database constraints keep duplicate relations impossible and foreign keys clean", async (context) => {
  const { database, storage, drive, favorites, persistence } = fixture(context);
  const file = await activeFile(drive, storage, "user-a", "a.pdf");
  favorites.setFileFavorite("user-a", file.id, true);
  favorites.setFileFavorite("user-a", file.id, true);

  const integrity = database
    .prepare<[], { integrity_check: string }>("PRAGMA integrity_check")
    .get();
  const fk = database.prepare<[], { id: number }>("PRAGMA foreign_key_check").all();
  assert.equal(integrity?.integrity_check, "ok");
  assert.equal(fk.length, 0);
  // Single relation despite double add.
  assert.equal(persistence.repositories.favorites.listFileIds("user-a").length, 1);
});
