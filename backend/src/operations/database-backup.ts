import { createHash } from "node:crypto";
import {
  chmodSync,
  createReadStream,
  existsSync,
  linkSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

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
  const database = openSqliteDatabaseReadOnly(resolvedPath);

  try {
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
      },
    };
  } finally {
    database.close();
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

function countRows(database: SqliteDatabase, table: "accounts" | "folders" | "files" | "sessions"): number {
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
