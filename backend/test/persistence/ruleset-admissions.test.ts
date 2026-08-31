import assert from "node:assert/strict";
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import {
  assertRulesetAdmissionsCurrent,
  runRulesetAdmissions,
} from "../../src/persistence/sqlite/ruleset-admissions.js";
import {
  INITIAL_MIGRATIONS_DIRECTORY,
  RULESET_ADMISSIONS_DIRECTORY,
} from "./helpers.js";

test("ruleset admission is append-only, schema-stable, exact, and idempotent", () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-ruleset-admission-"));
  const database = openSqliteDatabase(join(directory, "ruleset.sqlite"));
  try {
    runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
    const before = schemaState();
    assert.throws(
      () => assertRulesetAdmissionsCurrent(database, RULESET_ADMISSIONS_DIRECTORY),
      /admission is not current/u,
    );

    const first = runRulesetAdmissions(database, RULESET_ADMISSIONS_DIRECTORY);
    assert.deepEqual(first.admitted, ["l1-intelligent-library01-v10", "l1-intelligent-library01-v11"]);
    assert.deepEqual(first.alreadyAdmitted, []);
    assert.deepEqual(first.current, {
      contractVersion: 1,
      rulesetVersion: "l1-intelligent-library01-v11",
      promptVersion: "l1-intelligent-library01-prompt-v7",
    });
    assert.deepEqual(schemaState(), before);

    const second = runRulesetAdmissions(database, RULESET_ADMISSIONS_DIRECTORY);
    assert.deepEqual(second.admitted, []);
    assert.deepEqual(second.alreadyAdmitted, ["l1-intelligent-library01-v10", "l1-intelligent-library01-v11"]);
    assert.deepEqual(schemaState(), before);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()?.integrity_check, "ok");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }

  function schemaState() {
    return {
      schemaVersion: database.prepare<[], { schema_version: number }>("PRAGMA schema_version").get()?.schema_version,
      migration: database.prepare<[], { count: number; version: number }>(
        "SELECT COUNT(*) AS count, MAX(version) AS version FROM schema_migrations",
      ).get(),
    };
  }
});

test("ruleset admission rejects an asset whose bytes do not match its manifest before mutation", () => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-ruleset-admission-tamper-"));
  const admissionDirectory = join(directory, "ruleset-admissions");
  mkdirSync(admissionDirectory);
  for (const name of readdirSync(RULESET_ADMISSIONS_DIRECTORY)) {
    copyFileSync(join(RULESET_ADMISSIONS_DIRECTORY, name), join(admissionDirectory, name));
  }
  appendFileSync(join(admissionDirectory, "002_l1_intelligent_library01_v11.sql"), "\n-- tampered\n");

  const database = openSqliteDatabase(join(directory, "ruleset.sqlite"));
  try {
    runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
    assert.throws(() => runRulesetAdmissions(database, admissionDirectory), /checksum mismatch/u);
    assert.equal(database.prepare<[], { count: number }>(`
      SELECT COUNT(*) AS count
        FROM scholarly_bibliographic_ruleset_registry
       WHERE ruleset_version IN ('l1-intelligent-library01-v10', 'l1-intelligent-library01-v11')
    `).get()?.count, 0);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
