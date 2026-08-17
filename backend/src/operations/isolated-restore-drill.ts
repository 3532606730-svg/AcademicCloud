import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { ReliabilityMaintenance } from "../maintenance/reliability-maintenance.js";
import { openSqliteDatabaseReadOnly } from "../persistence/sqlite/database.js";
import { SqlitePersistence } from "../persistence/sqlite/persistence.js";
import { createApplication } from "../platform/application.js";
import { InMemoryStorageAdapter } from "../storage/in-memory-storage-adapter.js";
import { verifyBackupReceipt } from "./backup-receipt.js";
import {
  type DatabaseBackupSummary,
  verifyDatabaseBackup,
} from "./database-backup.js";

export interface IsolatedRestoreDrillResult {
  status: "ok";
  sourceBackupBasename: string;
  sourceSha256: string;
  bytes: number;
  databaseSchemaVersion: number;
  health: "ok";
  readiness: "ready";
  maintenanceMode: "dry_run";
  maintenanceSelectedFiles: number;
  expiredSessionsSelected: number;
  sourceUnchanged: true;
  restoredCopyUnchanged: true;
  cleanupCompleted: true;
  networkListenerOpened: false;
  storageProvider: "memory";
}

export async function runIsolatedRestoreDrill(options: {
  backupPath: string;
  receiptPath: string;
  migrationsDirectory: string;
  liveDatabasePath: string;
  now?: Date;
  createApplicationForDrill?: typeof createApplication;
  removeStageForDrill?: (path: string) => void;
}): Promise<IsolatedRestoreDrillResult> {
  const sourcePath = requireRegularNonSymlink(options.backupPath, "backup");
  const livePath = resolveRequiredPath(options.liveDatabasePath, "live database");
  if (samePath(realPathIfPresent(sourcePath), realPathIfPresent(livePath))) {
    throw new Error("restore drill source must not be the configured live database");
  }

  const verified = await verifyBackupReceipt(
    sourcePath,
    options.migrationsDirectory,
    options.receiptPath,
    options.now ?? new Date(),
  );
  const sourceBefore = verified.summary;
  const stage = mkdtempSync(join(tmpdir(), "academiccloud-restore-drill-"));
  let result: Omit<IsolatedRestoreDrillResult, "cleanupCompleted"> | null = null;
  let primaryError: unknown = null;
  let cleanupError: unknown = null;

  try {
    assertOwnedStage(stage);
    const restoredPath = join(stage, "restored.sqlite");
    copyFileSync(sourcePath, restoredPath, constants.COPYFILE_EXCL);
    chmodSync(restoredPath, 0o600);

    const restoredBefore = await verifyDatabaseBackup(restoredPath, options.migrationsDirectory);
    assertSameSummary(sourceBefore, restoredBefore, "restored copy identity");

    const app = await (options.createApplicationForDrill ?? createApplication)(
      {
        host: "127.0.0.1",
        port: 3000,
        logLevel: "silent",
        environment: "production",
        appOrigin: "https://restore-drill.invalid",
      },
      { databasePath: restoredPath, migrationsDirectory: resolve(options.migrationsDirectory) },
      new InMemoryStorageAdapter(),
    );

    let health: "ok";
    let readiness: "ready";
    try {
      const healthResponse = await app.inject({ method: "GET", url: "/api/health" });
      const readyResponse = await app.inject({ method: "GET", url: "/api/ready" });
      if (healthResponse.statusCode !== 200 || healthResponse.json().status !== "ok") {
        throw new Error("restore drill health check failed");
      }
      if (readyResponse.statusCode !== 200 || readyResponse.json().status !== "ready") {
        throw new Error("restore drill readiness check failed");
      }
      health = "ok";
      readiness = "ready";
    } finally {
      await app.close();
    }

    const maintenanceDatabase = openSqliteDatabaseReadOnly(restoredPath);
    const persistence = new SqlitePersistence(maintenanceDatabase);
    let maintenanceSelectedFiles = 0;
    let expiredSessionsSelected = 0;
    try {
      const maintenance = await new ReliabilityMaintenance(
        persistence,
        new InMemoryStorageAdapter(),
        () => options.now ?? new Date(),
      ).run();
      if (maintenance.mode !== "dry_run" || maintenance.expiredSessions.pruned !== 0) {
        throw new Error("restore drill maintenance was not read-only");
      }
      maintenanceSelectedFiles = maintenance.files.length;
      expiredSessionsSelected = maintenance.expiredSessions.selected;
    } finally {
      persistence.close();
    }

    const restoredAfter = await verifyDatabaseBackup(restoredPath, options.migrationsDirectory);
    const sourceAfter = await verifyDatabaseBackup(sourcePath, options.migrationsDirectory);
    assertSameSummary(restoredBefore, restoredAfter, "restored copy changed during drill");
    assertSameSummary(sourceBefore, sourceAfter, "source backup changed during drill");

    result = {
      status: "ok",
      sourceBackupBasename: basename(sourcePath),
      sourceSha256: sourceBefore.sha256,
      bytes: sourceBefore.bytes,
      databaseSchemaVersion: sourceBefore.schemaVersion,
      health,
      readiness,
      maintenanceMode: "dry_run",
      maintenanceSelectedFiles,
      expiredSessionsSelected,
      sourceUnchanged: true,
      restoredCopyUnchanged: true,
      networkListenerOpened: false,
      storageProvider: "memory",
    };
  } catch (error: unknown) {
    primaryError = error;
  } finally {
    try {
      assertOwnedStage(stage);
      (options.removeStageForDrill ?? removeOwnedStage)(stage);
      if (existsSync(stage)) throw new Error("restore drill stage cleanup failed");
    } catch (error: unknown) {
      cleanupError = error;
    }
  }

  if (primaryError !== null && cleanupError !== null) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "restore drill failed and task-owned stage cleanup also failed",
    );
  }
  if (primaryError !== null) throw primaryError;
  if (cleanupError !== null) throw cleanupError;
  if (result === null) throw new Error("restore drill did not produce a result");
  return { ...result, cleanupCompleted: true };
}

function removeOwnedStage(path: string): void {
  assertOwnedStage(path);
  rmSync(path, { recursive: true, force: false });
}

function assertSameSummary(
  expected: DatabaseBackupSummary,
  actual: DatabaseBackupSummary,
  label: string,
): void {
  if (
    expected.bytes !== actual.bytes
    || expected.sha256 !== actual.sha256
    || expected.schemaVersion !== actual.schemaVersion
    || JSON.stringify(expected.counts) !== JSON.stringify(actual.counts)
  ) {
    throw new Error(label);
  }
}

function assertOwnedStage(path: string): void {
  const resolved = realpathSync(path);
  const parent = realpathSync(dirname(resolved));
  const expectedParent = realpathSync(tmpdir());
  if (
    !samePath(parent, expectedParent)
    || !/^academiccloud-restore-drill-[A-Za-z0-9_-]{6,}$/.test(basename(resolved))
    || !lstatSync(resolved).isDirectory()
    || lstatSync(resolved).isSymbolicLink()
  ) {
    throw new Error("restore drill stage ownership check failed");
  }
}

function requireRegularNonSymlink(path: string, label: string): string {
  const resolved = resolveRequiredPath(path, label);
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  return realpathSync(resolved);
}

function resolveRequiredPath(path: string, label: string): string {
  if (!path.trim() || path.includes("\0")) throw new Error(`${label} path is invalid`);
  return resolve(path);
}

function realPathIfPresent(path: string): string {
  return existsSync(path) ? realpathSync(path) : resolve(path);
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}
