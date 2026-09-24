import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = new Date("2026-08-22T03:00:00.000Z");

test("migration 023 is additive, leaves historical metadata absent, and enforces exact contributor identity", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "academiccloud-intelligent-bibliography-"));
  const v22Directory = join(temporaryDirectory, "v22");
  mkdirSync(v22Directory);
  for (const filename of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(filename.slice(0, 3)) <= 22) copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename), join(v22Directory, filename));
  }
  const database = openSqliteDatabase(join(temporaryDirectory, "bibliography.sqlite"));
  try {
    assert.equal(runMigrations(database, v22Directory).currentVersion, 22);
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, auth_revision, state, created_at, updated_at)
      VALUES ('owner', 'owner', 'hash', 'owner', 0, 'active', ?, ?)
    `).run(NOW.toISOString(), NOW.toISOString());
    const library = database.prepare<[], { id: string; owner_domain_id: string }>(
      "SELECT id, owner_domain_id FROM libraries WHERE is_default = 1",
    ).get()!;
    database.prepare(`
      INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
      VALUES ('record-1', ?, 'owner', 'legacy record', ?, ?)
    `).run(library.owner_domain_id, NOW.toISOString(), NOW.toISOString());
    database.prepare(`
      INSERT INTO scholarly_record_metadata (
        record_id, owner_domain_id, material_type, canonical_title,
        created_by_account_id, updated_by_account_id, created_at, updated_at
      ) VALUES ('record-1', ?, 'book', '既有人工题名', 'owner', 'owner', ?, ?)
    `).run(library.owner_domain_id, NOW.toISOString(), NOW.toISOString());

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39], currentVersion: 39 });
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM scholarly_bibliographic_profiles").get()!.count, 0);
    assert.equal(database.prepare<[], { canonical_title: string }>("SELECT canonical_title FROM scholarly_record_metadata WHERE record_id = 'record-1'").get()!.canonical_title, "既有人工题名");

    const persistence = new SqlitePersistence(database);
    persistence.repositories.metadata.createAuthority({
      id: "person-chen", ownerDomainId: library.owner_domain_id, type: "person", canonicalLabel: "陈垣", aliases: ["援庵"],
      revision: 1, createdByAccountId: "owner", updatedByAccountId: "owner", createdAt: NOW, updatedAt: NOW,
    });
    const saved = persistence.repositories.bibliography.saveProfile({
      recordId: "record-1", ownerDomainId: library.owner_domain_id, actorAccountId: "owner", expectedRevision: null, now: NOW,
      materialClass: "traditional_book",
      contributors: [{ id: "contributor-1", label: "援庵", role: "collator", roleLabel: "点校", authorityId: "person-chen" }],
      publication: {}, carrierEdition: {},
      sourceEdition: { dynasty: "明", reignTitle: "万历", reignYear: "二十四年", editionType: "recut" },
    });
    assert.equal(saved?.contributors[0]?.authorityId, "person-chen");
    assert.throws(() => persistence.repositories.bibliography.saveProfile({
      ...saved!, expectedRevision: saved!.revision, actorAccountId: "owner", now: NOW,
      contributors: [{ id: "contributor-1", label: "陈垣先生", role: "collator", authorityId: "person-chen" }],
    }), /exact person label or alias match/);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()!.integrity_check, "ok");
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
