import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqliteSuggestionRepository } from "../../src/persistence/sqlite/suggestion-repository.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = "2026-08-19T00:00:00.000Z";

test("migration 020 preserves legacy evidence truth and enforces prospective OCR provenance", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "academiccloud-ocr-provenance-"));
  const v19Directory = join(temporaryDirectory, "v19");
  mkdirSync(v19Directory);
  for (const filename of readdirSync(INITIAL_MIGRATIONS_DIRECTORY).filter((name) => /^0(?:0[1-9]|1[0-9])_/u.test(name))) {
    copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename), join(v19Directory, filename));
  }
  const database = openSqliteDatabase(join(temporaryDirectory, "provenance.sqlite"));
  try {
    assert.equal(runMigrations(database, v19Directory).currentVersion, 19);
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, auth_revision, state, created_at, updated_at)
      VALUES ('owner', 'owner', 'test', 'owner', 0, 'active', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO files (
        id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
        storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
        checksum, state, revision, created_at, updated_at, activated_at,
        deleted_at, purged_at, recycle_group_id
      ) VALUES (
        'file-1', 'library:canonical-library', 'owner', NULL, 'fixture.pdf',
        'memory', ?, 'application/pdf', 42, 'sha256', 'fixture-checksum',
        'active', 0, ?, ?, ?, NULL, NULL, NULL
      )
    `).run(`objects/aa/${"b".repeat(62)}`, NOW, NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
      VALUES ('record-1', 'library:canonical-library', 'owner', 'fixture', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
      VALUES ('artifact-1', 'library:canonical-library', 'record-1', 'detached', ?, ?)
    `).run(NOW, NOW);
    database.prepare(`
      INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
      VALUES ('version-1', 'library:canonical-library', 'artifact-1', 'file-1', ?, ?)
    `).run(NOW, NOW);
    database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = 'artifact-1'").run();
    database.prepare(`
      INSERT INTO scholarly_metadata_suggestion_runs (
        id, owner_domain_id, library_id, record_id, file_id, status,
        ruleset_version, source_version, source_file_revision,
        source_checksum_algorithm, source_checksum, first_pages, last_pages,
        page_count, page_indices, window_complete, created_by_account_id, created_at
      ) VALUES (
        'legacy-run', 'library:canonical-library', 'canonical-library', 'record-1', 'file-1', 'ready',
        'rf-metasuggest-v1', ?, 0, 'sha256', 'fixture-checksum', 15, 5,
        1, '[1]', 1, 'owner', ?
      )
    `).run("s".repeat(43), NOW);
    const insertLegacyCandidate = database.prepare(`
      INSERT INTO scholarly_metadata_suggestion_candidates (
        id, run_id, owner_domain_id, position, field_path, value, source_type,
        source_page_index, page_class, confidence, precedence_rank,
        evidence_excerpt, ruleset_version
      ) VALUES (?, 'legacy-run', 'library:canonical-library', ?, 'canonicalTitle', ?, ?, ?, ?, 'medium', 10, ?, 'rf-metasuggest-v1')
    `);
    insertLegacyCandidate.run("legacy-run:0", 0, "Native title", "title_page", 1, "title_page", "Native title");
    insertLegacyCandidate.run("legacy-run:1", 1, "Embedded title", "embedded_pdf_metadata", null, null, "Embedded title");

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [20], currentVersion: 20 });
    assert.deepEqual(
      database.prepare<[], { evidence_origin: string; ocr_engine: string | null; ocr_confidence: number | null }>(`
        SELECT evidence_origin, ocr_engine, ocr_confidence
        FROM scholarly_metadata_suggestion_candidates ORDER BY position
      `).all(),
      [
        { evidence_origin: "legacy_v1", ocr_engine: null, ocr_confidence: null },
        { evidence_origin: "legacy_v1", ocr_engine: null, ocr_confidence: null },
      ],
    );
    const legacy = new SqliteSuggestionRepository(database).findRun("library:canonical-library", "legacy-run")!;
    assert.deepEqual(legacy.candidates.map((candidate) => candidate.evidenceOrigin), ["native_text", "embedded_pdf_metadata"]);
    assert.throws(() => database.prepare(`
      INSERT INTO scholarly_metadata_suggestion_candidates (
        id, run_id, owner_domain_id, position, field_path, value, source_type,
        source_page_index, page_class, confidence, precedence_rank,
        evidence_excerpt, ruleset_version
      ) VALUES (
        'legacy-run:2', 'legacy-run', 'library:canonical-library', 2,
        'canonicalTitle', 'Unmarked new evidence', 'title_page', 1,
        'title_page', 'medium', 10, 'Unmarked', 'rf-frontmatterocr-v1'
      )
    `).run(), /invalid suggestion evidence provenance/);
    assert.throws(() => database.prepare(`
      INSERT INTO scholarly_metadata_suggestion_candidates (
        id, run_id, owner_domain_id, position, field_path, value, source_type,
        source_page_index, page_class, confidence, precedence_rank,
        evidence_excerpt, evidence_origin, ocr_engine, ocr_confidence, ruleset_version
      ) VALUES (
        'legacy-run:3', 'legacy-run', 'library:canonical-library', 3,
        'canonicalTitle', 'Unscored OCR', 'title_page', 1,
        'title_page', 'low', 10, 'Unscored', 'ocr', NULL, NULL, 'rf-frontmatterocr-v1'
      )
    `).run(), /invalid suggestion evidence provenance/);
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()?.integrity_check, "ok");
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
