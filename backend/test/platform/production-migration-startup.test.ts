import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { createApplication } from "../../src/platform/application.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "../persistence/helpers.js";

// A pinned v4-only directory plus the REAL repository migrations directory
// (which includes migration 005 through the current append-only head): deterministic pending-migration scenarios
// that stay valid as later migrations land in the repo.
function migrationFixtures(context: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-migstart-"));
  const v4 = join(directory, "v4");
  mkdirSync(v4);
  const pinned = readdirSync(INITIAL_MIGRATIONS_DIRECTORY).filter((name) => /^00[1-4]_/.test(name));
  for (const name of pinned) {
    copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(v4, name));
  }

  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return { v4, latest: INITIAL_MIGRATIONS_DIRECTORY };
}

function productionConfig() {
  return {
    host: "127.0.0.1",
    port: 3000,
    logLevel: "silent",
    environment: "production",
    appOrigin: "https://cloud.ajtlab.top",
  } as const;
}

function readSchemaVersion(databasePath: string): number {
  const database = openSqliteDatabase(databasePath);
  try {
    const row = database
      .prepare<[], { version: number }>("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
      .get();
    return row?.version ?? 0;
  } finally {
    database.close();
  }
}

function hasFavoritesTable(databasePath: string): boolean {
  const database = openSqliteDatabase(databasePath);
  try {
    return database
      .prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("favorite_files") !== undefined;
  } finally {
    database.close();
  }
}

test("development startup initializes and migrates a disposable database", async (context) => {
  const { latest } = migrationFixtures(context);
  const databasePath = join(mkdtempSync(join(tmpdir(), "academiccloud-devstart-")), "dev.sqlite");
  const app = await createApplication(
    { ...productionConfig(), environment: "test", appOrigin: "http://127.0.0.1:5173" },
    { databasePath, migrationsDirectory: latest },
    new InMemoryStorageAdapter(),
  );
  try {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(response.statusCode, 200);
  } finally {
    await app.close();
  }
  assert.equal(readSchemaVersion(databasePath), 34);
});

test("production startup with a current schema succeeds without mutating it", async (context) => {
  const { latest } = migrationFixtures(context);
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-prodstart-"));
  const databasePath = join(directory, "prod.sqlite");
  const database = openSqliteDatabase(databasePath);
  runMigrations(database, latest);
  database.close();

  const app = await createApplication(productionConfig(), { databasePath, migrationsDirectory: latest }, new InMemoryStorageAdapter());
  try {
    assert.equal((await app.inject({ method: "GET", url: "/api/health" })).statusCode, 200);
  } finally {
    await app.close();
  }
  assert.equal(readSchemaVersion(databasePath), 34);
  rmSync(directory, { recursive: true, force: true });
});

test("production startup with a pending migration fails closed", async (context) => {
  const { v4, latest } = migrationFixtures(context);
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-prodfail-"));
  const databasePath = join(directory, "prod.sqlite");
  const database = openSqliteDatabase(databasePath);
  runMigrations(database, v4);
  database.close();

  await assert.rejects(
    () => createApplication(productionConfig(), { databasePath, migrationsDirectory: latest }, new InMemoryStorageAdapter()),
    /schema is not current/,
  );

  // The failed startup must NOT have applied the pending migration.
  assert.equal(readSchemaVersion(databasePath), 4);
  assert.equal(hasFavoritesTable(databasePath), false);
  rmSync(directory, { recursive: true, force: true });
});

test("the explicit migration runner still applies pending migrations normally", async (context) => {
  const { v4, latest } = migrationFixtures(context);
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-explicit-"));
  const databasePath = join(directory, "prod.sqlite");
  const database = openSqliteDatabase(databasePath);
  runMigrations(database, v4);
  database.close();

  const upgraded = openSqliteDatabase(databasePath);
  const result = runMigrations(upgraded, latest);
  upgraded.close();
  assert.deepEqual(result.appliedVersions, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34]);
  assert.equal(result.currentVersion, 34);
  assert.equal(hasFavoritesTable(databasePath), true);
  rmSync(directory, { recursive: true, force: true });
});

test("production startup refuses an uninitialized database", async (context) => {
  const { latest } = migrationFixtures(context);
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-prodempty-"));
  const databasePath = join(directory, "prod.sqlite");

  await assert.rejects(
    () => createApplication(productionConfig(), { databasePath, migrationsDirectory: latest }, new InMemoryStorageAdapter()),
    /schema is not initialized/,
  );
  rmSync(directory, { recursive: true, force: true });
});
