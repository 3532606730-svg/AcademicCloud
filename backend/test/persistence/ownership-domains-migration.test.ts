import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const CREATED = "2026-08-17T01:02:03.004Z";
const UPDATED = "2026-08-17T05:06:07.008Z";
const DELETED = "2026-08-17T09:10:11.012Z";
const PURGED = "2026-08-17T13:14:15.016Z";
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-ownership-v${version}-`));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(name.slice(0, 3)) <= version) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
    }
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("migration 010 handles zero accounts and atomically gives every new account one domain", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-ownership-empty-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "empty.sqlite"));
  try {
    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      currentVersion: 15,
    });
    assert.deepEqual(database.prepare("SELECT * FROM ownership_domains").all(), []);

    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES ('account-a', 'AccountA', 'hash', 'owner', 'active', ?, ?)
    `).run(CREATED, UPDATED);

    assert.deepEqual(database.prepare(`
      SELECT id, kind, account_id, created_at FROM ownership_domains
    `).all(), [{
      id: "account:account-a",
      kind: "account",
      account_id: "account-a",
      created_at: CREATED,
    }]);
    assert.throws(
      () => database.prepare("UPDATE ownership_domains SET kind = 'library' WHERE id = 'account:account-a'").run(),
      /ownership domain identity is immutable/,
    );
    assert.throws(
      () => database.prepare("DELETE FROM ownership_domains WHERE id = 'account:account-a'").run(),
      /ownership domains cannot be deleted/,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("migration 010 gives one existing account exactly one stable account domain", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-ownership-single-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "single.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 9));
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES ('single-account', 'Single', 'hash', 'owner', 'disabled', ?, ?)
    `).run(CREATED, UPDATED);

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [10, 11, 12, 13, 14, 15],
      currentVersion: 15,
    });
    assert.deepEqual(database.prepare(`
      SELECT id, kind, account_id, created_at FROM ownership_domains
    `).all(), [{
      id: "account:single-account",
      kind: "account",
      account_id: "single-account",
      created_at: CREATED,
    }]);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("migration 010 preserves exact multi-account resource, lifecycle, recycle, Favorite, and timestamp identity", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-ownership-populated-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "populated.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 9));
    const insertAccount = database.prepare(`
      INSERT INTO accounts (
        id, login_name, password_hash, role, state, created_at, updated_at
      ) VALUES (?, ?, 'hash', ?, ?, ?, ?)
    `);
    insertAccount.run("account-a", "AccountA", "owner", "active", CREATED, UPDATED);
    insertAccount.run("account-b", "AccountB", "member", "disabled", CREATED, UPDATED);

    const insertGroup = database.prepare(`
      INSERT INTO recycle_groups (
        id, owner_id, root_kind, root_id, folder_count, file_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertGroup.run("group-folder-a", "account-a", "folder", "folder-deleted", 1, 0, DELETED);
    insertGroup.run("group-file-a", "account-a", "file", "file-deleted", 0, 1, DELETED);
    insertGroup.run("group-file-b", "account-b", "file", "file-purging", 0, 1, DELETED);

    const insertFolder = database.prepare(`
      INSERT INTO folders (
        id, owner_id, parent_id, name, state, created_at, updated_at,
        deleted_at, recycle_group_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertFolder.run("folder-root", "account-a", null, "Root", "active", CREATED, UPDATED, null, null);
    insertFolder.run("folder-child", "account-a", "folder-root", "Child", "active", CREATED, UPDATED, null, null);
    insertFolder.run("folder-deleted", "account-a", null, "Deleted", "deleted", CREATED, UPDATED, DELETED, "group-folder-a");

    const insertFile = database.prepare(`
      INSERT INTO files (
        id, owner_id, folder_id, display_name, storage_provider, object_key,
        media_type, size_bytes, checksum_algorithm, checksum, state, revision,
        created_at, updated_at, activated_at, deleted_at, purged_at, recycle_group_id
      ) VALUES (?, ?, ?, ?, 'memory', ?, 'application/pdf', 17, 'md5', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertFile.run("file-pending", "account-a", null, "Pending.pdf", "objects/00/pending", MD5, "pending_upload", 7, CREATED, UPDATED, null, null, null, null);
    insertFile.run("file-active", "account-a", "folder-child", "Active.pdf", "objects/00/active", MD5, "active", 2, CREATED, UPDATED, CREATED, null, null, null);
    insertFile.run("file-deleted", "account-a", null, "Deleted.pdf", "objects/00/deleted", MD5, "deleted", 3, CREATED, UPDATED, CREATED, DELETED, null, "group-file-a");
    insertFile.run("file-purging", "account-b", null, "Purging.pdf", "objects/00/purging", MD5, "purging", 4, CREATED, UPDATED, CREATED, DELETED, null, "group-file-b");
    insertFile.run("file-purged", "account-b", null, "Purged.pdf", "objects/00/purged", MD5, "purged", 5, CREATED, UPDATED, CREATED, DELETED, PURGED, null);

    database.prepare("INSERT INTO favorite_folders VALUES ('account-a', 'folder-deleted', ?)").run(CREATED);
    database.prepare("INSERT INTO favorite_files VALUES ('account-a', 'file-active', ?)").run(CREATED);
    database.prepare("INSERT INTO favorite_files VALUES ('account-a', 'file-deleted', ?)").run(UPDATED);

    const foldersBefore = database.prepare(`
      SELECT id, owner_id, parent_id, name, state, created_at, updated_at, deleted_at, recycle_group_id
      FROM folders ORDER BY id
    `).all();
    const filesBefore = database.prepare(`
      SELECT id, owner_id, folder_id, display_name, storage_provider, object_key,
        media_type, size_bytes, checksum_algorithm, checksum, state, revision,
        created_at, updated_at, activated_at, deleted_at, purged_at, recycle_group_id
      FROM files ORDER BY id
    `).all();
    const groupsBefore = database.prepare(`
      SELECT id, owner_id, root_kind, root_id, folder_count, file_count, created_at
      FROM recycle_groups ORDER BY id
    `).all();
    const favoriteFilesBefore = database.prepare("SELECT * FROM favorite_files ORDER BY account_id, file_id").all();
    const favoriteFoldersBefore = database.prepare("SELECT * FROM favorite_folders ORDER BY account_id, folder_id").all();

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [10, 11, 12, 13, 14, 15],
      currentVersion: 15,
    });

    assert.deepEqual(database.prepare(`
      SELECT folders.id, ownership_domains.account_id AS owner_id, folders.parent_id,
        folders.name, folders.state, folders.created_at, folders.updated_at,
        folders.deleted_at, folders.recycle_group_id
      FROM folders JOIN ownership_domains ON ownership_domains.id = folders.owner_domain_id
      ORDER BY folders.id
    `).all(), foldersBefore);
    assert.deepEqual(database.prepare(`
      SELECT files.id, ownership_domains.account_id AS owner_id, files.folder_id,
        files.display_name, files.storage_provider, files.object_key, files.media_type,
        files.size_bytes, files.checksum_algorithm, files.checksum, files.state,
        files.revision, files.created_at, files.updated_at, files.activated_at,
        files.deleted_at, files.purged_at, files.recycle_group_id
      FROM files JOIN ownership_domains ON ownership_domains.id = files.owner_domain_id
      ORDER BY files.id
    `).all(), filesBefore);
    assert.deepEqual(database.prepare(`
      SELECT recycle_groups.id, ownership_domains.account_id AS owner_id,
        recycle_groups.root_kind, recycle_groups.root_id, recycle_groups.folder_count,
        recycle_groups.file_count, recycle_groups.created_at
      FROM recycle_groups
      JOIN ownership_domains ON ownership_domains.id = recycle_groups.owner_domain_id
      ORDER BY recycle_groups.id
    `).all(), groupsBefore);
    assert.deepEqual(database.prepare("SELECT * FROM favorite_files ORDER BY account_id, file_id").all(), favoriteFilesBefore);
    assert.deepEqual(database.prepare("SELECT * FROM favorite_folders ORDER BY account_id, folder_id").all(), favoriteFoldersBefore);

    assert.deepEqual(database.prepare(`
      SELECT id, kind, account_id, created_at FROM ownership_domains ORDER BY id
    `).all(), [
      { id: "account:account-a", kind: "account", account_id: "account-a", created_at: CREATED },
      { id: "account:account-b", kind: "account", account_id: "account-b", created_at: CREATED },
    ]);
    assert.deepEqual(database.prepare(`
      SELECT id, created_by_account_id FROM folders ORDER BY id
    `).all(), [
      { id: "folder-child", created_by_account_id: "account-a" },
      { id: "folder-deleted", created_by_account_id: "account-a" },
      { id: "folder-root", created_by_account_id: "account-a" },
    ]);
    assert.deepEqual(database.prepare(`
      SELECT id, uploaded_by_account_id FROM files ORDER BY id
    `).all(), [
      { id: "file-active", uploaded_by_account_id: "account-a" },
      { id: "file-deleted", uploaded_by_account_id: "account-a" },
      { id: "file-pending", uploaded_by_account_id: "account-a" },
      { id: "file-purged", uploaded_by_account_id: "account-b" },
      { id: "file-purging", uploaded_by_account_id: "account-b" },
    ]);
    assert.equal(
      database.prepare<[], { count: number }>(
        "SELECT count(*) AS count FROM ownership_domains WHERE kind = 'library'",
      ).get()!.count,
      0,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally {
    database.close();
  }
});

test("migration 010 rolls back every schema change and version record when legacy ownership is inconsistent", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-ownership-rollback-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "rollback.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 9));
    database.pragma("foreign_keys = OFF");
    database.prepare(`
      INSERT INTO folders (
        id, owner_id, parent_id, name, state, created_at, updated_at,
        deleted_at, recycle_group_id
      ) VALUES ('orphan', 'missing-account', NULL, 'Orphan', 'active', ?, ?, NULL, NULL)
    `).run(CREATED, UPDATED);
    database.pragma("foreign_keys = ON");

    assert.throws(
      () => runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY),
      /FOREIGN KEY constraint failed/,
    );
    assert.equal(database.prepare("SELECT 1 FROM schema_migrations WHERE version = 10").get(), undefined);
    assert.equal(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ownership_domains'").get(), undefined);
    assert.deepEqual(database.prepare("SELECT id, owner_id FROM folders").all(), [
      { id: "orphan", owner_id: "missing-account" },
    ]);
    assert.equal(
      database.prepare<[], { found: number }>(`
        SELECT count(*) AS found FROM pragma_table_info('folders') WHERE name = 'owner_domain_id'
      `).get()!.found,
      0,
    );
  } finally {
    database.close();
  }
});

test("domain constraints isolate hierarchy and provenance while contributor state is not ownership", (context) => {
  const { database, persistence } = (() => {
    const directory = mkdtempSync(join(tmpdir(), "academiccloud-ownership-constraints-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const database = openSqliteDatabase(join(directory, "constraints.sqlite"));
    runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
    return { database, persistence: new SqlitePersistence(database) };
  })();
  try {
    for (const [id, state] of [["active-account", "active"], ["disabled-contributor", "disabled"]] as const) {
      persistence.repositories.accounts.create({
        id,
        loginName: id,
        passwordHash: "hash",
        role: id === "active-account" ? "owner" : "member",
        state,
        createdAt: new Date(CREATED),
        updatedAt: new Date(UPDATED),
      });
    }
    database.prepare(`
      INSERT INTO ownership_domains (id, kind, account_id, created_at)
      VALUES ('library-domain-test', 'library', NULL, ?)
    `).run(CREATED);
    database.prepare(`
      INSERT INTO folders (
        id, owner_domain_id, created_by_account_id, parent_id, name, state,
        created_at, updated_at, deleted_at, recycle_group_id
      ) VALUES (
        'library-folder', 'library-domain-test', 'disabled-contributor', NULL,
        'Library Source', 'active', ?, ?, NULL, NULL
      )
    `).run(CREATED, UPDATED);
    database.prepare(`
      INSERT INTO files (
        id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
        storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
        checksum, state, revision, created_at, updated_at, activated_at,
        deleted_at, purged_at, recycle_group_id
      ) VALUES (
        'library-file', 'library-domain-test', 'disabled-contributor', 'library-folder',
        'Library.pdf', 'memory', 'objects/00/library', 'application/pdf', 17,
        'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL
      )
    `).run(MD5, CREATED, UPDATED, CREATED);

    assert.equal(persistence.repositories.files.findById("disabled-contributor", "library-file"), null);
    assert.equal(persistence.repositories.folders.findById("active-account", "library-folder"), null);
    assert.deepEqual(database.prepare(`
      SELECT files.owner_domain_id, files.uploaded_by_account_id, accounts.state
      FROM files JOIN accounts ON accounts.id = files.uploaded_by_account_id
      WHERE files.id = 'library-file'
    `).get(), {
      owner_domain_id: "library-domain-test",
      uploaded_by_account_id: "disabled-contributor",
      state: "disabled",
    });

    assert.throws(() => database.prepare(`
      INSERT INTO folders (
        id, owner_domain_id, created_by_account_id, parent_id, name, state,
        created_at, updated_at, deleted_at, recycle_group_id
      ) VALUES (
        'cross-domain-child', 'account:active-account', 'active-account',
        'library-folder', 'Cross', 'active', ?, ?, NULL, NULL
      )
    `).run(CREATED, UPDATED), /FOREIGN KEY constraint failed/);
    assert.throws(
      () => database.prepare("UPDATE files SET uploaded_by_account_id = 'active-account' WHERE id = 'library-file'").run(),
      /file ownership and uploader are immutable/,
    );
    assert.throws(
      () => database.prepare("UPDATE folders SET owner_domain_id = 'account:active-account' WHERE id = 'library-folder'").run(),
      /folder ownership and creator are immutable/,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    persistence.close();
  }
});
