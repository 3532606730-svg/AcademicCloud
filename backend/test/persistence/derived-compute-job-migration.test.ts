import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { SqliteDerivedJobRepository } from "../../src/persistence/sqlite/derived-job-repository.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = new Date("2026-08-21T00:00:00.000Z");

test("migration 022 through 026 preserves durable jobs and Local Pull leases across restart", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "academiccloud-compute-migration-"));
  const v21Directory = join(temporaryDirectory, "v21");
  const databasePath = join(temporaryDirectory, "compute.sqlite");
  mkdirSync(v21Directory);
  for (const filename of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    const version = Number(filename.slice(0, 3));
    if (Number.isSafeInteger(version) && version <= 21) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename), join(v21Directory, filename));
    }
  }
  let database = openSqliteDatabase(databasePath);
  try {
    assert.equal(runMigrations(database, v21Directory).currentVersion, 21);
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, auth_revision, state, created_at, updated_at)
      VALUES ('compute-owner', 'compute-owner', 'hash', 'owner', 0, 'active', ?, ?)
    `).run(NOW.toISOString(), NOW.toISOString());
    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32], currentVersion: 32 });
    const repository = new SqliteDerivedJobRepository(database);
    const created = repository.create({
      id: "job-restart",
      kind: "metadata_suggestion",
      scopeId: "canonical-library",
      resourceId: "file-1",
      inputVersion: "input-version",
      idempotencyKey: "a".repeat(64),
      attemptId: "attempt-1",
      createdByAccountId: "compute-owner",
      createdAt: NOW,
      deadlineAt: new Date(NOW.getTime() + 15 * 60_000),
    });
    assert.equal(created.state, "queued");
    assert.equal(repository.recordDispatch(created.id, "attempt-1", "github_actions", "provider-1", NOW)?.provider, "github_actions");
    database.close();

    database = openSqliteDatabase(databasePath);
    const reopened = new SqliteDerivedJobRepository(database).findById(created.id)!;
    assert.equal(reopened.state, "queued");
    assert.equal(reopened.activeAttemptId, "attempt-1");
    assert.equal(reopened.providerJobId, "provider-1");
    assert.equal(reopened.capabilityTokenHash, null);
    assert.equal(reopened.computeWorkerId, null);
    assert.equal(reopened.leaseExpiresAt, null);
    assert.equal(reopened.lastHeartbeatAt, null);
    assert.equal(reopened.queuePriority, 10);
    assert.equal(reopened.origin, "interactive");
    const repositoryAfterRestart = new SqliteDerivedJobRepository(database);
    assert.ok(repositoryAfterRestart.fail(created.id, "attempt-1", "compute_internal_error", NOW));
    const current = repositoryAfterRestart.create({
      id: "job-current",
      kind: "metadata_suggestion",
      scopeId: "canonical-library",
      resourceId: "file-1",
      inputVersion: "input-version-new",
      idempotencyKey: "b".repeat(64),
      attemptId: "attempt-current",
      createdByAccountId: "compute-owner",
      createdAt: new Date(NOW.getTime() + 1_000),
      deadlineAt: new Date(NOW.getTime() + 15 * 60_000),
      origin: "admission",
      queuePriority: 10,
    });
    assert.equal(repositoryAfterRestart.findLatest("metadata_suggestion", "canonical-library", "file-1")?.id, current.id);
    const local = repositoryAfterRestart.create({
      id: "job-local",
      kind: "metadata_suggestion",
      scopeId: "canonical-library",
      resourceId: "file-local",
      inputVersion: "input-version-local",
      idempotencyKey: "c".repeat(64),
      attemptId: "attempt-local-1",
      createdByAccountId: "compute-owner",
      createdAt: NOW,
      deadlineAt: new Date(NOW.getTime() + 15 * 60_000),
    });
    assert.ok(repositoryAfterRestart.recordDispatch(local.id, "attempt-local-1", "local_pull", "local-pull:attempt-local-1", NOW));
    assert.equal(repositoryAfterRestart.listLocalPullCandidates(10)[0]?.id, local.id);
    const claimed = repositoryAfterRestart.claimLocal(
      local.id,
      "attempt-local-1",
      "worker.local-1",
      "d".repeat(64),
      new Date(NOW.getTime() + 10 * 60_000),
      new Date(NOW.getTime() + 90_000),
      NOW,
    )!;
    assert.equal(claimed.state, "running");
    assert.equal(claimed.computeWorkerId, "worker.local-1");
    assert.equal(claimed.lastHeartbeatAt?.toISOString(), NOW.toISOString());
    const heartbeatAt = new Date(NOW.getTime() + 30_000);
    const heartbeat = repositoryAfterRestart.heartbeatLocal(
      local.id,
      "attempt-local-1",
      "worker.local-1",
      new Date(heartbeatAt.getTime() + 10 * 60_000),
      new Date(heartbeatAt.getTime() + 90_000),
      heartbeatAt,
    )!;
    assert.equal(heartbeat.leaseExpiresAt?.toISOString(), new Date(heartbeatAt.getTime() + 90_000).toISOString());
    assert.deepEqual(repositoryAfterRestart.listExpiredLocalPullLeases(new Date(NOW.getTime() + 100_000), 10), []);
    const recoveryAt = new Date(NOW.getTime() + 121_000);
    const recovered = repositoryAfterRestart.recoverExpiredLocalLease(
      local.id,
      "attempt-local-1",
      "attempt-local-2",
      recoveryAt,
    )!;
    assert.equal(recovered.state, "queued");
    assert.equal(recovered.attempts, 2);
    assert.equal(recovered.activeAttemptId, "attempt-local-2");
    assert.equal(recovered.provider, null);
    assert.equal(recovered.computeWorkerId, null);
    assert.equal(repositoryAfterRestart.heartbeatLocal(
      local.id,
      "attempt-local-1",
      "worker.local-1",
      new Date(recoveryAt.getTime() + 10 * 60_000),
      new Date(recoveryAt.getTime() + 90_000),
      recoveryAt,
    ), null);
    assert.equal(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY).currentVersion, 32);
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
