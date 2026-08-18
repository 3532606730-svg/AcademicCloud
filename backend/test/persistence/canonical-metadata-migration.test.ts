import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = "2026-08-18T12:00:00.000Z";

test("migration 018 upgrades v17 additively and preserves accepted filename, physical identity, lineage, provenance, and private overlay", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "academiccloud-metadata-migration-"));
  const v17Directory = join(temporaryDirectory, "v17");
  mkdirSync(v17Directory);
  for (const filename of readdirSync(INITIAL_MIGRATIONS_DIRECTORY).filter((name) => /^0(?:0[1-9]|1[0-7])_/.test(name))) {
    copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename), join(v17Directory, filename));
  }
  const database = openSqliteDatabase(join(temporaryDirectory, "metadata.sqlite"));
  try {
    assert.equal(runMigrations(database, v17Directory).currentVersion, 17);
    database.prepare(`
      INSERT INTO accounts (
        id, login_name, password_hash, role, auth_revision, state,
        created_at, updated_at, archived_at
      ) VALUES ('owner', 'owner', 'test', 'owner', 0, 'active', ?, ?, NULL)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO accounts (
        id, login_name, password_hash, role, auth_revision, state,
        created_at, updated_at, archived_at
      ) VALUES ('member', 'member', 'test', 'member', 0, 'active', ?, ?, NULL)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO files (
        id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
        storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
        checksum, state, revision, created_at, updated_at, activated_at,
        deleted_at, purged_at, recycle_group_id
      ) VALUES (
        'file-1', 'library:canonical-library', 'member', NULL,
        'accepted acquisition filename.pdf', 'memory', ?, 'application/pdf',
        42, 'md5', '1B2M2Y8AsgTpgAmY7PhCfg==', 'active', 0,
        ?, ?, ?, NULL, NULL, NULL
      )
    `).run(`objects/aa/${"b".repeat(62)}`, NOW, NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_records (
        id, owner_domain_id, created_by_account_id, label, created_at, updated_at
      ) VALUES ('record-1', 'library:canonical-library', 'member', 'legacy record label', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_artifacts (
        id, owner_domain_id, record_id, attachment_state, created_at, updated_at
      ) VALUES ('artifact-1', 'library:canonical-library', 'record-1', 'detached', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_artifact_versions (
        id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at
      ) VALUES ('version-1', 'library:canonical-library', 'artifact-1', 'file-1', ?, ?)
    `).run(NOW, NOW);
    database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = 'artifact-1'").run();
    database.prepare("INSERT INTO favorite_files (account_id, file_id, created_at) VALUES ('member', 'file-1', ?)").run(NOW);

    const before = database.prepare(`
      SELECT files.id AS file_id, files.owner_domain_id, files.uploaded_by_account_id,
        files.display_name, files.object_key, files.checksum_algorithm, files.checksum,
        scholarly_records.id AS record_id, scholarly_records.created_by_account_id,
        scholarly_records.label, scholarly_artifacts.id AS artifact_id,
        scholarly_artifact_versions.id AS version_id,
        scholarly_artifact_versions.stored_file_id,
        favorite_files.account_id AS favorite_account_id
      FROM files
      JOIN scholarly_artifact_versions ON scholarly_artifact_versions.stored_file_id = files.id
      JOIN scholarly_artifacts ON scholarly_artifacts.id = scholarly_artifact_versions.artifact_id
      JOIN scholarly_records ON scholarly_records.id = scholarly_artifacts.record_id
      JOIN favorite_files ON favorite_files.file_id = files.id
      WHERE files.id = 'file-1'
    `).get();

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [18, 19, 20], currentVersion: 20 });
    const after = database.prepare(`
      SELECT files.id AS file_id, files.owner_domain_id, files.uploaded_by_account_id,
        files.display_name, files.object_key, files.checksum_algorithm, files.checksum,
        scholarly_records.id AS record_id, scholarly_records.created_by_account_id,
        scholarly_records.label, scholarly_artifacts.id AS artifact_id,
        scholarly_artifact_versions.id AS version_id,
        scholarly_artifact_versions.stored_file_id,
        favorite_files.account_id AS favorite_account_id
      FROM files
      JOIN scholarly_artifact_versions ON scholarly_artifact_versions.stored_file_id = files.id
      JOIN scholarly_artifacts ON scholarly_artifacts.id = scholarly_artifact_versions.artifact_id
      JOIN scholarly_records ON scholarly_records.id = scholarly_artifacts.record_id
      JOIN favorite_files ON favorite_files.file_id = files.id
      WHERE files.id = 'file-1'
    `).get();
    assert.deepEqual(after, before);
    assert.deepEqual(database.prepare<[], { metadata: number; authorities: number }>(`
      SELECT
        (SELECT count(*) FROM scholarly_record_metadata) AS metadata,
        (SELECT count(*) FROM scholarly_authorities) AS authorities
    `).get(), { metadata: 0, authorities: 0 });
    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [], currentVersion: 20 });

    database.prepare(`
      INSERT INTO scholarly_record_metadata (
        record_id, owner_domain_id, material_type, canonical_title,
        created_by_account_id, updated_by_account_id, created_at, updated_at
      ) VALUES (
        'record-1', 'library:canonical-library', 'book', 'Canonical title',
        'owner', 'owner', ?, ?
      )
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_record_type_fields (
        record_id, owner_domain_id, field_name, value
      ) VALUES ('record-1', 'library:canonical-library', 'edition_statement', 'First edition')
    `).run();
    assert.throws(
      () => database.prepare(`
        INSERT INTO scholarly_record_type_fields (
          record_id, owner_domain_id, field_name, value
        ) VALUES ('record-1', 'library:canonical-library', 'locator', '1-10')
      `).run(),
      /invalid material type field/,
    );
    assert.throws(
      () => database.prepare("UPDATE scholarly_record_metadata SET material_type = 'article' WHERE record_id = 'record-1'").run(),
      /requires cleared type fields/,
    );
    assert.throws(
      () => database.prepare(`
        INSERT INTO scholarly_record_alternative_titles (
          record_id, owner_domain_id, position, title
        ) VALUES ('record-1', 'library:canonical-library', 8, 'too many')
      `).run(),
      /CHECK constraint failed/,
    );

    database.prepare(`
      INSERT INTO scholarly_authorities (
        id, owner_domain_id, authority_type, canonical_label, revision,
        created_by_account_id, updated_by_account_id, created_at, updated_at
      ) VALUES (
        'person-1', 'library:canonical-library', 'person', 'Person', 1,
        'owner', 'owner', ?, ?
      )
    `).run(NOW, NOW);
    assert.throws(
      () => database.prepare(`
        INSERT INTO scholarly_record_authority_links (
          record_id, owner_domain_id, position, authority_id, role
        ) VALUES ('record-1', 'library:canonical-library', 0, 'person-1', 'publisher')
      `).run(),
      /incompatible with authority type/,
    );
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()?.integrity_check, "ok");
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
