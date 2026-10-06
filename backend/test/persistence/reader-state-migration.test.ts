import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { SqliteWorkspaceRepository } from "../../src/persistence/sqlite/workspace-repository.js";
import { WorkspaceService } from "../../src/workspace/service.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

test("039 adds reader tables without changing existing data, and persists authored overlays through reopen", (context) => {
  const dir = mkdtempSync(join(tmpdir(), "academiccloud-reader-migration-"));
  context.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) if (Number(name.slice(0, 3)) <= 38) copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(dir, name));
  const filename = join(dir, "reader.sqlite"); let db = openSqliteDatabase(filename);
  try {
    runMigrations(db, dir); const persistence = new SqlitePersistence(db); const now = new Date("2026-09-24T01:00:00Z");
    persistence.repositories.accounts.create({ id: "owner", loginName: "owner", role: "owner", state: "active", passwordHash: "hash", createdAt: now, updatedAt: now });
    db.prepare("INSERT INTO files (id, owner_domain_id, uploaded_by_account_id, display_name, storage_provider, object_key, media_type, size_bytes, checksum_algorithm, checksum, state, revision, created_at, updated_at, activated_at) VALUES ('pdf', 'account:owner', 'owner', 'paper.pdf', 'memory', 'objects/reader', 'application/pdf', 42, 'md5', 'AAAAAAAAAAAAAAAAAAAAAA==', 'active', 9, ?, ?, ?)").run(now.toISOString(), now.toISOString(), now.toISOString());
    const source = persistence.repositories.files.findCurrentDocumentSource("pdf")!;
    db.prepare("INSERT INTO personal_reading_states (account_id, file_id, status, important, to_cite, revision, updated_at) VALUES ('owner', 'pdf', 'reading', 1, 0, 4, ?)").run(now.toISOString());
    const tables = db.prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name!='schema_migrations' ORDER BY name").all();
    const snapshots = tables.map(({ name }) => ({ name, rows: db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all() }));
    assert.deepEqual(runMigrations(db, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [39, 40, 41], currentVersion: 41 });
    for (const snapshot of snapshots) assert.deepEqual(db.prepare('SELECT * FROM "' + snapshot.name.replaceAll('"', '""') + '"').all(), snapshot.rows, snapshot.name);
    const service = new WorkspaceService(persistence, new SqliteWorkspaceRepository(db), () => now);
    service.saveProgress("owner", "pdf", { sourceId: source.sourceId, physicalPage: 14, revision: 0 });
    const highlight = service.createHighlight("owner", { resourceId: "pdf", sourceId: source.sourceId, physicalPage: 14, text: "retained excerpt", rects: [{ x: .1, y: .1, width: .3, height: .04 }], color: "yellow" });
    service.updateHighlight("owner", highlight.id, { revision: 1, deleted: true, color: "yellow" });
    const exported = [...service.exportLines("owner")];
    assert.throws(() => runMigrations(db, dir), /Applied migration 39 is missing/);
    db.close(); db = openSqliteDatabase(filename);
    assert.deepEqual(runMigrations(db, INITIAL_MIGRATIONS_DIRECTORY).appliedVersions, []);
    assert.deepEqual([...new WorkspaceService(new SqlitePersistence(db), new SqliteWorkspaceRepository(db), () => now).exportLines("owner")], exported);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally { db.close(); }
});
