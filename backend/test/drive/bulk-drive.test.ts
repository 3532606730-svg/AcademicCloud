import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { driveEntryVersion, type BulkItemInput } from "../../src/drive/bulk.js";
import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import type { StoredFile } from "../../src/drive/file.js";
import type { Folder } from "../../src/drive/folder.js";
import { FavoriteService } from "../../src/favorites/favorite-service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

function fixture(context: TestContext) {
  const { persistence } = createTestPersistence(context);
  for (const [id, role] of [["user-a", "owner"], ["user-b", "member"]] as const) {
    persistence.repositories.accounts.create({
      id,
      loginName: id,
      passwordHash: "test",
      role,
      state: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  const storage = new InMemoryStorageAdapter(() => NOW);
  const drive = new DriveService(persistence, storage, () => NOW);
  const favorites = new FavoriteService(persistence, () => NOW);
  return { persistence, storage, drive, favorites };
}

function item(resource: Folder | StoredFile): BulkItemInput {
  return {
    kind: "displayName" in resource ? "file" : "folder",
    id: resource.id,
    version: driveEntryVersion(resource),
  };
}

async function activeFile(
  drive: DriveService,
  storage: InMemoryStorageAdapter,
  ownerId: string,
  displayName: string,
  folderId: string | null = null,
): Promise<StoredFile> {
  const reserved = await drive.createUpload(ownerId, {
    folderId,
    displayName,
    mediaType: "application/pdf",
    sizeBytes: 8,
    checksum: { algorithm: "md5", value: MD5 },
  });
  storage.putObject({
    objectKey: reserved.file.objectKey,
    sizeBytes: 8,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  return drive.completeUpload(ownerId, reserved.file.id);
}

test("bulk move atomically moves mixed active roots while preserving object identity", async (context) => {
  const { persistence, storage, drive } = fixture(context);
  const destination = drive.createFolder("user-a", "Destination", null);
  const folder = drive.createFolder("user-a", "Sources", null);
  const file = await activeFile(drive, storage, "user-a", "paper.pdf");
  const objectKey = file.objectKey;

  const result = await drive.bulkOperation("user-a", {
    action: "move",
    items: [item(folder), item(file)],
    destinationFolderId: destination.id,
  });

  assert.equal(result.atomic, true);
  assert.deepEqual(result.items.map(({ kind, id, outcome }) => ({ kind, id, outcome })), [
    { kind: "folder", id: folder.id, outcome: "succeeded" },
    { kind: "file", id: file.id, outcome: "succeeded" },
  ]);
  assert.equal(persistence.repositories.folders.findById("user-a", folder.id)?.parentId, destination.id);
  assert.equal(persistence.repositories.files.findById("user-a", file.id)?.folderId, destination.id);
  assert.equal(persistence.repositories.files.findById("user-a", file.id)?.objectKey, objectKey);
  assert.notEqual(await storage.statObject(objectKey), null);
});

test("bulk recycle and restore preserve separate roots, Favorites, and independently deleted descendants", async (context) => {
  const { persistence, storage, drive, favorites } = fixture(context);
  const root = drive.createFolder("user-a", "Root", null);
  const child = drive.createFolder("user-a", "Child", root.id);
  const groupedFile = await activeFile(drive, storage, "user-a", "grouped.pdf", child.id);
  const oldDeleted = await activeFile(drive, storage, "user-a", "old.pdf", child.id);
  const standalone = await activeFile(drive, storage, "user-a", "standalone.pdf");
  drive.deleteFile("user-a", oldDeleted.id);
  favorites.setFolderFavorite("user-a", root.id, true);
  favorites.setFileFavorite("user-a", standalone.id, true);

  await drive.bulkOperation("user-a", {
    action: "recycle",
    items: [item(root), item(standalone)],
  });
  assert.equal(persistence.repositories.folders.findById("user-a", root.id)?.state, "deleted");
  assert.equal(persistence.repositories.files.findById("user-a", groupedFile.id)?.state, "deleted");
  assert.equal(persistence.repositories.files.findById("user-a", oldDeleted.id)?.state, "deleted");
  assert.equal(favorites.listFavorites("user-a").folders.length, 0);
  assert.equal(favorites.listFavorites("user-a").files.length, 0);
  for (const file of [groupedFile, oldDeleted, standalone]) {
    assert.notEqual(await storage.statObject(file.objectKey), null);
  }

  const deletedRoot = persistence.repositories.folders.findById("user-a", root.id)!;
  const deletedStandalone = persistence.repositories.files.findById("user-a", standalone.id)!;
  await drive.bulkOperation("user-a", {
    action: "restore",
    items: [item(deletedRoot), item(deletedStandalone)],
  });

  assert.equal(persistence.repositories.folders.findById("user-a", root.id)?.state, "active");
  assert.equal(persistence.repositories.files.findById("user-a", groupedFile.id)?.state, "active");
  assert.equal(persistence.repositories.files.findById("user-a", standalone.id)?.state, "active");
  assert.equal(persistence.repositories.files.findById("user-a", oldDeleted.id)?.state, "deleted");
  assert.deepEqual(favorites.listFavorites("user-a").folders.map((entry) => entry.folder.id), [root.id]);
  assert.deepEqual(favorites.listFavorites("user-a").files.map((entry) => entry.id), [standalone.id]);
  for (const file of [groupedFile, oldDeleted, standalone]) {
    assert.notEqual(await storage.statObject(file.objectKey), null);
  }
});

test("duplicate, oversized, foreign, and missing selections fail without existence leaks", async (context) => {
  const { storage, drive } = fixture(context);
  const own = await activeFile(drive, storage, "user-a", "own.pdf");
  const foreign = await activeFile(drive, storage, "user-b", "foreign.pdf");

  await assert.rejects(
    drive.bulkOperation("user-a", { action: "favorite_add", items: [item(own), item(own)] }),
    /duplicate bulk item id/,
  );
  await assert.rejects(
    drive.bulkOperation("user-a", {
      action: "favorite_add",
      items: Array.from({ length: 101 }, (_, index) => ({
        kind: "file" as const,
        id: `file-${index}`,
        version: "a".repeat(43),
      })),
    }),
    /1 to 100/,
  );
  for (const candidate of [item(foreign), { kind: "file" as const, id: "missing", version: "a".repeat(43) }]) {
    await assert.rejects(
      drive.bulkOperation("user-a", { action: "favorite_add", items: [candidate] }),
      (error) => error instanceof DriveError && error.code === "not_found",
    );
  }
});

test("a stale member rejects the whole batch before any move", async (context) => {
  const { persistence, storage, drive } = fixture(context);
  const source = drive.createFolder("user-a", "Source", null);
  const destination = drive.createFolder("user-a", "Destination", null);
  const first = await activeFile(drive, storage, "user-a", "first.pdf", source.id);
  const second = await activeFile(drive, storage, "user-a", "second.pdf", source.id);
  const selected = [item(first), item(second)];
  drive.updateFile("user-a", second.id, { displayName: "changed.pdf" });

  await assert.rejects(
    drive.bulkOperation("user-a", { action: "move", items: selected, destinationFolderId: destination.id }),
    (error) => error instanceof DriveError && error.code === "concurrent_change",
  );
  assert.equal(persistence.repositories.files.findById("user-a", first.id)?.folderId, source.id);
  assert.equal(persistence.repositories.files.findById("user-a", second.id)?.folderId, source.id);
});

test("a destination name conflict rolls back every earlier batch move", async (context) => {
  const { persistence, storage, drive } = fixture(context);
  const left = drive.createFolder("user-a", "Left", null);
  const right = drive.createFolder("user-a", "Right", null);
  const destination = drive.createFolder("user-a", "Destination", null);
  const first = await activeFile(drive, storage, "user-a", "same.pdf", left.id);
  const second = await activeFile(drive, storage, "user-a", "same.pdf", right.id);

  await assert.rejects(
    drive.bulkOperation("user-a", {
      action: "move",
      items: [item(first), item(second)],
      destinationFolderId: destination.id,
    }),
    (error) => error instanceof DriveError && error.code === "name_conflict",
  );
  assert.equal(persistence.repositories.files.findById("user-a", first.id)?.folderId, left.id);
  assert.equal(persistence.repositories.files.findById("user-a", second.id)?.folderId, right.id);
});

test("overlapping folder/file roots and pending descendants reject bulk recycle with zero mutation", async (context) => {
  const { persistence, storage, drive } = fixture(context);
  const root = drive.createFolder("user-a", "Root", null);
  const child = drive.createFolder("user-a", "Child", root.id);
  const active = await activeFile(drive, storage, "user-a", "active.pdf", root.id);

  await assert.rejects(
    drive.bulkOperation("user-a", {
      action: "move",
      items: [item(root)],
      destinationFolderId: child.id,
    }),
    (error) => error instanceof DriveError && error.code === "invalid_move",
  );
  assert.equal(persistence.repositories.folders.findById("user-a", root.id)?.parentId, null);

  await assert.rejects(
    drive.bulkOperation("user-a", { action: "recycle", items: [item(root), item(active)] }),
    (error) => error instanceof DriveError && error.code === "invalid_state",
  );
  assert.equal(persistence.repositories.folders.findById("user-a", root.id)?.state, "active");
  assert.equal(persistence.repositories.files.findById("user-a", active.id)?.state, "active");

  await drive.createUpload("user-a", {
    folderId: root.id,
    displayName: "pending.pdf",
    mediaType: "application/pdf",
    sizeBytes: 8,
    checksum: { algorithm: "md5", value: MD5 },
  });
  await assert.rejects(
    drive.bulkOperation("user-a", { action: "recycle", items: [item(root)] }),
    (error) => error instanceof DriveError && error.code === "invalid_state",
  );
  assert.equal(persistence.repositories.folders.findById("user-a", root.id)?.state, "active");
});

test("Favorite batches are atomic and replays are idempotent", async (context) => {
  const { persistence, storage, drive, favorites } = fixture(context);
  const active = await activeFile(drive, storage, "user-a", "active.pdf");
  const rejected = await activeFile(drive, storage, "user-a", "deleted.pdf");
  drive.deleteFile("user-a", rejected.id);
  const deleted = persistence.repositories.files.findById("user-a", rejected.id)!;

  await assert.rejects(
    drive.bulkOperation("user-a", { action: "favorite_add", items: [item(active), item(deleted)] }),
    (error) => error instanceof DriveError && error.code === "invalid_state",
  );
  assert.deepEqual(favorites.listFavorites("user-a").files, []);

  const request = { action: "favorite_add" as const, items: [item(active)] };
  await drive.bulkOperation("user-a", request);
  await drive.bulkOperation("user-a", request);
  assert.deepEqual(favorites.listFavorites("user-a").files.map((file) => file.id), [active.id]);

  const remove = { action: "favorite_remove" as const, items: [item(active)] };
  await drive.bulkOperation("user-a", remove);
  await drive.bulkOperation("user-a", remove);
  assert.deepEqual(favorites.listFavorites("user-a").files, []);
});

test("an injected mid-batch repository failure rolls back earlier Favorite writes", async (context) => {
  const { persistence, storage, drive, favorites } = fixture(context);
  const first = await activeFile(drive, storage, "user-a", "first.pdf");
  const second = await activeFile(drive, storage, "user-a", "second.pdf");
  const repository = persistence.repositories.favorites;
  const original = repository.addFile.bind(repository);
  let calls = 0;
  repository.addFile = (accountId, fileId, createdAt) => {
    calls += 1;
    if (calls === 2) throw new Error("injected bulk Favorite failure");
    original(accountId, fileId, createdAt);
  };

  await assert.rejects(
    drive.bulkOperation("user-a", { action: "favorite_add", items: [item(first), item(second)] }),
    /injected bulk Favorite failure/,
  );
  assert.deepEqual(favorites.listFavorites("user-a").files, []);
});

test("competing recycle and restore replays produce one transition without duplicate groups", async (context) => {
  const { persistence, storage, drive } = fixture(context);
  const file = await activeFile(drive, storage, "user-a", "race.pdf");
  const recycleRequest = { action: "recycle" as const, items: [item(file)] };
  const recycleResults = await Promise.allSettled([
    drive.bulkOperation("user-a", recycleRequest),
    drive.bulkOperation("user-a", recycleRequest),
  ]);
  assert.equal(recycleResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(recycleResults.filter((result) => result.status === "rejected").length, 1);
  assert.equal(persistence.repositories.files.findById("user-a", file.id)?.state, "deleted");
  const group = persistence.repositories.recycle.findGroupByRoot("user-a", "file", file.id);
  assert.ok(group);

  const deleted = persistence.repositories.files.findById("user-a", file.id)!;
  const restoreRequest = { action: "restore" as const, items: [item(deleted)] };
  const restoreResults = await Promise.allSettled([
    drive.bulkOperation("user-a", restoreRequest),
    drive.bulkOperation("user-a", restoreRequest),
  ]);
  assert.equal(restoreResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(restoreResults.filter((result) => result.status === "rejected").length, 1);
  assert.equal(persistence.repositories.files.findById("user-a", file.id)?.state, "active");
  assert.equal(persistence.repositories.recycle.findGroupByRoot("user-a", "file", file.id), null);
});

test("an unavailable original parent rejects the whole restore batch", async (context) => {
  const { persistence, storage, drive } = fixture(context);
  const parent = drive.createFolder("user-a", "Parent", null);
  const childFile = await activeFile(drive, storage, "user-a", "child.pdf", parent.id);
  const standalone = await activeFile(drive, storage, "user-a", "standalone.pdf");
  drive.deleteFile("user-a", childFile.id);
  drive.deleteFolder("user-a", parent.id);
  drive.deleteFile("user-a", standalone.id);
  const deletedChild = persistence.repositories.files.findById("user-a", childFile.id)!;
  const deletedStandalone = persistence.repositories.files.findById("user-a", standalone.id)!;

  await assert.rejects(
    drive.bulkOperation("user-a", {
      action: "restore",
      items: [item(deletedStandalone), item(deletedChild)],
    }),
    (error) => error instanceof DriveError && error.code === "not_found",
  );
  assert.equal(persistence.repositories.files.findById("user-a", standalone.id)?.state, "deleted");
  assert.equal(persistence.repositories.files.findById("user-a", childFile.id)?.state, "deleted");
});
