import assert from "node:assert/strict";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { openSqliteDatabase, openSqliteDatabaseReadOnly } from "../../src/persistence/sqlite/database.js";
import { assertMigrationsCurrent, runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { createTestPersistence, INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

test("migrations apply once and retain their recorded version", (context) => {
  const { database } = createTestPersistence(context);

  const secondRun = runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
  const versions = database
    .prepare<[], { version: number }>("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((row) => row.version);

  assert.deepEqual(secondRun, { appliedVersions: [], currentVersion: 21 });
  assert.deepEqual(versions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
});

test("migrations reject changes to an already applied file", (context) => {
  const { database, temporaryDirectory } = createTestPersistence(context);
  const alteredDirectory = join(temporaryDirectory, "altered-migrations");
  mkdirSync(alteredDirectory);

  const migrationName = "001_initial_schema.sql";
  const source = join(INITIAL_MIGRATIONS_DIRECTORY, migrationName);
  const destination = join(alteredDirectory, migrationName);
  writeFileSync(destination, readFileSync(source));
  appendFileSync(destination, "\n-- altered after application\n");

  assert.throws(
    () => runMigrations(database, alteredDirectory),
    /does not match its recorded checksum/,
  );
});

test("a failed migration rolls back its schema and version record", (context) => {
  const { temporaryDirectory } = createTestPersistence(context);
  const isolatedDirectory = join(temporaryDirectory, "atomic-migrations");
  mkdirSync(isolatedDirectory);
  writeFileSync(join(isolatedDirectory, "001_good.sql"), "CREATE TABLE stable (id INTEGER PRIMARY KEY) STRICT;\n");
  writeFileSync(
    join(isolatedDirectory, "002_bad.sql"),
    "CREATE TABLE should_rollback (id INTEGER PRIMARY KEY) STRICT;\nTHIS IS NOT SQL;\n",
  );

  const database = openSqliteDatabase(join(temporaryDirectory, "atomic.sqlite"));

  try {
    assert.throws(() => runMigrations(database, isolatedDirectory));

    const versions = database
      .prepare<[], { version: number }>("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => row.version);
    const rolledBackTable = database
      .prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("should_rollback");

    assert.deepEqual(versions, [1]);
    assert.equal(rolledBackTable, undefined);
  } finally {
    database.close();
  }
});

test("current schema passes SQLite integrity checks and includes lifecycle revision indexes", (context) => {
  const { database } = createTestPersistence(context);
  const integrity = database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get();
  const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
  const columns = database.prepare<[], { name: string }>("PRAGMA table_info(files)").all();
  const indexes = database.prepare<[], { name: string }>("PRAGMA index_list(files)").all();

  assert.equal(integrity?.integrity_check, "ok");
  assert.deepEqual(foreignKeyFailures, []);
  assert.equal(columns.some((column) => column.name === "revision"), true);
  assert.equal(indexes.some((index) => index.name === "files_state_updated_index"), true);
});

test("dry-run schema checks are read-only and reject missing or pending databases", (context) => {
  const { temporaryDirectory } = createTestPersistence(context);
  const missingPath = join(temporaryDirectory, "missing.sqlite");
  assert.throws(() => openSqliteDatabaseReadOnly(missingPath));
  assert.equal(existsSync(missingPath), false);

  const oldMigrations = join(temporaryDirectory, "old-migrations");
  mkdirSync(oldMigrations);
  for (const filename of [
    "001_initial_schema.sql",
    "002_auth_sessions.sql",
    "003_file_purging_state.sql",
  ]) {
    copyFileSync(
      join(INITIAL_MIGRATIONS_DIRECTORY, filename),
      join(oldMigrations, filename),
    );
  }

  const oldDatabasePath = join(temporaryDirectory, "old.sqlite");
  const writable = openSqliteDatabase(oldDatabasePath);
  runMigrations(writable, oldMigrations);
  writable.close();
  const readOnly = openSqliteDatabaseReadOnly(oldDatabasePath);

  try {
    assert.throws(
      () => assertMigrationsCurrent(readOnly, INITIAL_MIGRATIONS_DIRECTORY),
      /schema is not current/,
    );
    assert.throws(() => readOnly.exec("CREATE TABLE forbidden (id INTEGER)"), /readonly|read-only/i);
    assert.deepEqual(
      readOnly.prepare<[], { version: number }>("SELECT version FROM schema_migrations ORDER BY version").all(),
      [{ version: 1 }, { version: 2 }, { version: 3 }],
    );
    assert.equal(
      readOnly.prepare<[], { name: string }>("PRAGMA table_info(files)").all()
        .some((column) => column.name === "revision"),
      false,
    );
  } finally {
    readOnly.close();
  }
});

test("migration 004 upgrades existing lifecycle rows without changing their data", (context) => {
  const { temporaryDirectory } = createTestPersistence(context);
  const oldMigrations = join(temporaryDirectory, "upgrade-migrations");
  mkdirSync(oldMigrations);
  for (const filename of [
    "001_initial_schema.sql",
    "002_auth_sessions.sql",
    "003_file_purging_state.sql",
  ]) {
    copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename), join(oldMigrations, filename));
  }

  const database = openSqliteDatabase(join(temporaryDirectory, "upgrade.sqlite"));

  try {
    runMigrations(database, oldMigrations);
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, state, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).run("owner-1", "owner-1", "hash", NOW_FOR_MIGRATION, NOW_FOR_MIGRATION);
    database.prepare(`
      INSERT INTO files (
        id, owner_id, folder_id, display_name, storage_provider, object_key,
        media_type, size_bytes, checksum_algorithm, checksum, state,
        created_at, updated_at, activated_at, deleted_at, purged_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      "file-1",
      "owner-1",
      "paper.pdf",
      "memory",
      "objects/aa/" + "b".repeat(62),
      "application/pdf",
      10,
      "md5",
      "1B2M2Y8AsgTpgAmY7PhCfg==",
      "purging",
      NOW_FOR_MIGRATION,
      NOW_FOR_MIGRATION,
      NOW_FOR_MIGRATION,
      NOW_FOR_MIGRATION,
    );

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY).appliedVersions, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    const row = database.prepare<[], {
      id: string;
      state: string;
      object_key: string;
      revision: number;
    }>("SELECT id, state, object_key, revision FROM files").get();
    assert.deepEqual(row, {
      id: "file-1",
      state: "purging",
      object_key: "objects/aa/" + "b".repeat(62),
      revision: 0,
    });
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

const NOW_FOR_MIGRATION = "2026-08-12T08:00:00.000Z";
