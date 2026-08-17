import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = "2026-08-18T00:00:00.000Z";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-account-archive-v${version}-`));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(name.slice(0, 3)) <= version) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
    }
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("migration 012 adds archival without rebuilding or changing account-owned relationships", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-account-archive-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "archive.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 11));
    const insertAccount = database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES (?, ?, 'hash', ?, 'active', ?, ?)
    `);
    insertAccount.run("owner-1", "Owner", "owner", NOW, NOW);
    insertAccount.run("member-1", "Member", "member", NOW, NOW);
    database.prepare(`
      INSERT INTO invitations (
        id, token_digest, created_by_account_id, created_at, expires_at,
        consumed_at, consumed_by_account_id, revoked_at
      ) VALUES ('invite-1', ?, 'owner-1', ?, ?, ?, 'member-1', NULL)
    `).run("a".repeat(64), NOW, "2026-08-25T00:00:00.000Z", NOW);
    database.prepare(`
      INSERT INTO folders (
        id, owner_domain_id, created_by_account_id, parent_id, name, state,
        created_at, updated_at, deleted_at, recycle_group_id
      ) VALUES ('folder-1', 'account:member-1', 'member-1', NULL, 'Sources', 'active', ?, ?, NULL, NULL)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO files (
        id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
        storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
        checksum, state, revision, created_at, updated_at, activated_at,
        deleted_at, purged_at, recycle_group_id
      ) VALUES (
        'file-1', 'account:member-1', 'member-1', 'folder-1', 'Paper.pdf',
        'memory', 'objects/member-1/file-1', 'application/pdf', 8, 'md5',
        '1B2M2Y8AsgTpgAmY7PhCfg==', 'active', 0, ?, ?, ?, NULL, NULL, NULL
      )
    `).run(NOW, NOW, NOW);
    database.prepare("INSERT INTO favorite_files (account_id, file_id, created_at) VALUES ('member-1', 'file-1', ?)").run(NOW);
    database.prepare(`
      INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
      VALUES ('record-1', 'account:member-1', 'member-1', 'Record', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO governance_audit_events (
        occurred_at, action, outcome, actor_kind, actor_account_id, target_id, reason
      ) VALUES (?, 'accounts.member_state_change', 'succeeded', 'account', 'owner-1', 'member-1', NULL)
    `).run(NOW);

    assert.deepEqual(runMigrations(database, pinnedDirectory(context, 12)), { appliedVersions: [12], currentVersion: 12 });
    assert.deepEqual(runMigrations(database, pinnedDirectory(context, 12)), { appliedVersions: [], currentVersion: 12 });
    assert.deepEqual(
      database.prepare("SELECT id, login_name, role, state, archived_at FROM accounts ORDER BY id").all(),
      [
        { id: "member-1", login_name: "Member", role: "member", state: "active", archived_at: null },
        { id: "owner-1", login_name: "Owner", role: "owner", state: "active", archived_at: null },
      ],
    );
    for (const [table, expected] of [
      ["invitations", 1],
      ["ownership_domains", 2],
      ["folders", 1],
      ["files", 1],
      ["favorite_files", 1],
      ["scholarly_records", 1],
      ["governance_audit_events", 1],
    ] as const) {
      assert.equal(database.prepare<[], { count: number }>(`SELECT count(*) AS count FROM ${table}`).get()!.count, expected, table);
    }
    assert.throws(
      () => database.prepare("UPDATE accounts SET archived_at = ?, auth_revision = auth_revision + 1 WHERE id = 'member-1'").run(NOW),
      /archival requires a disabled member transition/,
    );
    database.prepare("UPDATE accounts SET state = 'disabled', auth_revision = auth_revision + 1 WHERE id = 'member-1'").run();
    database.prepare("UPDATE accounts SET archived_at = ?, auth_revision = auth_revision + 1 WHERE id = 'member-1'").run(NOW);
    assert.deepEqual(
      database.prepare("SELECT state, archived_at, auth_revision FROM accounts WHERE id = 'member-1'").get(),
      { state: "disabled", archived_at: NOW, auth_revision: 2 },
    );
    assert.throws(
      () => database.prepare("UPDATE accounts SET state = 'active', archived_at = NULL, auth_revision = auth_revision + 1 WHERE id = 'member-1'").run(),
      /archival requires a disabled member transition/,
    );
    database.prepare("UPDATE accounts SET archived_at = NULL, auth_revision = auth_revision + 1 WHERE id = 'member-1'").run();
    assert.deepEqual(
      database.prepare("SELECT state, archived_at, auth_revision FROM accounts WHERE id = 'member-1'").get(),
      { state: "disabled", archived_at: null, auth_revision: 3 },
    );
    assert.throws(
      () => insertAccount.run("replacement", "member", "member", NOW, NOW),
      /UNIQUE constraint failed/,
    );
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally {
    database.close();
  }
});
