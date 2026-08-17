import { createHash } from "node:crypto";
import {
  chmodSync,
  constants,
  copyFileSync,
  createReadStream,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import type { SqliteDatabase } from "../persistence/sqlite/database.js";
import { openSqliteDatabaseReadOnly } from "../persistence/sqlite/database.js";
import { assertMigrationsCurrent } from "../persistence/sqlite/migrations.js";

export interface DatabaseBackupSummary {
  bytes: number;
  sha256: string;
  schemaVersion: number;
  counts: {
    accounts: number;
    folders: number;
    files: number;
    sessions: number;
    invitations: number;
    announcements: number;
  };
}

export async function createDatabaseBackup(
  databasePath: string,
  migrationsDirectory: string,
  outputPath: string,
): Promise<DatabaseBackupSummary> {
  const sourcePath = resolveDatabaseFile(databasePath, "database");
  const destinationPath = resolveDatabaseFile(outputPath, "backup output");

  if (samePath(sourcePath, destinationPath)) {
    throw new Error("backup output must differ from the source database");
  }

  if (!existsSync(sourcePath)) {
    throw new Error("source database does not exist");
  }
  const sourceStat = lstatSync(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error("source database must be a regular non-symlink file");
  }

  if (!existsSync(dirname(destinationPath))) {
    throw new Error("backup output directory does not exist");
  }

  if (existsSync(destinationPath)) {
    throw new Error("backup output already exists");
  }

  const temporaryPath = `${destinationPath}.partial-${process.pid}-${Date.now()}`;
  const source = openSqliteDatabaseReadOnly(sourcePath);

  try {
    assertDatabaseHealthy(source, migrationsDirectory);
    await source.backup(temporaryPath);
    const summary = await verifyDatabaseBackup(temporaryPath, migrationsDirectory);
    chmodSync(temporaryPath, 0o600);
    linkSync(temporaryPath, destinationPath);
    rmSync(temporaryPath, { force: true });
    return summary;
  } finally {
    source.close();
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
  }
}

export async function verifyDatabaseBackup(
  databasePath: string,
  migrationsDirectory: string,
): Promise<DatabaseBackupSummary> {
  const resolvedPath = resolveDatabaseFile(databasePath, "backup database");
  if (!existsSync(resolvedPath)) throw new Error("backup database does not exist");
  const backupStat = lstatSync(resolvedPath);
  if (!backupStat.isFile() || backupStat.isSymbolicLink()) {
    throw new Error("backup database must be a regular non-symlink file");
  }

  // SQLite may create `-wal`/`-shm` companions even for a read-only handle
  // when the database header records WAL mode. Verify an exclusive 0600 copy
  // inside a random task-owned 0700 OS-temporary directory. The backup store
  // itself therefore needs no write permission and cannot retain a sensitive
  // verifier copy after interruption.
  const verificationStage = mkdtempSync(join(tmpdir(), "academiccloud-backup-verify-"));
  const verificationPath = join(verificationStage, "verify.sqlite");
  let database: SqliteDatabase | null = null;

  try {
    chmodSync(verificationStage, 0o700);
    assertVerificationStage(verificationStage);
    copyFileSync(resolvedPath, verificationPath, constants.COPYFILE_EXCL);
    chmodSync(verificationPath, 0o600);
    database = openSqliteDatabaseReadOnly(verificationPath);
    const schemaVersion = assertDatabaseHealthy(database, migrationsDirectory);
    return {
      bytes: statSync(resolvedPath).size,
      sha256: await sha256File(resolvedPath),
      schemaVersion,
      counts: {
        accounts: countRows(database, "accounts"),
        folders: countRows(database, "folders"),
        files: countRows(database, "files"),
        sessions: countRows(database, "sessions"),
        invitations: countRows(database, "invitations"),
        announcements: countRows(database, "announcements"),
      },
    };
  } finally {
    database?.close();
    if (existsSync(verificationStage)) {
      assertVerificationStage(verificationStage);
      rmSync(verificationStage, { recursive: true, force: false });
      if (existsSync(verificationStage)) throw new Error("backup verification cleanup failed");
    }
  }
}

function assertVerificationStage(path: string): void {
  const resolved = realpathSync(path);
  const parent = realpathSync(dirname(resolved));
  const expectedParent = realpathSync(tmpdir());
  const stat = lstatSync(resolved);
  if (
    !samePath(parent, expectedParent)
    || !/^academiccloud-backup-verify-[A-Za-z0-9_-]{6,}$/.test(basename(resolved))
    || !stat.isDirectory()
    || stat.isSymbolicLink()
  ) {
    throw new Error("backup verification stage ownership check failed");
  }
}

function assertDatabaseHealthy(database: SqliteDatabase, migrationsDirectory: string): number {
  const migration = assertMigrationsCurrent(database, migrationsDirectory);
  const integrity = database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get();
  const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();

  if (integrity?.integrity_check !== "ok") {
    throw new Error("database integrity check failed");
  }

  if (foreignKeyFailures.length > 0) {
    throw new Error("database foreign-key check failed");
  }

  return migration.currentVersion;
}

function countRows(database: SqliteDatabase, table: "accounts" | "folders" | "files" | "sessions" | "invitations" | "announcements"): number {
  return database.prepare<[], { count: number }>(`SELECT count(*) AS count FROM ${table}`).get()!.count;
}

function resolveDatabaseFile(path: string, label: string): string {
  if (!path.trim() || path.includes("\0") || path === ":memory:") {
    throw new Error(`${label} must be a filesystem path`);
  }

  const resolvedPath = resolve(path);

  if (resolvedPath.endsWith("-wal") || resolvedPath.endsWith("-shm")) {
    throw new Error(`${label} must not target a SQLite companion file`);
  }

  return resolvedPath;
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}
