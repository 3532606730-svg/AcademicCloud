import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { createTestPersistence, INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-v${version}-`));
  const pinned = readdirSync(INITIAL_MIGRATIONS_DIRECTORY).filter((name) => {
    const migrationVersion = Number(name.slice(0, 3));
    return Number.isSafeInteger(migrationVersion) && migrationVersion <= version;
  });
  for (const name of pinned) {
    copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("fresh database migrates 0 -> 26 with favorites, announcement, audit, ownership, scholarly identity, Library, metadata, suggestions, durable compute jobs, provenance, credential reset, resumable-transfer, bibliographic tables, and Local Pull leases with clean integrity", (context) => {
  const { database } = createTestPersistence(context);
  const version = database
    .prepare<[], { version: number }>("SELECT MAX(version) AS version FROM schema_migrations")
    .get()?.version;
  assert.equal(version, 26);

  const tables = database
    .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'favorite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
  assert.deepEqual(tables, ["favorite_files", "favorite_folders"]);

  assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()?.integrity_check, "ok");
  assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("upgrade 4 -> 5 applies only migration 005 with valid checksums", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-fav-mig-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "db.sqlite");
  const database = openSqliteDatabase(databasePath);
  try {
    runMigrations(database, pinnedDirectory(context, 4));
    const result = runMigrations(database, pinnedDirectory(context, 5));
    assert.deepEqual(result.appliedVersions, [5]);
    assert.equal(result.currentVersion, 5);

    const tables = database
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'favorite_%' ORDER BY name")
      .all()
      .map((row) => row.name);
    assert.deepEqual(tables, ["favorite_files", "favorite_folders"]);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()?.integrity_check, "ok");
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    database.close();
  }
});

test("favorite foreign keys reject orphan relations", (context) => {
  const { database, persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({
    id: "user-a",
    loginName: "user-a",
    passwordHash: "test",
    role: "owner",
    state: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.throws(() => {
    database.prepare(`
      INSERT INTO favorite_files (account_id, file_id, created_at)
      VALUES ('user-a', 'missing-file', '2026-08-12T08:00:00.000Z')
    `).run();
  }, /FOREIGN KEY constraint failed/);

  assert.throws(() => {
    database.prepare(`
      INSERT INTO favorite_folders (account_id, folder_id, created_at)
      VALUES ('missing-account', 'missing-folder', '2026-08-12T08:00:00.000Z')
    `).run();
  }, /FOREIGN KEY constraint failed/);
});
