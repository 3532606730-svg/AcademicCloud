import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { NewAccount } from "../../src/auth/account.js";
import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "../persistence/helpers.js";

const NOW = new Date("2026-08-13T08:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

function account(id: string): NewAccount {
  return {
    id,
    loginName: id,
    passwordHash: "test-hash",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test("Layer 1 critical path survives restart with metadata and object reference intact", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-layer1-acceptance-"));
  const databasePath = join(directory, "acceptance.sqlite");
  const storage = new InMemoryStorageAdapter(() => NOW);
  let fileId = "";
  let objectKey = "";
  let destinationId = "";
  const firstDatabase = openSqliteDatabase(databasePath);
  runMigrations(firstDatabase, INITIAL_MIGRATIONS_DIRECTORY);
  const firstPersistence = new SqlitePersistence(firstDatabase);

  try {
    firstPersistence.repositories.accounts.create(account("owner-1"));
    firstPersistence.repositories.accounts.create(account("owner-2"));
    const drive = new DriveService(firstPersistence, storage, () => NOW);
    const sources = drive.createFolder("owner-1", "Sources", null);
    const destination = drive.createFolder("owner-1", "Library", null);
    destinationId = destination.id;
    const pending = await drive.createUpload("owner-1", {
      folderId: sources.id,
      displayName: "representative-paper.pdf",
      mediaType: "application/pdf",
      sizeBytes: 128,
      checksum: { algorithm: "md5", value: MD5 },
    });
    fileId = pending.file.id;
    objectKey = pending.file.objectKey;
    storage.putObject({
      objectKey,
      sizeBytes: 128,
      etag: "etag",
      checksumAlgorithm: "md5",
      checksum: MD5,
      mediaType: "application/pdf",
      modifiedAt: NOW,
    });
    const active = await drive.completeUpload("owner-1", fileId);
    assert.equal(drive.listEntries("owner-1", sources.id).files[0]?.id, fileId);
    assert.match((await drive.createDownload("owner-1", fileId)).url, /^memory:\/\/download/);
    const moved = drive.updateFile("owner-1", active.id, {
      displayName: "renamed-paper.pdf",
      folderId: destination.id,
    });
    assert.equal(moved.objectKey, objectKey);
    drive.deleteFile("owner-1", fileId);
    assert.equal(drive.listRecycle("owner-1").files[0]?.id, fileId);
    const restored = await drive.restoreFile("owner-1", fileId);
    assert.equal(restored.objectKey, objectKey);
    await assert.rejects(
      drive.createDownload("owner-2", fileId),
      (error) => error instanceof DriveError && error.code === "not_found",
    );
  } finally {
    firstPersistence.close();
  }

  const secondDatabase = openSqliteDatabase(databasePath);
  runMigrations(secondDatabase, INITIAL_MIGRATIONS_DIRECTORY);
  const secondPersistence = new SqlitePersistence(secondDatabase);

  try {
    const drive = new DriveService(secondPersistence, storage, () => NOW);
    const recovered = drive.listEntries("owner-1", destinationId).files[0];
    assert.equal(recovered?.id, fileId);
    assert.equal(recovered?.displayName, "renamed-paper.pdf");
    assert.equal(recovered?.objectKey, objectKey);
    assert.match((await drive.createDownload("owner-1", fileId)).url, /^memory:\/\/download/);
  } finally {
    secondPersistence.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("representative file types preserve exact metadata and safe preview policy", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-file-matrix-"));
  const database = openSqliteDatabase(join(directory, "matrix.sqlite"));
  runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
  const persistence = new SqlitePersistence(database);
  context.after(() => {
    persistence.close();
    rmSync(directory, { recursive: true, force: true });
  });
  persistence.repositories.accounts.create(account("owner-1"));
  const storage = new InMemoryStorageAdapter(() => NOW);
  const drive = new DriveService(persistence, storage, () => NOW);
  const cases = [
    { name: "paper.pdf", mediaType: "application/pdf", sizeBytes: 128, inline: true },
    { name: "scan.png", mediaType: "image/png", sizeBytes: 256, inline: true },
    { name: "notes-中文.txt", mediaType: "text/plain", sizeBytes: 64, inline: true },
    { name: "archive.zip", mediaType: "application/zip", sizeBytes: 512, inline: false },
  ] as const;

  for (const item of cases) {
    const pending = await drive.createUpload("owner-1", {
      folderId: null,
      displayName: item.name,
      mediaType: item.mediaType,
      sizeBytes: item.sizeBytes,
      checksum: { algorithm: "md5", value: MD5 },
    });
    assert.equal(pending.upload.fields["Content-MD5"], MD5);
    storage.putObject({
      objectKey: pending.file.objectKey,
      sizeBytes: item.sizeBytes,
      etag: null,
      checksumAlgorithm: "md5",
      checksum: MD5,
      mediaType: item.mediaType,
      modifiedAt: NOW,
    });
    const active = await drive.completeUpload("owner-1", pending.file.id);
    assert.equal(active.sizeBytes, item.sizeBytes);
    assert.equal(active.mediaType, item.mediaType);
    assert.equal(active.checksum, MD5);

    if (item.inline) {
      assert.match((await drive.createDownload("owner-1", active.id, "inline")).url, /memory:\/\/download/);
    } else {
      await assert.rejects(
        drive.createDownload("owner-1", active.id, "inline"),
        (error) => error instanceof DriveError && error.code === "invalid_state",
      );
      assert.match((await drive.createDownload("owner-1", active.id)).url, /memory:\/\/download/);
    }
  }
});
