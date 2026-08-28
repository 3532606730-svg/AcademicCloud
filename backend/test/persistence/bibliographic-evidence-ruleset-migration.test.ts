import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = "2026-08-27T12:00:00.000Z";

test("migrations 027-030 preserve immutable v1-v4 AI evidence and admit exact v5 provenance", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "academiccloud-bibliography-ruleset-v2-"));
  const v26Directory = join(temporaryDirectory, "v26");
  const v27Directory = join(temporaryDirectory, "v27");
  const v28Directory = join(temporaryDirectory, "v28");
  const v29Directory = join(temporaryDirectory, "v29");
  mkdirSync(v26Directory);
  mkdirSync(v27Directory);
  mkdirSync(v28Directory);
  mkdirSync(v29Directory);
  for (const filename of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    if (Number(filename.slice(0, 3)) <= 26) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename), join(v26Directory, filename));
    }
    if (Number(filename.slice(0, 3)) <= 27) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename), join(v27Directory, filename));
    }
    if (Number(filename.slice(0, 3)) <= 28) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename), join(v28Directory, filename));
    }
    if (Number(filename.slice(0, 3)) <= 29) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename), join(v29Directory, filename));
    }
  }
  const database = openSqliteDatabase(join(temporaryDirectory, "ruleset.sqlite"));
  try {
    assert.equal(runMigrations(database, v26Directory).currentVersion, 26);
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

    const insertSuggestionRun = database.prepare(`
      INSERT INTO scholarly_metadata_suggestion_runs (
        id, owner_domain_id, library_id, record_id, file_id, status,
        ruleset_version, source_version, source_file_revision,
        source_checksum_algorithm, source_checksum, first_pages, last_pages,
        page_count, page_indices, window_complete, created_by_account_id, created_at
      ) VALUES (
        ?, 'library:canonical-library', 'canonical-library', 'record-1', 'file-1', 'ready',
        ?, ?, 0, 'sha256', 'fixture-checksum', 15, 5,
        1, '[1]', 1, 'owner', ?
      )
    `);
    insertSuggestionRun.run("suggestion-v1", "rf-frontmatterocr-v1", "v1-source", NOW);
    database.prepare(`
      INSERT INTO scholarly_bibliographic_ai_runs (
        id, owner_domain_id, record_id, file_id, suggestion_run_id,
        contract_version, ruleset_version, status, overall_confidence,
        structured_output_json, structured_output_sha256, prompt_version,
        ocr_engine_id, reasoning_engine_id, selected_pages_json, auto_applied,
        applied_fields_json, created_at
      ) VALUES (
        'ai-v1', 'library:canonical-library', 'record-1', 'file-1', 'suggestion-v1',
        1, 'l1-intelligent-library01-v1', 'ambiguous', 70,
        '{}', ?, 'l1-intelligent-library01-prompt-v1',
        'PaddleOCR/v1', 'Qwen3/v1', '[1]', 0, '[]', ?
      )
    `).run("a".repeat(64), NOW);

    assert.deepEqual(runMigrations(database, v27Directory), {
      appliedVersions: [27], currentVersion: 27,
    });
    assert.deepEqual(database.prepare<[], { ruleset_version: string; prompt_version: string }>(`
      SELECT ruleset_version, prompt_version FROM scholarly_bibliographic_ai_runs WHERE id = 'ai-v1'
    `).get(), {
      ruleset_version: "l1-intelligent-library01-v1",
      prompt_version: "l1-intelligent-library01-prompt-v1",
    });

    insertSuggestionRun.run("suggestion-v2", "rf-frontmatterocr-v2", "v2-source", NOW);
    const insertV2 = database.prepare(`
      INSERT INTO scholarly_bibliographic_ai_runs (
        id, owner_domain_id, record_id, file_id, suggestion_run_id,
        contract_version, ruleset_version, status, overall_confidence,
        structured_output_json, structured_output_sha256, prompt_version,
        ocr_engine_id, reasoning_engine_id, selected_pages_json, auto_applied,
        applied_fields_json, created_at
      ) VALUES (
        ?, 'library:canonical-library', 'record-1', 'file-1', 'suggestion-v2',
        1, ?, 'ambiguous', 70, '{}', ?, ?,
        'PaddleOCR/v2', 'Qwen3/v2', '[1]', 0, '[]', ?
      )
    `);
    insertV2.run(
      "ai-v2", "l1-intelligent-library01-v2", "b".repeat(64),
      "l1-intelligent-library01-prompt-v2", NOW,
    );
    assert.throws(() => insertV2.run(
      "ai-v3", "l1-intelligent-library01-v3", "c".repeat(64),
      "l1-intelligent-library01-prompt-v3", NOW,
    ), /CHECK constraint failed/u);

    assert.deepEqual(runMigrations(database, v28Directory), {
      appliedVersions: [28], currentVersion: 28,
    });
    assert.deepEqual(database.prepare<[], { id: string; ruleset_version: string; prompt_version: string }>(`
      SELECT id, ruleset_version, prompt_version
        FROM scholarly_bibliographic_ai_runs
       ORDER BY id
    `).all(), [{
      id: "ai-v1",
      ruleset_version: "l1-intelligent-library01-v1",
      prompt_version: "l1-intelligent-library01-prompt-v1",
    }, {
      id: "ai-v2",
      ruleset_version: "l1-intelligent-library01-v2",
      prompt_version: "l1-intelligent-library01-prompt-v2",
    }]);
    insertSuggestionRun.run("suggestion-v3", "rf-frontmatterocr-v2", "v3-source", NOW);
    database.prepare(`
      INSERT INTO scholarly_bibliographic_ai_runs (
        id, owner_domain_id, record_id, file_id, suggestion_run_id,
        contract_version, ruleset_version, status, overall_confidence,
        structured_output_json, structured_output_sha256, prompt_version,
        ocr_engine_id, reasoning_engine_id, selected_pages_json, auto_applied,
        applied_fields_json, created_at
      ) VALUES (
        'ai-v3', 'library:canonical-library', 'record-1', 'file-1', 'suggestion-v3',
        1, 'l1-intelligent-library01-v3', 'ambiguous', 70,
        '{}', ?, 'l1-intelligent-library01-prompt-v3',
        'PaddleOCR/v3', 'Qwen3/v3', '[1]', 0, '[]', ?
      )
    `).run("c".repeat(64), NOW);
    insertSuggestionRun.run("suggestion-v4", "rf-frontmatterocr-v2", "v4-source", NOW);
    const insertV4 = database.prepare(`
      INSERT INTO scholarly_bibliographic_ai_runs (
        id, owner_domain_id, record_id, file_id, suggestion_run_id,
        contract_version, ruleset_version, status, overall_confidence,
        structured_output_json, structured_output_sha256, prompt_version,
        ocr_engine_id, reasoning_engine_id, selected_pages_json, auto_applied,
        applied_fields_json, created_at
      ) VALUES (
        'ai-v4', 'library:canonical-library', 'record-1', 'file-1', 'suggestion-v4',
        1, 'l1-intelligent-library01-v4', 'ambiguous', 70,
        '{}', ?, 'l1-intelligent-library01-prompt-v3',
        'PaddleOCR/v4', 'Qwen3/v4', '[1]', 0, '[]', ?
      )
    `);
    assert.throws(() => insertV4.run("d".repeat(64), NOW), /CHECK constraint failed/u);

    assert.deepEqual(runMigrations(database, v29Directory), {
      appliedVersions: [29], currentVersion: 29,
    });
    insertV4.run("d".repeat(64), NOW);
    insertSuggestionRun.run("suggestion-v5", "rf-frontmatterocr-v2", "v5-source", NOW);
    const insertV5 = database.prepare(`
      INSERT INTO scholarly_bibliographic_ai_runs (
        id, owner_domain_id, record_id, file_id, suggestion_run_id,
        contract_version, ruleset_version, status, overall_confidence,
        structured_output_json, structured_output_sha256, prompt_version,
        ocr_engine_id, reasoning_engine_id, selected_pages_json, auto_applied,
        applied_fields_json, created_at
      ) VALUES (
        'ai-v5', 'library:canonical-library', 'record-1', 'file-1', 'suggestion-v5',
        1, 'l1-intelligent-library01-v5', 'ambiguous', 70,
        '{}', ?, 'l1-intelligent-library01-prompt-v3',
        'PaddleOCR/v5', 'Qwen3/v5', '[1]', 0, '[]', ?
      )
    `);
    assert.throws(() => insertV5.run("e".repeat(64), NOW), /CHECK constraint failed/u);

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [30], currentVersion: 30,
    });
    insertV5.run("e".repeat(64), NOW);
    assert.deepEqual(database.prepare<[], { id: string; ruleset_version: string; prompt_version: string }>(`
      SELECT id, ruleset_version, prompt_version
        FROM scholarly_bibliographic_ai_runs
       ORDER BY id
    `).all(), [{
      id: "ai-v1",
      ruleset_version: "l1-intelligent-library01-v1",
      prompt_version: "l1-intelligent-library01-prompt-v1",
    }, {
      id: "ai-v2",
      ruleset_version: "l1-intelligent-library01-v2",
      prompt_version: "l1-intelligent-library01-prompt-v2",
    }, {
      id: "ai-v3",
      ruleset_version: "l1-intelligent-library01-v3",
      prompt_version: "l1-intelligent-library01-prompt-v3",
    }, {
      id: "ai-v4",
      ruleset_version: "l1-intelligent-library01-v4",
      prompt_version: "l1-intelligent-library01-prompt-v3",
    }, {
      id: "ai-v5",
      ruleset_version: "l1-intelligent-library01-v5",
      prompt_version: "l1-intelligent-library01-prompt-v3",
    }]);
    assert.throws(
      () => database.prepare("UPDATE scholarly_bibliographic_ai_runs SET overall_confidence = 71 WHERE id = 'ai-v1'").run(),
      /bibliographic AI evidence is immutable/u,
    );
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()!.integrity_check, "ok");
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
