import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

import {
  type DatabaseBackupSummary,
  createDatabaseBackup,
  verifyDatabaseBackup,
} from "./database-backup.js";

export type OperationsStatus = "healthy" | "warning" | "critical" | "unknown";

export interface BackupReceipt {
  schemaVersion: 1;
  backupCreatedAt: string;
  receiptCreatedAt: string;
  backupBasename: string;
  bytes: number;
  sha256: string;
  databaseSchemaVersion: number;
  counts: DatabaseBackupSummary["counts"];
  sourceCommit: string | null;
  offHostStatus: "unknown";
}

export interface BackupFreshness {
  status: OperationsStatus;
  ageMilliseconds: number | null;
  warningAfterHours: 24;
  criticalAfterHours: 48;
  futureSkewMinutes: 5;
}

export interface VerifiedBackupReceipt {
  receipt: BackupReceipt;
  summary: DatabaseBackupSummary;
  freshness: BackupFreshness;
}

const RECEIPT_KEYS = [
  "backupBasename",
  "backupCreatedAt",
  "bytes",
  "counts",
  "databaseSchemaVersion",
  "offHostStatus",
  "receiptCreatedAt",
  "schemaVersion",
  "sha256",
  "sourceCommit",
] as const;

const COUNT_KEYS = [
  "accounts",
  "announcements",
  "files",
  "folders",
  "invitations",
  "sessions",
] as const;

export async function createVerifiedBackupGeneration(
  databasePath: string,
  migrationsDirectory: string,
  backupPath: string,
  receiptPath: string,
  options: { now?: () => Date; sourceCommit?: string | null } = {},
): Promise<{ summary: DatabaseBackupSummary; receipt: BackupReceipt }> {
  const resolvedBackup = resolveOutputFile(backupPath, "backup output");
  const resolvedReceipt = resolveOutputFile(receiptPath, "backup receipt");

  if (samePath(resolvedBackup, resolvedReceipt)) {
    throw new Error("backup receipt must differ from the backup database");
  }
  if (existsSync(resolvedBackup)) {
    throw new Error("backup output already exists");
  }
  if (!existsSync(dirname(resolvedBackup))) {
    throw new Error("backup output directory does not exist");
  }
  if (!existsSync(dirname(resolvedReceipt))) {
    throw new Error("backup receipt directory does not exist");
  }
  if (existsSync(resolvedReceipt)) {
    throw new Error("backup receipt already exists");
  }

  const sourceCommit = options.sourceCommit ?? null;
  if (sourceCommit !== null && !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error("source commit must be a full lowercase Git SHA");
  }

  const clock = options.now ?? (() => new Date());
  const backupCreatedAt = exactTimestamp(clock(), "backup generation");
  // The only receipt-creation path also creates the no-clobber backup. This
  // binds freshness to the generation boundary instead of letting an old
  // arbitrary snapshot acquire a new timestamp through later verification.
  const summary = await createDatabaseBackup(
    databasePath,
    migrationsDirectory,
    resolvedBackup,
  );
  const receiptCreatedAt = exactTimestamp(clock(), "backup receipt");
  if (receiptCreatedAt < backupCreatedAt) {
    throw new Error("backup receipt time precedes backup generation time");
  }
  const receipt: BackupReceipt = {
    schemaVersion: 1,
    backupCreatedAt,
    receiptCreatedAt,
    backupBasename: basename(resolvedBackup),
    bytes: summary.bytes,
    sha256: summary.sha256,
    databaseSchemaVersion: summary.schemaVersion,
    counts: { ...summary.counts },
    sourceCommit,
    // A local verified backup and a public age recipient do not prove that an
    // encrypted generation reached the independent off-host destination.
    offHostStatus: "unknown",
  };

  const temporaryPath = `${resolvedReceipt}.partial-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    chmodSync(temporaryPath, 0o600);
    linkSync(temporaryPath, resolvedReceipt);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
  }

  return { summary, receipt };
}

export async function verifyBackupReceipt(
  backupPath: string,
  migrationsDirectory: string,
  receiptPath: string,
  now: Date = new Date(),
): Promise<VerifiedBackupReceipt> {
  const resolvedBackup = requireRegularNonSymlink(backupPath, "backup");
  const resolvedReceipt = requireRegularNonSymlink(receiptPath, "backup receipt");
  const receipt = parseBackupReceipt(readFileSync(resolvedReceipt, "utf8"));

  if (receipt.backupBasename !== basename(resolvedBackup)) {
    throw new Error("backup receipt basename does not match the backup");
  }

  const summary = await verifyDatabaseBackup(resolvedBackup, migrationsDirectory);
  if (
    receipt.bytes !== summary.bytes
    || receipt.sha256 !== summary.sha256
    || receipt.databaseSchemaVersion !== summary.schemaVersion
    || !countsEqual(receipt.counts, summary.counts)
  ) {
    throw new Error("backup receipt identity does not match the verified backup");
  }

  return {
    receipt,
    summary,
    freshness: evaluateBackupFreshness(receipt.backupCreatedAt, now),
  };
}

export function evaluateBackupFreshness(backupCreatedAt: string, now: Date): BackupFreshness {
  const created = new Date(backupCreatedAt);
  if (!Number.isFinite(created.getTime()) || created.toISOString() !== backupCreatedAt) {
    return {
      status: "critical",
      ageMilliseconds: null,
      warningAfterHours: 24,
      criticalAfterHours: 48,
      futureSkewMinutes: 5,
    };
  }

  const ageMilliseconds = now.getTime() - created.getTime();
  const futureSkew = 5 * 60 * 1_000;
  const warningAfter = 24 * 60 * 60 * 1_000;
  const criticalAfter = 48 * 60 * 60 * 1_000;
  const status: OperationsStatus = ageMilliseconds < -futureSkew
    ? "critical"
    : ageMilliseconds <= warningAfter
      ? "healthy"
      : ageMilliseconds <= criticalAfter
        ? "warning"
        : "critical";

  return {
    status,
    ageMilliseconds,
    warningAfterHours: 24,
    criticalAfterHours: 48,
    futureSkewMinutes: 5,
  };
}

export function parseBackupReceipt(text: string): BackupReceipt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("backup receipt is not valid JSON");
  }

  if (!isRecord(parsed) || !hasExactKeys(parsed, RECEIPT_KEYS)) {
    throw new Error("backup receipt shape is invalid");
  }
  const parsedCounts = parsed.counts;
  if (
    parsed.schemaVersion !== 1
    || typeof parsed.backupCreatedAt !== "string"
    || typeof parsed.receiptCreatedAt !== "string"
    || typeof parsed.backupBasename !== "string"
    || !isSafeNonNegativeInteger(parsed.bytes)
    || typeof parsed.sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(parsed.sha256)
    || !isSafeNonNegativeInteger(parsed.databaseSchemaVersion)
    || (parsed.sourceCommit !== null
      && (typeof parsed.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(parsed.sourceCommit)))
    || parsed.offHostStatus !== "unknown"
    || !isRecord(parsedCounts)
  ) {
    throw new Error("backup receipt values are invalid");
  }
  if (
    !hasExactKeys(parsedCounts, COUNT_KEYS)
    || !COUNT_KEYS.every((key) => isSafeNonNegativeInteger(parsedCounts[key]))
  ) {
    throw new Error("backup receipt counts are invalid");
  }

  const created = new Date(parsed.backupCreatedAt);
  const receiptCreated = new Date(parsed.receiptCreatedAt);
  if (
    !Number.isFinite(created.getTime())
    || created.toISOString() !== parsed.backupCreatedAt
    || !Number.isFinite(receiptCreated.getTime())
    || receiptCreated.toISOString() !== parsed.receiptCreatedAt
    || receiptCreated.getTime() < created.getTime()
  ) {
    throw new Error("backup receipt timestamps are invalid");
  }
  if (
    !parsed.backupBasename
    || parsed.backupBasename !== basename(parsed.backupBasename)
    || parsed.backupBasename.includes("\0")
  ) {
    throw new Error("backup receipt basename is invalid");
  }

  return parsed as unknown as BackupReceipt;
}

function countsEqual(
  left: DatabaseBackupSummary["counts"],
  right: DatabaseBackupSummary["counts"],
): boolean {
  return COUNT_KEYS.every((key) => left[key] === right[key]);
}

function requireRegularNonSymlink(path: string, label: string): string {
  if (!path.trim() || path.includes("\0")) throw new Error(`${label} path is invalid`);
  const resolved = resolve(path);
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  return resolved;
}

function resolveOutputFile(path: string, label: string): string {
  if (!path.trim() || path.includes("\0")) throw new Error(`${label} path is invalid`);
  return resolve(path);
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort()[index]);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function exactTimestamp(value: Date, label: string): string {
  if (!Number.isFinite(value.getTime())) throw new Error(`${label} time is invalid`);
  return value.toISOString();
}
