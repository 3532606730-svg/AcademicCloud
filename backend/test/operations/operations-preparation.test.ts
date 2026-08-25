import assert from "node:assert/strict";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createVerifiedBackupGeneration,
  evaluateBackupFreshness,
  parseBackupReceipt,
  verifyBackupReceipt,
} from "../../src/operations/backup-receipt.js";
import {
  type BackupRetentionCandidate,
  planBackupRetention,
} from "../../src/operations/backup-retention.js";
import { createDatabaseBackup } from "../../src/operations/database-backup.js";
import { runIsolatedRestoreDrill } from "../../src/operations/isolated-restore-drill.js";
import { parseArguments } from "../../src/operations/recovery-main.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "../persistence/helpers.js";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const SOURCE_COMMIT = "a".repeat(40);

async function createFixture(directory: string) {
  const sourcePath = join(directory, "source.sqlite");
  const backupPath = join(directory, "backup.sqlite");
  const receiptPath = join(directory, "backup.receipt.json");
  const database = openSqliteDatabase(sourcePath);
  runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
  database.close();
  const generated = await createVerifiedBackupGeneration(
    sourcePath,
    INITIAL_MIGRATIONS_DIRECTORY,
    backupPath,
    receiptPath,
    { now: () => NOW, sourceCommit: SOURCE_COMMIT },
  );
  return { sourcePath, backupPath, receiptPath, receipt: generated.receipt };
}

test("verified backup receipt is safe, exact, fresh, and no-clobber", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-ops-receipt-"));
  try {
    const fixture = await createFixture(directory);
    const text = readFileSync(fixture.receiptPath, "utf8");
    assert.equal(text.includes(directory), false);
    assert.equal(text.includes("source.sqlite"), false);
    assert.equal(fixture.receipt.backupBasename, "backup.sqlite");
    assert.equal(fixture.receipt.backupCreatedAt, NOW.toISOString());
    assert.equal(fixture.receipt.receiptCreatedAt, NOW.toISOString());
    assert.equal(fixture.receipt.offHostStatus, "unknown");
    assert.equal(fixture.receipt.databaseSchemaVersion, 26);
    assert.equal(fixture.receipt.sourceCommit, SOURCE_COMMIT);

    const verified = await verifyBackupReceipt(
      fixture.backupPath,
      INITIAL_MIGRATIONS_DIRECTORY,
      fixture.receiptPath,
      new Date("2026-08-18T12:00:00.000Z"),
    );
    assert.equal(verified.freshness.status, "healthy");
    assert.equal(verified.summary.sha256, fixture.receipt.sha256);

    const receiptBefore = readFileSync(fixture.receiptPath);
    await assert.rejects(
      createVerifiedBackupGeneration(
        fixture.sourcePath,
        INITIAL_MIGRATIONS_DIRECTORY,
        fixture.backupPath,
        fixture.receiptPath,
      ),
      /backup output already exists/,
    );
    assert.deepEqual(readFileSync(fixture.receiptPath), receiptBefore);
    assert.equal(readdirSync(directory).some((name) => name.includes(".partial-")), false);
    assert.equal(readdirSync(directory).some((name) => name.includes(".verify-")), false);
    assert.equal(existsSync(`${fixture.backupPath}-wal`), false);
    assert.equal(existsSync(`${fixture.backupPath}-shm`), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("receipt verification rejects tamper, malformed shape, and identity mismatch", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-ops-receipt-tamper-"));
  try {
    const fixture = await createFixture(directory);
    const secondBackup = join(directory, "other.sqlite");
    copyFileSync(fixture.backupPath, secondBackup);
    await assert.rejects(
      verifyBackupReceipt(
        secondBackup,
        INITIAL_MIGRATIONS_DIRECTORY,
        fixture.receiptPath,
        NOW,
      ),
      /basename does not match/,
    );

    appendFileSync(fixture.backupPath, "tamper");
    await assert.rejects(
      verifyBackupReceipt(
        fixture.backupPath,
        INITIAL_MIGRATIONS_DIRECTORY,
        fixture.receiptPath,
        NOW,
      ),
      /identity does not match/,
    );

    const unsafeShape = JSON.parse(readFileSync(fixture.receiptPath, "utf8"));
    unsafeShape.sourcePath = "C:\\sensitive\\source.sqlite";
    assert.throws(() => parseBackupReceipt(JSON.stringify(unsafeShape)), /shape is invalid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backup freshness has exact 24h, 48h, and future-skew boundaries", () => {
  const createdAt = NOW.toISOString();
  assert.equal(evaluateBackupFreshness(createdAt, new Date(NOW.getTime() + 24 * 3_600_000)).status, "healthy");
  assert.equal(evaluateBackupFreshness(createdAt, new Date(NOW.getTime() + 24 * 3_600_000 + 1)).status, "warning");
  assert.equal(evaluateBackupFreshness(createdAt, new Date(NOW.getTime() + 48 * 3_600_000)).status, "warning");
  assert.equal(evaluateBackupFreshness(createdAt, new Date(NOW.getTime() + 48 * 3_600_000 + 1)).status, "critical");
  assert.equal(evaluateBackupFreshness(createdAt, new Date(NOW.getTime() - 5 * 60_000)).status, "healthy");
  assert.equal(evaluateBackupFreshness(createdAt, new Date(NOW.getTime() - 5 * 60_000 - 1)).status, "critical");
  assert.equal(evaluateBackupFreshness("invalid", NOW).status, "critical");
});

test("an existing legacy snapshot cannot acquire a newly dated freshness receipt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-ops-legacy-receipt-"));
  try {
    const sourcePath = join(directory, "source.sqlite");
    const legacyBackupPath = join(directory, "legacy.sqlite");
    const newReceiptPath = join(directory, "legacy.receipt.json");
    const database = openSqliteDatabase(sourcePath);
    runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
    database.close();
    await createDatabaseBackup(sourcePath, INITIAL_MIGRATIONS_DIRECTORY, legacyBackupPath);

    await assert.rejects(
      createVerifiedBackupGeneration(
        sourcePath,
        INITIAL_MIGRATIONS_DIRECTORY,
        legacyBackupPath,
        newReceiptPath,
        { now: () => NOW },
      ),
      /backup output already exists/,
    );
    assert.equal(existsSync(newReceiptPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("recovery CLI has no apply, delete, cleanup-target, network, or credential option", () => {
  assert.throws(() => parseArguments(["retention-plan", "--input=plan.json", "--apply=true"]), /unexpected/);
  assert.throws(() => parseArguments(["restore-drill", "--backup=a", "--receipt=b", "--cleanup-target=e"]), /unexpected/);
  assert.throws(() => parseArguments(["restore-drill", "--backup=a", "--receipt=b", "--url=https:\/\/example.test"]), /unexpected/);
  assert.throws(() => parseArguments(["backup-create", "--backup=b", "--receipt=c", "--password=secret"]), /unexpected/);
  assert.throws(() => parseArguments(["backup-create", "--database=a", "--backup=b", "--receipt=c"]), /unexpected/);
  assert.throws(() => parseArguments(["receipt-verify", "--backup=a", "--receipt=b", "--now=2026-08-17T00:00:00.000Z"]), /unexpected/);
  assert.throws(() => parseArguments(["restore-drill", "--backup=a", "--receipt=b", "--now=2026-08-17T00:00:00.000Z"]), /unexpected/);
  assert.throws(() => parseArguments(["receipt-create", "--backup=a", "--receipt=b"]), /invalid/);
  assert.deepEqual(parseArguments(["retention-plan", "--input=plan.json"]), {
    operation: "retention-plan",
    input: "plan.json",
  });
});

function candidate(
  name: string,
  createdAt: string,
  options: Partial<BackupRetentionCandidate> = {},
): BackupRetentionCandidate {
  return {
    name,
    createdAt,
    sha256: "b".repeat(64),
    verified: true,
    ...options,
  };
}

test("retention planner unions 7 daily, 4 ISO-week, and 6 monthly buckets deterministically", () => {
  const backups: BackupRetentionCandidate[] = [];
  for (let daysAgo = 0; daysAgo < 12; daysAgo += 1) {
    backups.push(candidate(
      `daily-${String(daysAgo).padStart(2, "0")}.sqlite`,
      new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    ));
  }
  backups.push(candidate("month-1.sqlite", "2026-07-15T12:00:00.000Z"));
  backups.push(candidate("month-2.sqlite", "2026-06-15T12:00:00.000Z"));
  backups.push(candidate("month-3.sqlite", "2026-05-15T12:00:00.000Z"));
  backups.push(candidate("month-4.sqlite", "2026-04-15T12:00:00.000Z"));
  backups.push(candidate("month-5.sqlite", "2026-03-15T12:00:00.000Z"));
  backups.push(candidate("old-last-good.sqlite", "2025-01-01T00:00:00.000Z", { lastKnownGood: true }));
  backups.push(candidate("old-eligible.sqlite", "2024-01-01T00:00:00.000Z"));

  const forward = planBackupRetention(backups, NOW);
  const reverse = planBackupRetention([...backups].reverse(), NOW);
  assert.equal(forward.dryRun, true);
  assert.deepEqual(forward, reverse);
  assert.equal(forward.decisions.find((item) => item.name === "daily-00.sqlite")?.action, "keep");
  assert.equal(forward.decisions.find((item) => item.name === "old-last-good.sqlite")?.action, "keep");
  assert.equal(forward.decisions.find((item) => item.name === "old-eligible.sqlite")?.action, "eligible");
  assert.ok(forward.decisions.filter((item) => item.reasons.some((reason) => reason.startsWith("daily-bucket-"))).length >= 7);
  assert.ok(forward.decisions.some((item) => item.reasons.some((reason) => reason.startsWith("weekly-bucket-"))));
  assert.ok(forward.decisions.filter((item) => item.reasons.some((reason) => reason.startsWith("monthly-bucket-"))).length >= 6);
});

test("retention planner holds duplicate, unverified, invalid, and future records without touching files", () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-retention-no-write-"));
  const sentinel = join(directory, "sentinel.sqlite");
  writeFileSync(sentinel, "unchanged");
  const before = readFileSync(sentinel);
  try {
    const records = [
      candidate("duplicate.sqlite", "2026-08-17T10:00:00.000Z"),
      candidate("duplicate.sqlite", "2026-08-16T10:00:00.000Z"),
      candidate("unverified.sqlite", "2026-08-15T10:00:00.000Z", { verified: false }),
      candidate("../unsafe.sqlite", "2026-08-14T10:00:00.000Z"),
      candidate("future.sqlite", "2026-08-17T12:05:00.001Z"),
      candidate("invalid-time.sqlite", "not-a-time"),
      candidate("invalid-sha.sqlite", "2026-08-13T10:00:00.000Z", { sha256: "bad" }),
    ];
    const plan = planBackupRetention(records, NOW);
    assert.deepEqual(plan, planBackupRetention([...records].reverse(), NOW));
    assert.equal(plan.decisions.every((item) => item.action === "hold"), true);
    assert.deepEqual(readFileSync(sentinel), before);
    assert.equal(existsSync(sentinel), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("retention output canonicalizes omitted and explicit-false last-known-good ties", () => {
  const omitted = candidate("same.sqlite", "2026-08-17T10:00:00.000Z");
  const explicitFalse = candidate("same.sqlite", "2026-08-17T10:00:00.000Z", {
    lastKnownGood: false,
  });
  const forward = planBackupRetention([omitted, explicitFalse], NOW);
  const reverse = planBackupRetention([explicitFalse, omitted], NOW);
  assert.deepEqual(forward, reverse);
  assert.equal(forward.decisions.every((item) => item.lastKnownGood === false), true);
});

test("isolated restore drill uses only a verified copy, memory storage, and cleans its stage", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-restore-fixture-"));
  const stageBefore = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("academiccloud-restore-drill-")));
  try {
    const fixture = await createFixture(directory);
    const sourceBefore = readFileSync(fixture.backupPath);
    const result = await runIsolatedRestoreDrill({
      backupPath: fixture.backupPath,
      receiptPath: fixture.receiptPath,
      migrationsDirectory: INITIAL_MIGRATIONS_DIRECTORY,
      liveDatabasePath: join(directory, "live-production.sqlite"),
      now: NOW,
    });
    assert.equal(result.status, "ok");
    assert.equal(result.health, "ok");
    assert.equal(result.readiness, "ready");
    assert.equal(result.maintenanceMode, "dry_run");
    assert.equal(result.storageProvider, "memory");
    assert.equal(result.networkListenerOpened, false);
    assert.equal(result.sourceUnchanged, true);
    assert.equal(result.restoredCopyUnchanged, true);
    assert.equal(result.cleanupCompleted, true);
    assert.deepEqual(readFileSync(fixture.backupPath), sourceBefore);
    const stageAfter = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("academiccloud-restore-drill-")));
    assert.deepEqual(stageAfter, stageBefore);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restore drill rejects live source and cleans a task-owned stage on injected failure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-restore-guards-"));
  try {
    const fixture = await createFixture(directory);
    await assert.rejects(
      runIsolatedRestoreDrill({
        backupPath: fixture.backupPath,
        receiptPath: fixture.receiptPath,
        migrationsDirectory: INITIAL_MIGRATIONS_DIRECTORY,
        liveDatabasePath: fixture.backupPath,
        now: NOW,
      }),
      /must not be the configured live database/,
    );

    const stageBefore = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("academiccloud-restore-drill-")));
    const sourceBefore = readFileSync(fixture.backupPath);
    await assert.rejects(
      runIsolatedRestoreDrill({
        backupPath: fixture.backupPath,
        receiptPath: fixture.receiptPath,
        migrationsDirectory: INITIAL_MIGRATIONS_DIRECTORY,
        liveDatabasePath: join(directory, "live.sqlite"),
        now: NOW,
        createApplicationForDrill: async () => {
          throw new Error("injected compiled application failure");
        },
      }),
      /injected compiled application failure/,
    );
    const stageAfter = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("academiccloud-restore-drill-")));
    assert.deepEqual(stageAfter, stageBefore);
    assert.deepEqual(readFileSync(fixture.backupPath), sourceBefore);

    let removedStage: string | null = null;
    await assert.rejects(
      runIsolatedRestoreDrill({
        backupPath: fixture.backupPath,
        receiptPath: fixture.receiptPath,
        migrationsDirectory: INITIAL_MIGRATIONS_DIRECTORY,
        liveDatabasePath: join(directory, "live.sqlite"),
        now: NOW,
        createApplicationForDrill: async () => {
          throw new Error("injected primary failure");
        },
        removeStageForDrill: (stage) => {
          removedStage = stage;
          rmSync(stage, { recursive: true, force: false });
          throw new Error("injected cleanup audit failure");
        },
      }),
      (error: unknown) => error instanceof AggregateError
        && error.errors.some((item) => String(item).includes("injected primary failure"))
        && error.errors.some((item) => String(item).includes("injected cleanup audit failure")),
    );
    assert.notEqual(removedStage, null);
    assert.equal(existsSync(removedStage!), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
