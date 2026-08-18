import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test, type TestContext } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = "2026-08-18T14:00:00.000Z";

function pinnedDirectory(context: TestContext, version: number): string {
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-canonical-library-${version}-`));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(name.slice(0, 3)) <= version) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
    }
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function insertAccount(database: ReturnType<typeof openSqliteDatabase>, id: string, role: "owner" | "member", state: "active" | "disabled" = "active"): void {
  database.prepare(`
    INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
    VALUES (?, ?, 'hash', ?, ?, ?, ?)
  `).run(id, id, role, state, NOW, NOW);
}

function insertFile(
  database: ReturnType<typeof openSqliteDatabase>,
  id: string,
  state: "active" | "pending_upload",
  objectKey: string,
): void {
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (
      ?, 'account:member-a', 'member-a', 'folder-a', ?,
      'memory', ?, 'application/pdf', 12, 'md5',
      'AAAAAAAAAAAAAAAAAAAAAA==', ?, 0, ?, ?, ?,
      NULL, NULL, NULL
    )
  `).run(id, `${id}.pdf`, objectKey, state, NOW, NOW, state === "active" ? NOW : null);
}

test("migration 016 atomically establishes the canonical Library and preserves transition identity and private Favorites", (context) => {
  const directory = pinnedDirectory(context, 15);
  const database = openSqliteDatabase(join(directory, "from-v15.sqlite"));
  try {
    runMigrations(database, directory);
    insertAccount(database, "owner-a", "owner");
    insertAccount(database, "member-a", "member");
    database.prepare(`
      INSERT INTO folders (
        id, owner_domain_id, created_by_account_id, parent_id, name, state,
        created_at, updated_at, deleted_at, recycle_group_id
      ) VALUES ('folder-a', 'account:member-a', 'member-a', NULL, 'Sources', 'active', ?, ?, NULL, NULL)
    `).run(NOW, NOW);
    insertFile(database, "legacy-file", "active", "objects/le/legacy-file");
    insertFile(database, "identified-file", "active", "objects/id/identified-file");
    insertFile(database, "pending-file", "pending_upload", "objects/pe/pending-file");
    database.prepare("INSERT INTO favorite_files (account_id, file_id, created_at) VALUES ('member-a', 'legacy-file', ?)").run(NOW);

    database.prepare(`
      INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
      VALUES ('stable-record', 'account:member-a', 'member-a', 'Stable record', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
      VALUES ('stable-artifact', 'account:member-a', 'stable-record', 'detached', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
      VALUES ('stable-version', 'account:member-a', 'stable-artifact', 'identified-file', ?, ?)
    `).run(NOW, NOW);
    database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = 'stable-artifact'").run();

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [16, 17, 18],
      currentVersion: 18,
    });

    assert.deepEqual(database.prepare(`
      SELECT id, owner_domain_id, name, is_default
      FROM libraries WHERE is_default = 1
    `).get(), {
      id: "canonical-library",
      owner_domain_id: "library:canonical-library",
      name: "资料库",
      is_default: 1,
    });
    assert.deepEqual(database.prepare(`
      SELECT account_id, role FROM library_memberships
      WHERE library_id = 'canonical-library' ORDER BY account_id
    `).all(), [
      { account_id: "member-a", role: "member" },
      { account_id: "owner-a", role: "manager" },
    ]);

    assert.deepEqual(database.prepare(`
      SELECT id, owner_domain_id, uploaded_by_account_id, folder_id, object_key, checksum
      FROM files WHERE id IN ('identified-file', 'legacy-file') ORDER BY id
    `).all(), [
      {
        id: "identified-file",
        owner_domain_id: "library:canonical-library",
        uploaded_by_account_id: "member-a",
        folder_id: null,
        object_key: "objects/id/identified-file",
        checksum: "AAAAAAAAAAAAAAAAAAAAAA==",
      },
      {
        id: "legacy-file",
        owner_domain_id: "library:canonical-library",
        uploaded_by_account_id: "member-a",
        folder_id: null,
        object_key: "objects/le/legacy-file",
        checksum: "AAAAAAAAAAAAAAAAAAAAAA==",
      },
    ]);
    assert.deepEqual(database.prepare(`
      SELECT owner_domain_id, folder_id, state FROM files WHERE id = 'pending-file'
    `).get(), { owner_domain_id: "account:member-a", folder_id: "folder-a", state: "pending_upload" });
    assert.deepEqual(database.prepare(`
      SELECT id, owner_domain_id FROM scholarly_records WHERE id = 'stable-record'
    `).get(), { id: "stable-record", owner_domain_id: "library:canonical-library" });
    assert.deepEqual(database.prepare(`
      SELECT artifact_id, version_id FROM canonical_library_file_backfills WHERE file_id = 'legacy-file'
    `).get() !== undefined, true);
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM canonical_library_record_transitions").get()?.count, 2);
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM favorite_files WHERE account_id = 'member-a' AND file_id = 'legacy-file'").get()?.count, 1);
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_events WHERE action = 'libraries.corpus_transition'").get()?.count, 2);

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [], currentVersion: 18 });
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM canonical_library_record_transitions").get()?.count, 2);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()?.integrity_check, "ok");
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(
      () => database.prepare("DELETE FROM library_memberships WHERE library_id = 'canonical-library' AND account_id = 'member-a'").run(),
      /canonical Library membership is automatic/,
    );
  } finally {
    database.close();
  }
});

test("migration 016 fresh bootstrap and later activation converge without manual membership", (context) => {
  const database = openSqliteDatabase(join(pinnedDirectory(context, 16), "fresh.sqlite"));
  try {
    runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM libraries").get()?.count, 0);
    insertAccount(database, "owner-a", "owner");
    insertAccount(database, "member-a", "member");
    insertAccount(database, "member-disabled", "member", "disabled");
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM libraries WHERE is_default = 1").get()?.count, 1);
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM library_memberships WHERE library_id = 'canonical-library'").get()?.count, 2);
    database.prepare(`
      UPDATE accounts
      SET state = 'active', auth_revision = auth_revision + 1, updated_at = ?
      WHERE id = 'member-disabled'
    `).run(NOW);
    assert.deepEqual(database.prepare(`
      SELECT role FROM library_memberships
      WHERE library_id = 'canonical-library' AND account_id = 'member-disabled'
    `).get(), { role: "member" });
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});
