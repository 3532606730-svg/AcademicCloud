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
  const directory = mkdtempSync(join(tmpdir(), `academiccloud-announcements-v${version}-`));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(name.slice(0, 3)) <= version) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(directory, name));
    }
  }
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("migrations 008 through 015 preserve the Accounts I foundation", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-announcements-migration-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "migration.sqlite"));
  try {
    runMigrations(database, pinnedDirectory(context, 7));
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES ('owner-1', 'Owner', 'hash', 'owner', 'active', ?, ?)
    `).run(NOW, NOW);

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
      currentVersion: 26,
    });
    assert.deepEqual(database.prepare("SELECT id, role, state FROM accounts").all(), [
      { id: "owner-1", role: "owner", state: "active" },
    ]);
    assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='announcements'").get());
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally {
    database.close();
  }
});

test("migration 008 enforces content, publication, timestamp, creator, and safe-link constraints", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "academiccloud-announcements-constraints-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openSqliteDatabase(join(directory, "constraints.sqlite"));
  try {
    runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY);
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES ('owner-1', 'Owner', 'hash', 'owner', 'active', ?, ?)
    `).run(NOW, NOW);
    const insert = database.prepare(`
      INSERT INTO announcements (
        id, title, body, severity, link_url, is_active, published_at,
        expires_at, created_by_account_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    assert.throws(() => insert.run("bad-severity", "Title", "Body", "urgent", null, 0, null, null, "owner-1", NOW, NOW), /CHECK constraint/);
    assert.throws(() => insert.run("bad-title", " line\nbreak ", "Body", "info", null, 0, null, null, "owner-1", NOW, NOW), /CHECK constraint/);
    assert.throws(() => insert.run("bad-body", "Title", "   ", "info", null, 0, null, null, "owner-1", NOW, NOW), /CHECK constraint/);
    assert.throws(() => insert.run("bad-link", "Title", "Body", "info", "javascript:alert(1)", 0, null, null, "owner-1", NOW, NOW), /CHECK constraint/);
    assert.throws(() => insert.run("bad-active", "Title", "Body", "info", null, 1, null, null, "owner-1", NOW, NOW), /CHECK constraint/);
    assert.throws(() => insert.run("bad-creator", "Title", "Body", "info", null, 0, null, null, "unknown", NOW, NOW), /FOREIGN KEY constraint/);
    assert.throws(() => insert.run("bad-expiry", "Title", "Body", "info", null, 0, null, NOW, "owner-1", NOW, NOW), /CHECK constraint/);

    insert.run(
      "valid",
      "Scheduled maintenance",
      "Read-only access remains available.",
      "warning",
      "https://example.edu/status",
      1,
      NOW,
      "2026-08-18T10:00:00.000Z",
      "owner-1",
      NOW,
      NOW,
    );
    assert.deepEqual(database.prepare("SELECT id, severity, is_active FROM announcements").all(), [
      { id: "valid", severity: "warning", is_active: 1 },
    ]);
  } finally {
    database.close();
  }
});
