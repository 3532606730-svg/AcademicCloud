import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-admin-polish-v${version}-`));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(name.slice(0, 3)) <= version) copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("migration 013 append-only registers announcement deletion audit", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-admin-polish-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "admin-polish.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 12));
    assert.equal(database.prepare("SELECT 1 FROM governance_audit_event_kinds WHERE kind = 'announcements.delete'").get(), undefined);
    assert.deepEqual(runMigrations(database, pinnedDirectory(context, 13)), { appliedVersions: [13], currentVersion: 13 });
    assert.deepEqual(
      database.prepare("SELECT kind, target_type FROM governance_audit_event_kinds WHERE kind = 'announcements.delete'").get(),
      { kind: "announcements.delete", target_type: "announcement" },
    );
    assert.deepEqual(runMigrations(database, pinnedDirectory(context, 13)), { appliedVersions: [], currentVersion: 13 });
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally {
    database.close();
  }
});
