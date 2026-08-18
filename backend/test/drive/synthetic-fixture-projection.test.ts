import assert from "node:assert/strict";
import { test } from "node:test";

import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import { LEGACY_PROD03C2_FIXTURE } from "../../src/drive/synthetic-fixtures.js";
import { FavoriteError } from "../../src/favorites/favorite.js";
import { FavoriteService } from "../../src/favorites/favorite-service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-19T00:00:00.000Z");

test("only the exact retained PROD-03C2 fixture is suppressed from catalogue, navigation, Favorites, and Recycle", (context) => {
  const { persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({
    id: "owner-fixture",
    loginName: "owner-fixture",
    passwordHash: "test",
    role: "owner",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const drive = new DriveService(persistence, new InMemoryStorageAdapter(() => NOW), () => NOW);
  const favorites = new FavoriteService(persistence, () => NOW);

  const hidden = drive.createFolder("owner-fixture", LEGACY_PROD03C2_FIXTURE.folderName, null);
  const ordinary = drive.createFolder("owner-fixture", "prod03c2-e2e-another-real-name", null);
  assert.deepEqual(drive.listEntries("owner-fixture", null).folders.map((folder) => folder.id), [ordinary.id]);
  assert.throws(
    () => drive.listEntries("owner-fixture", hidden.id),
    (error: unknown) => error instanceof DriveError && error.code === "not_found",
  );
  assert.throws(
    () => favorites.setFolderFavorite("owner-fixture", hidden.id, true),
    (error: unknown) => error instanceof FavoriteError && error.code === "not_found",
  );
  assert.throws(
    () => drive.deleteFolder("owner-fixture", hidden.id),
    (error: unknown) => error instanceof DriveError && error.code === "not_found",
  );

  favorites.setFolderFavorite("owner-fixture", ordinary.id, true);
  assert.deepEqual(favorites.listFavorites("owner-fixture").folders.map(({ folder }) => folder.id), [ordinary.id]);
  drive.deleteFolder("owner-fixture", ordinary.id);
  assert.deepEqual(drive.listRecycle("owner-fixture").folders.map((folder) => folder.id), [ordinary.id]);

  // Simulate the retained historical row already being recycled: projection
  // suppression is still exact and does not hide similarly named resources.
  const current = persistence.repositories.folders.findById("owner-fixture", hidden.id)!;
  const groupId = "legacy-fixture-group";
  persistence.runInTransaction((repositories) => {
    repositories.recycle.createGroup({
      id: groupId,
      ownerId: "owner-fixture",
      rootKind: "folder",
      rootId: hidden.id,
      folderCount: 1,
      fileCount: 0,
      createdAt: NOW,
    });
    assert.equal(repositories.recycle.recycleFolder("owner-fixture", current.id, groupId, NOW), true);
  });
  assert.deepEqual(drive.listRecycle("owner-fixture").folders.map((folder) => folder.id), [ordinary.id]);
});
