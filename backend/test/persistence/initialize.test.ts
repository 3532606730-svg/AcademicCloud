import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { initializeDatabase } from "../../src/persistence/sqlite/initialize.js";
import { assertRuntimeRulesetReady } from "../../src/persistence/sqlite/ruleset-admissions.js";
import { INITIAL_MIGRATIONS_DIRECTORY, RULESET_ADMISSIONS_DIRECTORY } from "./helpers.js";

test("one explicit initialization prepares a fresh schema and the exact runtime admission idempotently", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-initialize-"));
  const config = { databasePath: join(directory, "test.sqlite"), migrationsDirectory: INITIAL_MIGRATIONS_DIRECTORY,
    rulesetAdmissionsDirectory: RULESET_ADMISSIONS_DIRECTORY };
  const database = openSqliteDatabase(config.databasePath);
  context.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  const first = initializeDatabase(database, config);
  assert.ok(first.migrations.appliedVersions.length > 0);
  assert.equal(first.admissions.current.rulesetVersion, "l1-intelligent-library01-v11");
  assertRuntimeRulesetReady(database, first.admissions.current);
  const second = initializeDatabase(database, config);
  assert.deepEqual(second.migrations.appliedVersions, []);
  assert.deepEqual(second.admissions.admitted, []);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(database.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM scholarly_bibliographic_ruleset_registry").get()!.n, 11);
  assert.throws(() => assertRuntimeRulesetReady(database, { ...first.admissions.current, promptVersion: "l1-intelligent-library01-prompt-v6" }), /current runtime/u);
});

test("a valid historical admission manifest cannot initialize a newer runtime or mutate the fresh database", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-historical-init-"));
  const admissionDirectory = join(directory, "admissions");
  cpSync(RULESET_ADMISSIONS_DIRECTORY, admissionDirectory, { recursive: true });
  const manifestPath = join(admissionDirectory, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.current.rulesetVersion = "l1-intelligent-library01-v10";
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const database = openSqliteDatabase(":memory:");
  context.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  assert.throws(() => initializeDatabase(database, { databasePath: ":memory:", migrationsDirectory: INITIAL_MIGRATIONS_DIRECTORY,
    rulesetAdmissionsDirectory: admissionDirectory }), /current runtime/u);
  assert.deepEqual(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all(), []);
});
