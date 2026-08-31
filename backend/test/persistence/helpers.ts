import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";

import { openSqliteDatabase, type SqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";

export const INITIAL_MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../database/migrations/", import.meta.url),
);
export const RULESET_ADMISSIONS_DIRECTORY = fileURLToPath(
  new URL("../../../database/ruleset-admissions/", import.meta.url),
);

export interface TestPersistence {
  database: SqliteDatabase;
  persistence: SqlitePersistence;
  temporaryDirectory: string;
}

export function createTestPersistence(context: TestContext): TestPersistence {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "academiccloud-test-"));
  const database = openSqliteDatabase(join(temporaryDirectory, "test.sqlite"));
  runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
  const persistence = new SqlitePersistence(database);

  context.after(() => {
    persistence.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  return { database, persistence, temporaryDirectory };
}
