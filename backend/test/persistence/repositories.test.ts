import assert from "node:assert/strict";
import { test } from "node:test";

import type { NewAccount } from "../../src/auth/account.js";
import type { NewFolder } from "../../src/drive/folder.js";
import type { NewStoredFile } from "../../src/drive/file.js";
import { createTestPersistence } from "./helpers.js";

const NOW = new Date("2026-08-12T08:00:00.000Z");

function account(id: string, loginName = id): NewAccount {
  return {
    id,
    loginName,
    passwordHash: "$future-auth-task-hash$",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function folder(id: string, ownerId: string, parentId: string | null = null): NewFolder {
  return {
    id,
    ownerId,
    parentId,
    name: id,
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

function storedFile(id: string, ownerId: string, folderId: string | null): NewStoredFile {
  return {
    id,
    ownerId,
    folderId,
    displayName: `${id}.pdf`,
    storageProvider: "test-provider",
    objectKey: `objects/${ownerId}/${id}`,
    mediaType: "application/pdf",
    sizeBytes: 1024,
    checksumAlgorithm: "sha256",
    checksum: "a".repeat(64),
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
    activatedAt: NOW,
    deletedAt: null,
    purgedAt: null,
  };
}

test("repositories round-trip account, folder, and logical file metadata", (context) => {
  const { persistence } = createTestPersistence(context);
  const owner = persistence.repositories.accounts.create(account("owner-1", "Scholar"));
  const parent = persistence.repositories.folders.create(folder("sources", owner.id));
  const file = persistence.repositories.files.create(storedFile("paper-1", owner.id, parent.id));

  assert.deepEqual(persistence.repositories.accounts.findByLoginName("SCHOLAR"), owner);
  assert.deepEqual(persistence.repositories.folders.findById(owner.id, parent.id), parent);
  assert.deepEqual(persistence.repositories.files.findById(owner.id, file.id), file);
  assert.equal(persistence.repositories.folders.findById("another-owner", parent.id), null);
  assert.equal(persistence.repositories.files.findById("another-owner", file.id), null);
});

test("database constraints reject cross-owner hierarchy references", (context) => {
  const { persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create(account("owner-1"));
  persistence.repositories.accounts.create(account("owner-2"));
  persistence.repositories.folders.create(folder("owner-1-folder", "owner-1"));

  assert.throws(
    () => persistence.repositories.folders.create(folder("foreign-child", "owner-2", "owner-1-folder")),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(
    () => persistence.repositories.files.create(storedFile("foreign-file", "owner-2", "owner-1-folder")),
    /FOREIGN KEY constraint failed/,
  );
});

test("database constraints reject invalid active-file lifecycle metadata", (context) => {
  const { persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create(account("owner-1"));
  const invalid = storedFile("invalid-file", "owner-1", null);
  invalid.checksumAlgorithm = null;
  invalid.checksum = null;

  assert.throws(() => persistence.repositories.files.create(invalid), /CHECK constraint failed/);
});

test("database trigger rejects folder hierarchy cycles", (context) => {
  const { database, persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create(account("owner-1"));
  persistence.repositories.folders.create(folder("root", "owner-1"));
  persistence.repositories.folders.create(folder("child", "owner-1", "root"));

  assert.throws(
    () => database.prepare("UPDATE folders SET parent_id = ? WHERE id = ?").run("child", "root"),
    /folder hierarchy cycle/,
  );
});

test("available names and physical object references remain unique", (context) => {
  const { persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create(account("owner-1"));
  persistence.repositories.folders.create({ ...folder("folder-1", "owner-1"), name: "Sources" });

  assert.throws(
    () => persistence.repositories.folders.create({ ...folder("folder-2", "owner-1"), name: "sources" }),
    /UNIQUE constraint failed/,
  );

  const firstFile = persistence.repositories.files.create(storedFile("paper-1", "owner-1", null));
  const conflictingName = {
    ...storedFile("paper-2", "owner-1", null),
    displayName: firstFile.displayName.toUpperCase(),
  };
  const conflictingObject = {
    ...storedFile("paper-3", "owner-1", null),
    objectKey: firstFile.objectKey,
  };

  assert.throws(() => persistence.repositories.files.create(conflictingName), /UNIQUE constraint failed/);
  assert.throws(() => persistence.repositories.files.create(conflictingObject), /UNIQUE constraint failed/);
});

test("failed multi-repository work rolls back through the transaction boundary", (context) => {
  const { persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create(account("owner-1"));

  assert.throws(
    () =>
      persistence.runInTransaction((repositories) => {
        repositories.folders.create(folder("rolled-back", "owner-1"));
        throw new Error("stop transaction");
      }),
    /stop transaction/,
  );
  assert.equal(persistence.repositories.folders.findById("owner-1", "rolled-back"), null);
});
