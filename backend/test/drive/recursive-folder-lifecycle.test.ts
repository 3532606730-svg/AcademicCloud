import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { NewAccount } from "../../src/auth/account.js";
import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import type { RecycleRepository } from "../../src/drive/recycle-repository.js";
import { FavoriteService } from "../../src/favorites/favorite-service.js";
import type { Persistence, RepositorySet } from "../../src/persistence/contracts.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence, type TestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-17T08:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

class ControlledStorage extends InMemoryStorageAdapter {
  readonly deleteCalls: string[] = [];

  override async deleteObject(objectKey: string): Promise<void> {
    this.deleteCalls.push(objectKey);
    await super.deleteObject(objectKey);
  }
}

function account(id: string): NewAccount {
  return { id, loginName: id, passwordHash: "test", role: "owner", state: "active", createdAt: NOW, updatedAt: NOW };
}

function fixture(context: TestContext) {
  const testPersistence = createTestPersistence(context);
  testPersistence.persistence.repositories.accounts.create(account("owner-1"));
  testPersistence.persistence.repositories.accounts.create(account("owner-2"));
  const storage = new ControlledStorage(() => NOW);
  const drive = new DriveService(testPersistence.persistence, storage, () => NOW);
  const favorites = new FavoriteService(testPersistence.persistence, () => NOW);
  return { ...testPersistence, storage, drive, favorites };
}

async function activeFile(
  drive: DriveService,
  storage: ControlledStorage,
  name: string,
  folderId: string,
  ownerId = "owner-1",
) {
  const upload = await drive.createUpload(ownerId, {
    folderId,
    displayName: name,
    mediaType: "application/pdf",
    sizeBytes: 8,
    checksum: { algorithm: "md5", value: MD5 },
  });
  storage.putObject({
    objectKey: upload.file.objectKey,
    sizeBytes: 8,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  return drive.completeUpload(ownerId, upload.file.id);
}

function groupCount(testPersistence: TestPersistence): number {
  return testPersistence.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM recycle_groups").get()!.count;
}

function withInjectedRecycleFailure(
  base: Persistence,
  method: keyof RecycleRepository,
  failAfter: number,
): Persistence {
  return {
    repositories: base.repositories,
    runInTransaction<T>(work: (repositories: RepositorySet) => T): T {
      return base.runInTransaction((repositories) => {
        let calls = 0;
        const recycle = new Proxy(repositories.recycle, {
          get(target, property) {
            const value = Reflect.get(target, property);
            if (typeof value !== "function") return value;
            if (property !== method) return value.bind(target);
            return (...args: unknown[]) => {
              const result = Reflect.apply(value, target, args);
              calls += 1;
              if (calls === failAfter) throw new Error(`injected ${String(method)} failure`);
              return result;
            };
          },
        });
        return work({ ...repositories, recycle });
      });
    },
    isReady: () => base.isReady(),
    close: () => undefined,
  };
}

test("deep recursive recycle restores only same-group active members and never deletes storage bytes", async (context) => {
  const state = fixture(context);
  const { drive, storage, favorites, persistence, database } = state;
  const a = drive.createFolder("owner-1", "A", null);
  const b = drive.createFolder("owner-1", "B", a.id);
  const c = drive.createFolder("owner-1", "C", b.id);
  const fileA = await activeFile(drive, storage, "a.pdf", a.id);
  const fileB = await activeFile(drive, storage, "b.pdf", b.id);
  const fileC = await activeFile(drive, storage, "c.pdf", c.id);
  const oldDeleted = await activeFile(drive, storage, "old-deleted.pdf", a.id);
  favorites.setFileFavorite("owner-1", fileC.id, true);
  favorites.setFileFavorite("owner-1", oldDeleted.id, true);
  drive.deleteFile("owner-1", oldDeleted.id);
  const oldGroup = persistence.repositories.recycle.findGroupByRoot("owner-1", "file", oldDeleted.id)!;
  const original = [fileA, fileB, fileC].map((file) => ({
    id: file.id,
    folderId: file.folderId,
    objectKey: file.objectKey,
    displayName: file.displayName,
  }));

  drive.deleteFolder("owner-1", a.id);
  const folderGroup = persistence.repositories.recycle.findGroupByRoot("owner-1", "folder", a.id)!;
  assert.deepEqual({ folders: folderGroup.folderCount, files: folderGroup.fileCount }, { folders: 3, files: 3 });
  assert.equal(persistence.repositories.recycle.findGroupByRoot("owner-1", "file", oldDeleted.id)?.id, oldGroup.id);
  assert.deepEqual(drive.listRecycle("owner-1").folders.map((folder) => folder.id), [a.id]);
  assert.deepEqual(drive.listRecycle("owner-1").files.map((file) => file.id), [oldDeleted.id]);
  await assert.rejects(
    drive.permanentlyDeleteFile("owner-1", fileC.id),
    (error) => error instanceof DriveError && error.code === "not_found",
  );
  assert.deepEqual(favorites.listFavorites("owner-1").files, []);

  const restored = drive.restoreFolder("owner-1", a.id);
  assert.equal(restored.id, a.id);
  assert.equal(restored.parentId, null);
  assert.deepEqual(drive.listEntries("owner-1", a.id).folders.map((folder) => folder.id), [b.id]);
  assert.deepEqual(drive.listEntries("owner-1", b.id).folders.map((folder) => folder.id), [c.id]);
  assert.equal(persistence.repositories.files.findById("owner-1", oldDeleted.id)?.state, "deleted");
  assert.deepEqual(
    [fileA, fileB, fileC].map((file) => {
      const current = persistence.repositories.files.findById("owner-1", file.id)!;
      return { id: current.id, folderId: current.folderId, objectKey: current.objectKey, displayName: current.displayName };
    }),
    original,
  );
  assert.deepEqual(favorites.listFavorites("owner-1").files.map((file) => file.id), [fileC.id]);
  assert.deepEqual(storage.deleteCalls, []);
  assert.equal(database.prepare("SELECT 1 FROM recycle_groups WHERE id = ?").get(folderGroup.id), undefined);
  assert.ok(database.prepare("SELECT 1 FROM recycle_groups WHERE id = ?").get(oldGroup.id));
});

test("an independently recycled nested folder and favorite remain outside the parent group", async (context) => {
  const { drive, favorites, persistence } = fixture(context);
  const a = drive.createFolder("owner-1", "A", null);
  const b = drive.createFolder("owner-1", "B", a.id);
  const c = drive.createFolder("owner-1", "C", b.id);
  favorites.setFolderFavorite("owner-1", c.id, true);

  drive.deleteFolder("owner-1", b.id);
  const nestedGroup = persistence.repositories.recycle.findGroupByRoot("owner-1", "folder", b.id)!;
  drive.deleteFolder("owner-1", a.id);
  const parentGroup = persistence.repositories.recycle.findGroupByRoot("owner-1", "folder", a.id)!;
  assert.notEqual(parentGroup.id, nestedGroup.id);
  assert.deepEqual(drive.listRecycle("owner-1").folders.map((folder) => folder.id).sort(), [a.id, b.id].sort());

  drive.restoreFolder("owner-1", a.id);
  assert.equal(persistence.repositories.folders.findById("owner-1", b.id)?.state, "deleted");
  assert.equal(persistence.repositories.folders.findById("owner-1", c.id)?.state, "deleted");
  assert.deepEqual(favorites.listFavorites("owner-1").folders, []);

  drive.restoreFolder("owner-1", b.id);
  assert.equal(persistence.repositories.folders.findById("owner-1", c.id)?.state, "active");
  assert.deepEqual(favorites.listFavorites("owner-1").folders.map((entry) => entry.folder.id), [c.id]);
});

test("pending uploads at direct or deep levels reject the entire operation with zero mutation", async (context) => {
  const state = fixture(context);
  const { drive, persistence } = state;
  const direct = drive.createFolder("owner-1", "Direct", null);
  const directPending = await drive.createUpload("owner-1", {
    folderId: direct.id,
    displayName: "direct.pdf",
    mediaType: "application/pdf",
    sizeBytes: 8,
    checksum: { algorithm: "md5", value: MD5 },
  });
  assert.throws(
    () => drive.deleteFolder("owner-1", direct.id),
    (error) => error instanceof DriveError && error.code === "invalid_state",
  );

  const deep = drive.createFolder("owner-1", "Deep", null);
  const child = drive.createFolder("owner-1", "Child", deep.id);
  const deepPending = await drive.createUpload("owner-1", {
    folderId: child.id,
    displayName: "deep.pdf",
    mediaType: "application/pdf",
    sizeBytes: 8,
    checksum: { algorithm: "md5", value: MD5 },
  });
  assert.throws(
    () => drive.deleteFolder("owner-1", deep.id),
    (error) => error instanceof DriveError && error.code === "invalid_state",
  );

  for (const folderId of [direct.id, deep.id, child.id]) {
    assert.equal(persistence.repositories.folders.findById("owner-1", folderId)?.state, "active");
  }
  assert.equal(persistence.repositories.files.findById("owner-1", directPending.file.id)?.state, "pending_upload");
  assert.equal(persistence.repositories.files.findById("owner-1", deepPending.file.id)?.state, "pending_upload");
  assert.equal(groupCount(state), 0);
});

test("account isolation, original parent availability, and sibling conflicts fail atomically", (context) => {
  const state = fixture(context);
  const { drive, persistence } = state;
  const parent = drive.createFolder("owner-1", "Parent", null);
  const root = drive.createFolder("owner-1", "Root", parent.id);

  assert.throws(() => drive.deleteFolder("owner-2", root.id), (error) => error instanceof DriveError && error.code === "not_found");
  assert.equal(persistence.repositories.folders.findById("owner-1", root.id)?.state, "active");
  drive.deleteFolder("owner-1", root.id);
  assert.throws(() => drive.restoreFolder("owner-2", root.id), (error) => error instanceof DriveError && error.code === "not_found");
  assert.equal(drive.restoreFolder("owner-1", root.id).parentId, parent.id);

  drive.deleteFolder("owner-1", root.id);
  drive.createFolder("owner-1", "Root", parent.id);
  assert.throws(() => drive.restoreFolder("owner-1", root.id), (error) => error instanceof DriveError && error.code === "name_conflict");
  assert.equal(persistence.repositories.folders.findById("owner-1", root.id)?.state, "deleted");

  const unavailableParent = drive.createFolder("owner-1", "Unavailable", null);
  const unavailableChild = drive.createFolder("owner-1", "Child", unavailableParent.id);
  drive.deleteFolder("owner-1", unavailableChild.id);
  drive.deleteFolder("owner-1", unavailableParent.id);
  assert.throws(
    () => drive.restoreFolder("owner-1", unavailableChild.id),
    (error) => error instanceof DriveError && error.code === "not_found",
  );
  assert.equal(persistence.repositories.folders.findById("owner-1", unavailableChild.id)?.parentId, unavailableParent.id);
  assert.equal(persistence.repositories.folders.findById("owner-1", unavailableChild.id)?.state, "deleted");
});

test("double and competing recycle or restore attempts produce one transition without stale mutation", async (context) => {
  const state = fixture(context);
  const { drive, persistence } = state;
  const root = drive.createFolder("owner-1", "Root", null);
  const services = [drive, new DriveService(persistence, new ControlledStorage(() => NOW), () => NOW)];

  const recycleResults = await Promise.allSettled(services.map(async (service) => service.deleteFolder("owner-1", root.id)));
  assert.equal(recycleResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(recycleResults.filter((result) => result.status === "rejected").length, 1);
  assert.equal(groupCount(state), 1);
  assert.equal(persistence.repositories.folders.findById("owner-1", root.id)?.state, "deleted");

  const restoreResults = await Promise.allSettled(services.map(async (service) => service.restoreFolder("owner-1", root.id)));
  assert.equal(restoreResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(restoreResults.filter((result) => result.status === "rejected").length, 1);
  assert.equal(groupCount(state), 0);
  assert.equal(persistence.repositories.folders.findById("owner-1", root.id)?.state, "active");

  assert.throws(() => drive.restoreFolder("owner-1", root.id), (error) => error instanceof DriveError && error.code === "not_found");
});

test("injected mid-recycle and mid-restore failures roll back every member and group mutation", async (context) => {
  const state = fixture(context);
  const { drive, storage, persistence } = state;
  const a = drive.createFolder("owner-1", "A", null);
  const b = drive.createFolder("owner-1", "B", a.id);
  const c = drive.createFolder("owner-1", "C", b.id);
  const file = await activeFile(drive, storage, "paper.pdf", c.id);

  const failingRecycle = new DriveService(
    withInjectedRecycleFailure(persistence, "recycleFolder", 2),
    storage,
    () => NOW,
  );
  assert.throws(() => failingRecycle.deleteFolder("owner-1", a.id), /injected recycleFolder failure/);
  for (const folderId of [a.id, b.id, c.id]) {
    assert.equal(persistence.repositories.folders.findById("owner-1", folderId)?.state, "active");
  }
  assert.equal(persistence.repositories.files.findById("owner-1", file.id)?.state, "active");
  assert.equal(groupCount(state), 0);

  drive.deleteFolder("owner-1", a.id);
  const group = persistence.repositories.recycle.findGroupByRoot("owner-1", "folder", a.id)!;
  const failingRestore = new DriveService(
    withInjectedRecycleFailure(persistence, "restoreFolder", 2),
    storage,
    () => NOW,
  );
  assert.throws(() => failingRestore.restoreFolder("owner-1", a.id), /injected restoreFolder failure/);
  for (const folderId of [a.id, b.id, c.id]) {
    assert.equal(persistence.repositories.folders.findById("owner-1", folderId)?.state, "deleted");
  }
  assert.equal(persistence.repositories.files.findById("owner-1", file.id)?.state, "deleted");
  assert.equal(persistence.repositories.recycle.findGroupByRoot("owner-1", "folder", a.id)?.id, group.id);
  assert.equal(groupCount(state), 1);
  assert.deepEqual(storage.deleteCalls, []);
});
