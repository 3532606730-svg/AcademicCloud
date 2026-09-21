import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

test("037 backfills recorded activated identities without changing file rows and survives reopen", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-source-migration-"));
  const through37 = mkdtempSync(join(tmpdir(), "academiccloud-source-through37-"));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) if (Number(name.slice(0, 3)) <= 36) {
    copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) if (Number(name.slice(0, 3)) <= 37) {
    copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(through37, name));
  }
  context.after(() => rmSync(through37, { recursive: true, force: true }));
  const filename = join(directory, "before.sqlite");
  let database = openSqliteDatabase(filename);
  try {
    runMigrations(database, directory);
    database.prepare("INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at) VALUES ('owner', 'owner', 'hash', 'owner', 'active', '2026-09-15', '2026-09-15')").run();
    for (const state of ["deleted", "purging"]) database.prepare(`
      INSERT INTO recycle_groups (id, owner_domain_id, created_by_account_id, root_kind, root_id, folder_count, file_count, created_at)
      VALUES (?, 'account:owner', 'owner', 'file', ?, 0, 1, '2026-09-15')
    `).run(`recycle-${state}`, state);
    for (const state of ["active", "pending_upload", "deleted", "purging", "purged"] as const) database.prepare(`
      INSERT INTO files (id, owner_domain_id, uploaded_by_account_id, display_name, storage_provider, object_key,
        media_type, size_bytes, checksum_algorithm, checksum, state, revision, created_at, updated_at,
        activated_at, deleted_at, purged_at, recycle_group_id)
      VALUES (?, 'account:owner', 'owner', ?, 'memory', ?, 'application/pdf', 42, 'md5', 'AAAAAAAAAAAAAAAAAAAAAA==', ?, 8, '2026-09-15', '2026-09-15', ?, ?, ?, ?)
    `).run(state, `${state}.pdf`, `objects/${state}`, state,
      state !== "pending_upload" ? "2026-09-15" : null,
      ["deleted", "purging", "purged"].includes(state) ? "2026-09-15" : null,
      state === "purged" ? "2026-09-15" : null,
      ["deleted", "purging"].includes(state) ? `recycle-${state}` : null);
    const before = database.prepare("SELECT * FROM files ORDER BY id").all();
    assert.deepEqual(runMigrations(database, through37).appliedVersions, [37]);
    assert.deepEqual(database.prepare("SELECT * FROM files ORDER BY id").all(), before);
    const sources = database.prepare("SELECT * FROM document_sources ORDER BY file_id").all();
    assert.equal(sources.length, 4);
    assert.deepEqual(database.prepare("SELECT file_id FROM document_current_sources ORDER BY file_id").all(),
      ["active", "deleted", "purged", "purging"].map((file_id) => ({ file_id })));
    assert.equal(database.prepare<[], { n: number }>(`
      SELECT count(*) AS n FROM document_sources s JOIN files f ON f.id = s.file_id
      WHERE s.storage_provider = f.storage_provider AND s.object_key = f.object_key
        AND s.size_bytes = f.size_bytes AND s.checksum_algorithm = f.checksum_algorithm
        AND s.checksum = f.checksum AND s.recorded_at = f.updated_at
    `).get()!.n, 4);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(() => runMigrations(database, directory), /Applied migration 37 is missing/);
    database.close();
    database = openSqliteDatabase(filename);
    assert.deepEqual(database.prepare("SELECT * FROM document_sources ORDER BY file_id").all(), sources);
    assert.deepEqual(runMigrations(database, through37).appliedVersions, []);
    // Older code's ordinary activation is still captured by the database.
    database.prepare("UPDATE files SET state = 'active', activated_at = '2026-09-15' WHERE id = 'pending_upload'").run();
    assert.equal(database.prepare<[], { n: number }>("SELECT count(*) AS n FROM document_sources").get()!.n, 5);
  } finally { database.close(); }
});
