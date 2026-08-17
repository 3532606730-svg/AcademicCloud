import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = "2026-08-17T12:00:00.000Z";
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-scholarly-v${version}-`));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(name.slice(0, 3)) <= version) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
    }
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("migration 011 accepts zero accounts and creates empty identity tables", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-scholarly-empty-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "empty.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 10));
    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [11],
      currentVersion: 11,
    });
    for (const table of ["scholarly_records", "scholarly_artifacts", "scholarly_artifact_versions"]) {
      assert.equal(database.prepare<[], { count: number }>(`SELECT count(*) AS count FROM ${table}`).get()!.count, 0);
    }
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("migration 011 preserves one-account Drive state without fabricating a record", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-scholarly-one-account-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "one.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 10));
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES ('account-a', 'account-a', 'hash', 'owner', 'active', ?, ?)
    `).run(NOW, NOW);
    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [11],
      currentVersion: 11,
    });
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM ownership_domains").get()!.count, 1);
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM scholarly_records").get()!.count, 0);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("migration 011 never backfills existing multi-account Drive files", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-scholarly-no-backfill-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "populated.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 10));
    for (const [id, role] of [["account-a", "owner"], ["account-b", "member"]] as const) {
      database.prepare(`
        INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
        VALUES (?, ?, 'hash', ?, 'active', ?, ?)
      `).run(id, id, role, NOW, NOW);
      database.prepare(`
        INSERT INTO files (
          id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
          storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
          checksum, state, revision, created_at, updated_at, activated_at,
          deleted_at, purged_at, recycle_group_id
        ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', 8, 'md5', ?,
          'active', 0, ?, ?, ?, NULL, NULL, NULL)
      `).run(`file-${id}`, `account:${id}`, id, `${id}.pdf`, `objects/${id}`, MD5, NOW, NOW, NOW);
    }

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [11],
      currentVersion: 11,
    });
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM files").get()!.count, 2);
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM scholarly_records").get()!.count, 0);
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM scholarly_artifact_versions").get()!.count, 0);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("scholarly identity constraints prevent cross-domain links, aliases, deletion, and attached purge", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-scholarly-constraints-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "constraints.sqlite"));
  try {
    runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
    for (const id of ["account-a", "account-b"]) {
      database.prepare(`
        INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
        VALUES (?, ?, 'hash', 'member', 'active', ?, ?)
      `).run(id, id, NOW, NOW);
      database.prepare(`
        INSERT INTO files (
          id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
          storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
          checksum, state, revision, created_at, updated_at, activated_at,
          deleted_at, purged_at, recycle_group_id
        ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', 8, 'md5', ?,
          'active', 0, ?, ?, ?, NULL, NULL, NULL)
      `).run(`file-${id}`, `account:${id}`, id, `${id}.pdf`, `objects/${id}`, MD5, NOW, NOW, NOW);
    }
    database.prepare(`
      INSERT INTO files (
        id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
        storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
        checksum, state, revision, created_at, updated_at, activated_at,
        deleted_at, purged_at, recycle_group_id
      ) VALUES ('file-account-a-2', 'account:account-a', 'account-a', NULL,
        'account-a-2.pdf', 'memory', 'objects/account-a-2', 'application/pdf', 8,
        'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
    `).run(MD5, NOW, NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_records (
        id, owner_domain_id, created_by_account_id, label, created_at, updated_at
      ) VALUES ('record-a', 'account:account-a', 'account-a', 'Record A', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_artifacts (
        id, owner_domain_id, record_id, attachment_state, created_at, updated_at
      ) VALUES ('artifact-a', 'account:account-a', 'record-a', 'detached', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_artifact_versions (
        id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at
      ) VALUES ('version-a', 'account:account-a', 'artifact-a', 'file-account-a', ?, ?)
    `).run(NOW, NOW);
    database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = 'artifact-a'").run();

    assert.throws(() => database.prepare(`
      INSERT INTO scholarly_artifacts (
        id, owner_domain_id, record_id, attachment_state, created_at, updated_at
      ) VALUES ('cross-domain', 'account:account-b', 'record-a', 'detached', ?, ?)
    `).run(NOW, NOW), /FOREIGN KEY constraint failed/);
    assert.throws(() => database.prepare(`
      INSERT INTO scholarly_artifact_versions (
        id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at
      ) VALUES ('alias', 'account:account-a', 'artifact-a', 'file-account-a', ?, ?)
    `).run(NOW, NOW), /UNIQUE constraint failed/);
    assert.throws(
      () => database.prepare("UPDATE scholarly_artifact_versions SET stored_file_id = 'file-account-a-2' WHERE id = 'version-a'").run(),
      /scholarly artifact version file identity is immutable/,
    );
    assert.throws(
      () => database.prepare("UPDATE scholarly_artifact_versions SET stored_file_id = NULL WHERE id = 'version-a'").run(),
    );
    assert.equal(
      database.prepare<[], { stored_file_id: string }>(
        "SELECT stored_file_id FROM scholarly_artifact_versions WHERE id = 'version-a'",
      ).get()!.stored_file_id,
      "file-account-a",
    );
    assert.throws(
      () => database.prepare("UPDATE files SET state = 'purging' WHERE id = 'file-account-a'").run(),
      /stored file remains attached/,
    );
    assert.throws(
      () => database.prepare("DELETE FROM scholarly_records WHERE id = 'record-a'").run(),
      /scholarly record identity is retained/,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});
