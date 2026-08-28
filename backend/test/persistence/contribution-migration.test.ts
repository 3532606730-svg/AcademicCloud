import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test, type TestContext } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { createTestPersistence, INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-contribution-migration-${version}-`));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(name.slice(0, 3)) <= version) copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("migration 015 persists contribution states, promotion intents, and audit vocabulary", (context) => {
  const { database } = createTestPersistence(context);
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('library_contributions', 'library_ownership_promotions')").get()?.count, 2);
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_target_types WHERE target_type = 'contribution'").get()?.count, 1);
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_event_kinds WHERE kind LIKE 'libraries.contribution_%'").get()?.count, 4);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
});
test("migration 015 applies append-only from schema 014", (context) => {
  const directory = pinnedDirectory(context, 14);
  const database = openSqliteDatabase(join(directory, "from-014.sqlite"));
  try {
    runMigrations(database, directory);
  assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], currentVersion: 30 });
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});
