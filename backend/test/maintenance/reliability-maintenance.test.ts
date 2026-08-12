import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import type { NewAccount } from "../../src/auth/account.js";
import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import { ReliabilityMaintenance } from "../../src/maintenance/reliability-maintenance.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence, INITIAL_MIGRATIONS_DIRECTORY } from "../persistence/helpers.js";

const START = new Date("2026-08-10T08:00:00.000Z");
const LATER = new Date("2026-08-12T08:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

class RecoveryStorage extends InMemoryStorageAdapter {
  failStat = false;
  failDelete = false;
  deleteThenFail = false;
  deleteCalls = 0;

  override async statObject(objectKey: string) {
    if (this.failStat) throw new Error("provider failed");
    return super.statObject(objectKey);
  }

  override async deleteObject(objectKey: string): Promise<void> {
    this.deleteCalls += 1;
    if (this.failDelete) throw new Error("provider failed");
    await super.deleteObject(objectKey);
    if (this.deleteThenFail) throw new Error("response lost");
  }
}

function account(id: string): NewAccount {
  return {
    id,
    loginName: id,
    passwordHash: "test",
    state: "active",
    createdAt: START,
    updatedAt: START,
  };
}

function fixture(context: TestContext) {
  const { persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create(account("owner-1"));
  const storage = new RecoveryStorage(() => START);
  let currentTime = START;
  const drive = new DriveService(persistence, storage, () => currentTime);
  return {
    persistence,
    storage,
    drive,
    setTime(value: Date) {
      currentTime = value;
    },
  };
}

async function createPending(drive: DriveService, displayName = "paper.pdf") {
  return drive.createUpload("owner-1", {
    folderId: null,
    displayName,
    mediaType: "application/pdf",
    sizeBytes: 1024,
    checksum: { algorithm: "md5", value: MD5 },
  });
}

function putExact(storage: RecoveryStorage, objectKey: string): void {
  storage.putObject({
    objectKey,
    sizeBytes: 1024,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: START,
  });
}

test("maintenance is dry-run by default and apply prunes bounded expired state", async (context) => {
  const { persistence, storage, drive } = fixture(context);
  const pending = await createPending(drive);
  persistence.repositories.sessions.create({
    tokenDigest: "a".repeat(64),
    accountId: "owner-1",
    createdAt: START,
    expiresAt: new Date(START.getTime() + 60_000),
    revokedAt: null,
  });
  const maintenance = new ReliabilityMaintenance(persistence, storage, () => LATER);

  const dryRun = await maintenance.run();
  assert.equal(dryRun.mode, "dry_run");
  assert.deepEqual(dryRun.expiredSessions, { selected: 1, pruned: 0 });
  assert.equal(dryRun.files[0]?.outcome, "would_remove_missing_pending");
  assert.equal(JSON.stringify(dryRun).includes("owner-1"), false);
  assert.equal(JSON.stringify(dryRun).includes(pending.file.objectKey), false);
  assert.equal(persistence.repositories.files.findById("owner-1", pending.file.id)?.state, "pending_upload");
  assert.ok(persistence.repositories.sessions.findByTokenDigest("a".repeat(64)));

  const applied = await maintenance.run({ apply: true, limit: 1 });
  assert.deepEqual(applied.expiredSessions, { selected: 1, pruned: 1 });
  assert.equal(applied.files[0]?.outcome, "removed_missing_pending");
  assert.equal(persistence.repositories.files.findById("owner-1", pending.file.id), null);
});

test("stale pending objects activate only on exact metadata and preserve ambiguity", async (context) => {
  const { persistence, storage, drive } = fixture(context);
  const exact = await createPending(drive, "exact.pdf");
  const mismatch = await createPending(drive, "mismatch.pdf");
  putExact(storage, exact.file.objectKey);
  storage.putObject({
    objectKey: mismatch.file.objectKey,
    sizeBytes: 999,
    etag: null,
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: START,
  });

  const result = await new ReliabilityMaintenance(persistence, storage, () => LATER).run({ apply: true });
  assert.equal(result.files.find((item) => item.fileId === exact.file.id)?.outcome, "activated");
  assert.equal(result.files.find((item) => item.fileId === mismatch.file.id)?.outcome, "ambiguous_metadata");
  assert.equal(persistence.repositories.files.findById("owner-1", exact.file.id)?.state, "active");
  assert.equal(persistence.repositories.files.findById("owner-1", mismatch.file.id)?.state, "pending_upload");
});

test("renewal advances revision and removes a pending upload from the stale scan", async (context) => {
  const { persistence, storage, drive, setTime } = fixture(context);
  const pending = await createPending(drive);
  setTime(LATER);
  await drive.renewUploadAuthorization("owner-1", pending.file.id);

  const renewed = persistence.repositories.files.findById("owner-1", pending.file.id)!;
  assert.equal(renewed.revision, pending.file.revision + 1);
  assert.equal(renewed.updatedAt.toISOString(), LATER.toISOString());
  const result = await new ReliabilityMaintenance(persistence, storage, () => LATER).run();
  assert.equal(result.files.length, 0);
});

test("unknown delete outcomes remain purging and a later missing-object pass finishes them", async (context) => {
  const { persistence, storage, drive } = fixture(context);
  const upload = await createPending(drive);
  putExact(storage, upload.file.objectKey);
  await drive.completeUpload("owner-1", upload.file.id);
  drive.deleteFile("owner-1", upload.file.id);
  storage.deleteThenFail = true;

  await assert.rejects(
    drive.permanentlyDeleteFile("owner-1", upload.file.id),
    (error) => error instanceof DriveError && error.code === "storage_unavailable",
  );
  assert.equal(persistence.repositories.files.findById("owner-1", upload.file.id)?.state, "purging");

  storage.deleteThenFail = false;
  const result = await new ReliabilityMaintenance(persistence, storage, () => LATER).run({ apply: true });
  assert.equal(result.files[0]?.outcome, "purged");
  assert.equal(persistence.repositories.files.findById("owner-1", upload.file.id)?.state, "purged");
  assert.equal(storage.deleteCalls, 1);
});

test("provider failures and metadata mismatches preserve purging records", async (context) => {
  const { persistence, storage, drive } = fixture(context);
  const upload = await createPending(drive);
  putExact(storage, upload.file.objectKey);
  await drive.completeUpload("owner-1", upload.file.id);
  drive.deleteFile("owner-1", upload.file.id);
  storage.failDelete = true;
  await assert.rejects(drive.permanentlyDeleteFile("owner-1", upload.file.id));
  storage.failDelete = false;
  storage.putObject({
    objectKey: upload.file.objectKey,
    sizeBytes: 1,
    etag: null,
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: START,
  });

  const maintenance = new ReliabilityMaintenance(persistence, storage, () => LATER);
  const mismatch = await maintenance.run({ apply: true });
  assert.equal(mismatch.files[0]?.outcome, "ambiguous_metadata");
  assert.equal(storage.deleteCalls, 1);
  storage.failStat = true;
  const unavailable = await maintenance.run({ apply: true });
  assert.equal(unavailable.files[0]?.outcome, "storage_unavailable");
  assert.equal(persistence.repositories.files.findById("owner-1", upload.file.id)?.state, "purging");
});

test("maintenance rejects unbounded scans and unsafe pending ages", async (context) => {
  const { persistence, storage } = fixture(context);
  const maintenance = new ReliabilityMaintenance(persistence, storage, () => LATER);

  await assert.rejects(maintenance.run({ limit: 1_001 }), /limit/);
  await assert.rejects(maintenance.run({ pendingAgeMilliseconds: 59 * 60 * 1_000 }), /pending age/);
});

test("purging intent survives a SQLite restart and resumes from an absent object", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-maintenance-restart-"));
  const databasePath = join(directory, "restart.sqlite");
  const firstDatabase = openSqliteDatabase(databasePath);
  runMigrations(firstDatabase, INITIAL_MIGRATIONS_DIRECTORY);
  const firstPersistence = new SqlitePersistence(firstDatabase);
  const storage = new RecoveryStorage(() => START);
  let fileId = "";

  try {
    firstPersistence.repositories.accounts.create(account("owner-1"));
    const drive = new DriveService(firstPersistence, storage, () => START);
    const upload = await createPending(drive);
    fileId = upload.file.id;
    putExact(storage, upload.file.objectKey);
    await drive.completeUpload("owner-1", fileId);
    drive.deleteFile("owner-1", fileId);
    storage.deleteThenFail = true;
    await assert.rejects(drive.permanentlyDeleteFile("owner-1", fileId));
  } finally {
    firstPersistence.close();
  }

  const secondDatabase = openSqliteDatabase(databasePath);
  const secondPersistence = new SqlitePersistence(secondDatabase);

  try {
    assert.equal(secondPersistence.repositories.files.findById("owner-1", fileId)?.state, "purging");
    storage.deleteThenFail = false;
    const result = await new ReliabilityMaintenance(secondPersistence, storage, () => LATER).run({ apply: true });
    assert.equal(result.files[0]?.outcome, "purged");
    assert.equal(secondPersistence.repositories.files.findById("owner-1", fileId)?.state, "purged");
  } finally {
    secondPersistence.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
