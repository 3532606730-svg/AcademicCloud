import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { loadSqliteConfig } from "../../src/persistence/sqlite/config.js";

test("SQLite configuration resolves safe project-relative defaults", () => {
  const config = loadSqliteConfig({}, "C:\\workspace\\backend");

  assert.equal(config.databasePath, resolve("C:\\workspace\\backend", "../database/academiccloud.sqlite"));
  assert.equal(config.migrationsDirectory, resolve("C:\\workspace\\backend", "../database/migrations"));
});

test("SQLite configuration rejects null bytes in paths", () => {
  assert.throws(() => loadSqliteConfig({ DATABASE_PATH: "unsafe\0path" }), /must not contain a null byte/);
});
