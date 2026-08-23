import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = "2026-08-17T08:00:00.000Z";
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-recycle-v${version}-`));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY).filter((entry) => Number(entry.slice(0, 3)) <= version)) {
    copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("migration 006 upgrades legacy recycle rows as independent roots without changing metadata", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-recycle-migration-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "legacy.sqlite"));

  try {
    runMigrations(database, pinnedDirectory(context, 5));
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, state, created_at, updated_at)
      VALUES ('owner-1', 'owner-1', 'hash', 'active', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO folders (id, owner_id, parent_id, name, state, created_at, updated_at, deleted_at)
      VALUES
        ('active-folder', 'owner-1', NULL, 'Active', 'active', ?, ?, NULL),
        ('deleted-folder', 'owner-1', NULL, 'Deleted', 'deleted', ?, ?, ?)
    `).run(NOW, NOW, NOW, NOW, NOW);

    const insertFile = database.prepare(`
      INSERT INTO files (
        id, owner_id, folder_id, display_name, storage_provider, object_key,
        media_type, size_bytes, checksum_algorithm, checksum, state, revision,
        created_at, updated_at, activated_at, deleted_at, purged_at
      ) VALUES (?, 'owner-1', ?, ?, 'memory', ?, 'application/pdf', 8, 'md5', ?, ?, 7, ?, ?, ?, ?, ?)
    `);
    insertFile.run("deleted-file", "active-folder", "Deleted.pdf", "objects/deleted", MD5, "deleted", NOW, NOW, NOW, NOW, null);
    insertFile.run("purging-file", null, "Purging.pdf", "objects/purging", MD5, "purging", NOW, NOW, NOW, NOW, null);
    insertFile.run("purged-file", null, "Purged.pdf", "objects/purged", MD5, "purged", NOW, NOW, NOW, NOW, NOW);
    database.prepare("INSERT INTO favorite_folders (account_id, folder_id, created_at) VALUES ('owner-1', 'deleted-folder', ?)").run(NOW);
    database.prepare("INSERT INTO favorite_files (account_id, file_id, created_at) VALUES ('owner-1', 'deleted-file', ?)").run(NOW);

    const result = runMigrations(database, pinnedDirectory(context, 6));
    assert.deepEqual(result, { appliedVersions: [6], currentVersion: 6 });

    assert.deepEqual(
      database.prepare<[], { id: string; root_kind: string; root_id: string; folder_count: number; file_count: number }>(`
        SELECT id, root_kind, root_id, folder_count, file_count
        FROM recycle_groups ORDER BY id
      `).all(),
      [
        { id: "legacy-file:deleted-file", root_kind: "file", root_id: "deleted-file", folder_count: 0, file_count: 1 },
        { id: "legacy-file:purging-file", root_kind: "file", root_id: "purging-file", folder_count: 0, file_count: 1 },
        { id: "legacy-folder:deleted-folder", root_kind: "folder", root_id: "deleted-folder", folder_count: 1, file_count: 0 },
      ],
    );
    assert.deepEqual(
      database.prepare<[], { id: string; state: string; parent_id: string | null; recycle_group_id: string | null }>(`
        SELECT id, state, parent_id, recycle_group_id FROM folders ORDER BY id
      `).all(),
      [
        { id: "active-folder", state: "active", parent_id: null, recycle_group_id: null },
        { id: "deleted-folder", state: "deleted", parent_id: null, recycle_group_id: "legacy-folder:deleted-folder" },
      ],
    );
    assert.deepEqual(
      database.prepare<[], { id: string; state: string; object_key: string; revision: number; recycle_group_id: string | null }>(`
        SELECT id, state, object_key, revision, recycle_group_id FROM files ORDER BY id
      `).all(),
      [
        { id: "deleted-file", state: "deleted", object_key: "objects/deleted", revision: 7, recycle_group_id: "legacy-file:deleted-file" },
        { id: "purged-file", state: "purged", object_key: "objects/purged", revision: 7, recycle_group_id: null },
        { id: "purging-file", state: "purging", object_key: "objects/purging", revision: 7, recycle_group_id: "legacy-file:purging-file" },
      ],
    );
    assert.deepEqual(database.prepare("SELECT account_id, folder_id FROM favorite_folders").all(), [
      { account_id: "owner-1", folder_id: "deleted-folder" },
    ]);
    assert.deepEqual(database.prepare("SELECT account_id, file_id FROM favorite_files").all(), [
      { account_id: "owner-1", file_id: "deleted-file" },
    ]);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()?.integrity_check, "ok");

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
      currentVersion: 25,
    });
    const persistence = new SqlitePersistence(database);
    assert.deepEqual(persistence.repositories.folders.listDeleted("owner-1").map((folder) => folder.id), ["deleted-folder"]);
    assert.deepEqual(persistence.repositories.files.listDeleted("owner-1").map((file) => file.id).sort(), ["deleted-file", "purging-file"]);
  } finally {
    database.close();
  }
});

test("migration 006 constraints reject deleted lifecycle rows without same-owner provenance", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-recycle-constraints-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "constraints.sqlite"));
  try {
    runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
    for (const owner of ["owner-1", "owner-2"]) {
      database.prepare(`
        INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
        VALUES (?, ?, 'hash', ?, 'active', ?, ?)
      `).run(owner, owner, owner === "owner-1" ? "owner" : "member", NOW, NOW);
    }
    database.prepare(`
      INSERT INTO recycle_groups (
        id, owner_domain_id, created_by_account_id, root_kind, root_id,
        folder_count, file_count, created_at
      ) VALUES ('group-1', 'account:owner-1', 'owner-1', 'folder', 'folder-1', 1, 0, ?)
    `).run(NOW);

    assert.throws(() => database.prepare(`
      INSERT INTO folders (
        id, owner_domain_id, created_by_account_id, parent_id, name, state,
        created_at, updated_at, deleted_at, recycle_group_id
      ) VALUES ('folder-1', 'account:owner-1', 'owner-1', NULL, 'Broken', 'deleted', ?, ?, ?, NULL)
    `).run(NOW, NOW, NOW), /invalid folder recycle provenance/);
    assert.throws(() => database.prepare(`
      INSERT INTO folders (
        id, owner_domain_id, created_by_account_id, parent_id, name, state,
        created_at, updated_at, deleted_at, recycle_group_id
      ) VALUES ('folder-2', 'account:owner-2', 'owner-2', NULL, 'Foreign', 'deleted', ?, ?, ?, 'group-1')
    `).run(NOW, NOW, NOW), /invalid folder recycle provenance/);
  } finally {
    database.close();
  }
});
