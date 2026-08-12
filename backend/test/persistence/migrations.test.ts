import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { createTestPersistence, INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

test("migrations apply once and retain their recorded version", (context) => {
  const { database } = createTestPersistence(context);

  const secondRun = runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
  const versions = database
    .prepare<[], { version: number }>("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((row) => row.version);

  assert.deepEqual(secondRun, { appliedVersions: [], currentVersion: 3 });
  assert.deepEqual(versions, [1, 2, 3]);
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
