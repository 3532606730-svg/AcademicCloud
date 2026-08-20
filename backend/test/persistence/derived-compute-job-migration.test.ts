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

test("migration 022 upgrades v21 append-only and durable job state survives a database restart", () => {
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
    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [22], currentVersion: 22 });
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
    assert.equal(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY).currentVersion, 22);
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
