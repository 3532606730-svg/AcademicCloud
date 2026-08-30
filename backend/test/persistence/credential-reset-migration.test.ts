import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-credential-reset-${version}-`));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(name.slice(0, 3)) <= version) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
    }
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("migration 017 applies append-only from v16 with immutable reset evidence and audit vocabulary", (context) => {
  const v16 = pinnedDirectory(context, 16);
  const database = openSqliteDatabase(join(v16, "from-v16.sqlite"));
  try {
    assert.deepEqual(runMigrations(database, v16), { appliedVersions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], currentVersion: 16 });
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES
        ('owner-1', 'Owner', 'hash', 'owner', 'active', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z'),
        ('member-1', 'Member', 'hash', 'member', 'active', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')
    `).run();

  assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33], currentVersion: 33 });
  assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [], currentVersion: 33 });
    assert.deepEqual(
      database.prepare("SELECT kind, target_type FROM governance_audit_event_kinds WHERE kind LIKE '%credential_reset%' ORDER BY kind").all(),
      [
        { kind: "accounts.credential_reset_issue", target_type: "credential_reset" },
        { kind: "auth.credential_reset", target_type: "credential_reset" },
      ],
    );
    database.prepare(`
      INSERT INTO credential_resets (
        id, token_digest, account_id, issued_by_account_id,
        created_at, expires_at, consumed_at, superseded_at
      ) VALUES (
        'reset-1', ?, 'member-1', 'owner-1',
        '2026-08-18T00:00:00.000Z', '2026-08-18T00:30:00.000Z', NULL, NULL
      )
    `).run("a".repeat(64));
    assert.throws(() => database.prepare("DELETE FROM credential_resets WHERE id = 'reset-1'").run(), /retained/);
    assert.throws(() => database.prepare("UPDATE credential_resets SET account_id = 'owner-1' WHERE id = 'reset-1'").run(), /immutable/);
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(database.pragma("foreign_key_check"), []);
  } finally {
    database.close();
  }
});
