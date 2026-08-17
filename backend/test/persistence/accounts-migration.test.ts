import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = "2026-08-17T10:00:00.000Z";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-accounts-v${version}-`));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(name.slice(0, 3)) <= version) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
    }
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("migration 007 accepts an empty database without auto-creating an account", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-accounts-empty-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "empty.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 6));
    const result = runMigrations(database, pinnedDirectory(context, 7));
    assert.deepEqual(result, { appliedVersions: [7], currentVersion: 7 });
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM accounts").get()!.count, 0);
    assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invitations'").get());
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    database.close();
  }
});

test("migration 007 promotes exactly one legacy account to Owner without changing owned rows", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-accounts-singleton-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "single.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 6));
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, state, created_at, updated_at)
      VALUES ('legacy-owner', 'Legacy', 'hash', 'active', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO folders (id, owner_id, parent_id, name, state, created_at, updated_at, deleted_at, recycle_group_id)
      VALUES ('folder-1', 'legacy-owner', NULL, 'Sources', 'active', ?, ?, NULL, NULL)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO favorite_folders (account_id, folder_id, created_at)
      VALUES ('legacy-owner', 'folder-1', ?)
    `).run(NOW);
    database.prepare(`
      INSERT INTO files (
        id, owner_id, folder_id, display_name, storage_provider, object_key,
        media_type, size_bytes, checksum_algorithm, checksum, state, revision,
        created_at, updated_at, activated_at, deleted_at, purged_at, recycle_group_id
      ) VALUES (
        'file-1', 'legacy-owner', 'folder-1', 'Paper.pdf', 'memory', ?,
        'application/pdf', 8, 'md5', '1B2M2Y8AsgTpgAmY7PhCfg==', 'active', 0,
        ?, ?, ?, NULL, NULL, NULL
      )
    `).run("objects/aa/" + "b".repeat(62), NOW, NOW, NOW);
    database.prepare(`
      INSERT INTO favorite_files (account_id, file_id, created_at)
      VALUES ('legacy-owner', 'file-1', ?)
    `).run(NOW);

    assert.deepEqual(runMigrations(database, pinnedDirectory(context, 7)), { appliedVersions: [7], currentVersion: 7 });
    assert.deepEqual(
      database.prepare("SELECT id, login_name, role, state FROM accounts").all(),
      [{ id: "legacy-owner", login_name: "Legacy", role: "owner", state: "active" }],
    );
    assert.deepEqual(database.prepare("SELECT id, owner_id, parent_id FROM folders").all(), [
      { id: "folder-1", owner_id: "legacy-owner", parent_id: null },
    ]);
    assert.deepEqual(database.prepare("SELECT account_id, folder_id FROM favorite_folders").all(), [
      { account_id: "legacy-owner", folder_id: "folder-1" },
    ]);
    assert.deepEqual(database.prepare("SELECT id, owner_id, folder_id, object_key FROM files").all(), [
      { id: "file-1", owner_id: "legacy-owner", folder_id: "folder-1", object_key: "objects/aa/" + "b".repeat(62) },
    ]);
    assert.deepEqual(database.prepare("SELECT account_id, file_id FROM favorite_files").all(), [
      { account_id: "legacy-owner", file_id: "file-1" },
    ]);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally {
    database.close();
  }
});

test("migration 007 fails atomically when legacy account count is greater than one", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-accounts-ambiguous-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "ambiguous.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 6));
    const insert = database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, state, created_at, updated_at)
      VALUES (?, ?, 'hash', 'active', ?, ?)
    `);
    insert.run("legacy-a", "LegacyA", NOW, NOW);
    insert.run("legacy-b", "LegacyB", NOW, NOW);

    assert.throws(() => runMigrations(database, pinnedDirectory(context, 7)), /CHECK constraint failed/);
    assert.equal(database.prepare("SELECT 1 FROM schema_migrations WHERE version = 7").get(), undefined);
    assert.equal(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='invitations'").get(), undefined);
    assert.equal(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_role_migration_guard'").get(), undefined);
    assert.equal(database.prepare("PRAGMA table_info(accounts)").all().some((column: any) => column.name === "role"), false);
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM accounts").get()!.count, 2);
  } finally {
    database.close();
  }
});

test("migration 007 constraints reject missing roles and malformed invitation state", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-accounts-constraints-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "constraints.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 7));
    assert.throws(() => database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, state, created_at, updated_at)
      VALUES ('missing-role', 'MissingRole', 'hash', 'active', ?, ?)
    `).run(NOW, NOW), /account role is required/);
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES ('owner-1', 'Owner', 'hash', 'owner', 'active', ?, ?)
    `).run(NOW, NOW);
    assert.throws(() => database.prepare("UPDATE accounts SET role = NULL WHERE id = 'owner-1'").run(), /account role is required/);
    assert.throws(() => database.prepare("UPDATE accounts SET role = 'admin' WHERE id = 'owner-1'").run(), /account role is required|CHECK constraint failed/);
    assert.throws(() => database.prepare("UPDATE accounts SET state = 'disabled' WHERE id = 'owner-1'").run(), /auth revision/);
    database.prepare("UPDATE accounts SET state = 'disabled', auth_revision = auth_revision + 1 WHERE id = 'owner-1'").run();
    assert.deepEqual(database.prepare("SELECT state, auth_revision FROM accounts WHERE id = 'owner-1'").get(), { state: "disabled", auth_revision: 1 });
    assert.throws(() => database.prepare(`
      INSERT INTO invitations (
        id, token_digest, created_by_account_id, created_at, expires_at,
        consumed_at, consumed_by_account_id, revoked_at
      ) VALUES ('bad', ?, 'owner-1', ?, ?, ?, NULL, ?)
    `).run("a".repeat(64), NOW, "2026-08-18T10:00:00.000Z", NOW, NOW), /CHECK constraint failed/);
  } finally {
    database.close();
  }
});
