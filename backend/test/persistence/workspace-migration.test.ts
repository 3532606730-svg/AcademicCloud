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

test("038–039 only add overlay tables, preserves existing Core rows and retains private state through reopen", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-workspace-migration-"));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) if (Number(name.slice(0, 3)) <= 37) {
    copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "upgrade.sqlite");
  let database = openSqliteDatabase(filename);
  try {
    runMigrations(database, directory);
    const persistence = new SqlitePersistence(database);
    const now = new Date("2026-09-15T10:00:00Z");
    persistence.repositories.accounts.create({ id: "upgrade-owner", loginName: "upgrade-owner", role: "owner", state: "active", passwordHash: "hash", createdAt: now, updatedAt: now });
    database.prepare(`INSERT INTO files (id, owner_domain_id, uploaded_by_account_id, display_name, storage_provider, object_key,
      media_type, size_bytes, checksum_algorithm, checksum, state, revision, created_at, updated_at, activated_at)
      VALUES ('upgrade-pdf', 'account:upgrade-owner', 'upgrade-owner', 'paper.pdf', 'memory', 'objects/upgrade', 'application/pdf', 42,
        'md5', 'AAAAAAAAAAAAAAAAAAAAAA==', 'active', 9, ?, ?, ?)`).run(now.toISOString(), now.toISOString(), now.toISOString());
    const tables = database.prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'schema_migrations' ORDER BY name").all();
    const snapshots = tables.map(({ name }) => ({ name, rows: database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all() }));
    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY).appliedVersions, [38, 39, 40, 41]);
    for (const snapshot of snapshots) assert.deepEqual(database.prepare(`SELECT * FROM "${snapshot.name.replaceAll('"', '""')}"`).all(), snapshot.rows, snapshot.name);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    const workspace = new WorkspaceService(persistence, new SqliteWorkspaceRepository(database), () => now);
    const source = persistence.repositories.files.findCurrentDocumentSource("upgrade-pdf")!;
    let collection = workspace.createCollection("upgrade-owner", "Preserved collection");
    collection = workspace.setCollectionItem("upgrade-owner", collection.id, "upgrade-pdf", true, collection.revision);
    workspace.saveReading("upgrade-owner", "upgrade-pdf", { status: "reading", important: true, toCite: false, revision: 0 });
    const note = workspace.createNote("upgrade-owner", { resourceId: source.resourceId, sourceId: source.sourceId, physicalPage: 11, locator: "葉十", body: "Preserved authored text" });
    workspace.updateNote("upgrade-owner", note.id, { locator: note.locator, body: note.body, deleted: true, revision: 1 });
    workspace.updateCollection("upgrade-owner", collection.id, { name: collection.name, archived: true, revision: collection.revision });
    const exported = [...workspace.exportLines("upgrade-owner")];
    assert.throws(() => runMigrations(database, directory), /Applied migration 38 is missing/);
    database.close();
    database = openSqliteDatabase(filename);
    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY).appliedVersions, []);
    const reopened = new WorkspaceService(new SqlitePersistence(database), new SqliteWorkspaceRepository(database), () => now);
    assert.deepEqual([...reopened.exportLines("upgrade-owner")], exported);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally { database.close(); }
});
