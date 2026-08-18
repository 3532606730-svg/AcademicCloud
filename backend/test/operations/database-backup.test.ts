import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { NewAccount } from "../../src/auth/account.js";
import type { NewStoredFile } from "../../src/drive/file.js";
import { recordAuditEvent } from "../../src/audit/audit-service.js";
import { parseBackupArguments } from "../../src/operations/backup-options.js";
import { createDatabaseBackup, verifyDatabaseBackup } from "../../src/operations/database-backup.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "../persistence/helpers.js";

const NOW = new Date("2026-08-13T08:00:00.000Z");

function account(id: string): NewAccount {
  return {
    id,
    loginName: id,
    passwordHash: "test-hash",
    role: "owner",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function file(id: string): NewStoredFile {
  return {
    id,
    ownerId: "owner-1",
    folderId: null,
    displayName: `${id}.pdf`,
    storageProvider: "memory",
    objectKey: `objects/${id.slice(0, 2)}/${id.padEnd(62, "a")}`,
    mediaType: "application/pdf",
    sizeBytes: 128,
    checksumAlgorithm: "md5",
    checksum: "1B2M2Y8AsgTpgAmY7PhCfg==",
    state: "active",
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
    activatedAt: NOW,
    deletedAt: null,
    purgedAt: null,
  };
}

test("online backup creates a verified non-overwriting snapshot that survives restore", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-backup-"));
  const backupDirectory = join(directory, "backups");
  mkdirSync(backupDirectory);
  const sourcePath = join(directory, "live.sqlite");
  const backupPath = join(backupDirectory, "snapshot.sqlite");
  const sourceDatabase = openSqliteDatabase(sourcePath);
  runMigrations(sourceDatabase, INITIAL_MIGRATIONS_DIRECTORY);
  const source = new SqlitePersistence(sourceDatabase);

  try {
    source.repositories.accounts.create(account("owner-1"));
    source.runInTransaction((repositories) => recordAuditEvent(repositories, {
      action: "auth.login",
      outcome: "succeeded",
      actorKind: "account",
      actorAccountId: "owner-1",
      targetId: "owner-1",
      reason: null,
      occurredAt: NOW,
    }));
    source.repositories.invitations.create({
      id: "invite-1",
      tokenDigest: "a".repeat(64),
      createdByAccountId: "owner-1",
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      consumedAt: null,
      consumedByAccountId: null,
      revokedAt: null,
    });
    source.repositories.announcements.create({
      id: "announcement-1",
      title: "Archive hours",
      body: "The reading room closes at 18:00.",
      severity: "info",
      linkUrl: null,
      isActive: true,
      publishedAt: NOW,
      expiresAt: null,
      createdByAccountId: "owner-1",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const stored = source.repositories.files.create(file("file-1"));
    const created = await createDatabaseBackup(
      sourcePath,
      INITIAL_MIGRATIONS_DIRECTORY,
      backupPath,
    );

    assert.equal(created.schemaVersion, 15);
    assert.deepEqual(created.counts, { accounts: 1, folders: 0, files: 1, sessions: 0, invitations: 1, announcements: 1 });
    assert.match(created.sha256, /^[a-f0-9]{64}$/);
    assert.ok(created.bytes > 0);
    source.repositories.files.create(file("file-2"));
    const verified = await verifyDatabaseBackup(backupPath, INITIAL_MIGRATIONS_DIRECTORY);
    assert.deepEqual(verified, created);
    await assert.rejects(
      createDatabaseBackup(sourcePath, INITIAL_MIGRATIONS_DIRECTORY, backupPath),
      /already exists/,
    );
    assert.deepEqual(await verifyDatabaseBackup(backupPath, INITIAL_MIGRATIONS_DIRECTORY), created);

    const restoredPath = join(directory, "restored.sqlite");
    copyFileSync(backupPath, restoredPath);
    const restoredDatabase = openSqliteDatabase(restoredPath);
    const restored = new SqlitePersistence(restoredDatabase);

    try {
      const recovered = restored.repositories.files.findById("owner-1", stored.id);
      assert.equal(recovered?.objectKey, stored.objectKey);
      assert.equal(restored.repositories.files.findById("owner-1", "file-2"), null);
      assert.equal(restored.repositories.announcements.findById("announcement-1")?.title, "Archive hours");
      assert.equal(restored.repositories.audit.listBefore(null, 10)[0]?.action, "auth.login");
      assert.equal(restored.isReady(), true);
    } finally {
      restored.close();
    }
  } finally {
    source.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backup validation rejects missing paths, companion files, and source overwrite", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-backup-guard-"));
  const sourcePath = join(directory, "live.sqlite");
  const database = openSqliteDatabase(sourcePath);
  runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
  database.close();

  try {
    await assert.rejects(
      createDatabaseBackup(sourcePath, INITIAL_MIGRATIONS_DIRECTORY, sourcePath),
      /must differ/,
    );
    await assert.rejects(
      createDatabaseBackup(sourcePath, INITIAL_MIGRATIONS_DIRECTORY, `${sourcePath}-wal`),
      /companion/,
    );
    await assert.rejects(
      verifyDatabaseBackup(join(directory, "missing.sqlite"), INITIAL_MIGRATIONS_DIRECTORY),
    );
    assert.equal(existsSync(join(directory, "missing.sqlite")), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backup CLI accepts one explicit create or verify target", () => {
  assert.deepEqual(parseBackupArguments(["create", "--output=/safe/backup.sqlite"]), {
    operation: "create",
    path: "/safe/backup.sqlite",
  });
  assert.deepEqual(parseBackupArguments(["verify", "--input=/safe/backup.sqlite"]), {
    operation: "verify",
    path: "/safe/backup.sqlite",
  });
  assert.throws(() => parseBackupArguments([]), /usage/);
  assert.throws(() => parseBackupArguments(["create", "--output="]), /usage/);
  assert.throws(() => parseBackupArguments(["restore", "--input=x"]), /usage/);
});
