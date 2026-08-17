import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { createTestPersistence, INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = "2026-08-18T12:00:00.000Z";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-library-migration-${version}-`));
  const entries = readdirSync(INITIAL_MIGRATIONS_DIRECTORY);
  for (const name of entries) {
    if (Number(name.slice(0, 3)) <= version) copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("migration 014 persists Library domains, membership constraints, and append-only audit vocabulary", (context) => {
  const { database } = createTestPersistence(context);
  assert.deepEqual(database.prepare("SELECT version FROM schema_migrations ORDER BY version").all(), [
    { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 },
    { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }, { version: 12 }, { version: 13 }, { version: 14 },
  ]);
  assert.deepEqual(database.prepare("SELECT target_type FROM governance_audit_target_types WHERE target_type = 'library'").all(), [{ target_type: "library" }]);
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('libraries', 'library_memberships')").get()?.count, 2);
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%library%'").get()?.count, 5);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
});

test("migration 014 can be applied append-only from schema 013", (context) => {
  const directory = pinnedDirectory(context, 13);
  const database = openSqliteDatabase(join(directory, "from-013.sqlite"));
  try {
    runMigrations(database, directory);
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES ('owner-a', 'owner-a', 'hash', 'owner', 'active', ?, ?)
    `).run(NOW, NOW);
    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [14], currentVersion: 14 });
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});
