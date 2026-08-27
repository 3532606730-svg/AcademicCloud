-- Evidence-usability hardening changes both the deterministic candidate
-- ruleset and the Qwen prompt. Preserve immutable v1 evidence while admitting
-- exact v2 provenance for new append-only runs.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE scholarly_bibliographic_ai_runs_v27 (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_domain_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  suggestion_run_id TEXT NOT NULL,
  contract_version INTEGER NOT NULL CHECK (contract_version = 1),
  ruleset_version TEXT NOT NULL CHECK (ruleset_version IN (
    'l1-intelligent-library01-v1',
    'l1-intelligent-library01-v2'
  )),
  status TEXT NOT NULL CHECK (status IN ('auto_apply', 'ambiguous', 'no_bibliography')),
  overall_confidence INTEGER NOT NULL CHECK (overall_confidence BETWEEN 0 AND 100),
  structured_output_json TEXT NOT NULL
    CHECK (length(structured_output_json) BETWEEN 2 AND 262144 AND json_valid(structured_output_json)),
  structured_output_sha256 TEXT NOT NULL
    CHECK (length(structured_output_sha256) = 64 AND structured_output_sha256 NOT GLOB '*[^a-f0-9]*'),
  prompt_version TEXT NOT NULL CHECK (prompt_version IN (
    'l1-intelligent-library01-prompt-v1',
    'l1-intelligent-library01-prompt-v2'
  )),
  ocr_engine_id TEXT NOT NULL CHECK (length(ocr_engine_id) BETWEEN 1 AND 1024),
  reasoning_engine_id TEXT NOT NULL CHECK (length(reasoning_engine_id) BETWEEN 1 AND 1024),
  selected_pages_json TEXT NOT NULL CHECK (length(selected_pages_json) BETWEEN 2 AND 256 AND json_valid(selected_pages_json)),
  auto_applied INTEGER NOT NULL CHECK (auto_applied IN (0, 1)),
  applied_fields_json TEXT NOT NULL CHECK (length(applied_fields_json) BETWEEN 2 AND 8192 AND json_valid(applied_fields_json)),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  UNIQUE (suggestion_run_id, owner_domain_id),
  FOREIGN KEY (record_id, owner_domain_id) REFERENCES scholarly_records(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
  FOREIGN KEY (suggestion_run_id, owner_domain_id)
    REFERENCES scholarly_metadata_suggestion_runs(id, owner_domain_id) ON DELETE RESTRICT,
  CHECK ((status = 'auto_apply' AND overall_confidence >= 85) OR status <> 'auto_apply'),
  CHECK ((auto_applied = 1 AND status = 'auto_apply') OR auto_applied = 0)
) STRICT;

INSERT INTO scholarly_bibliographic_ai_runs_v27 (
  id, owner_domain_id, record_id, file_id, suggestion_run_id,
  contract_version, ruleset_version, status, overall_confidence,
  structured_output_json, structured_output_sha256, prompt_version,
  ocr_engine_id, reasoning_engine_id, selected_pages_json, auto_applied,
  applied_fields_json, created_at
)
SELECT
  id, owner_domain_id, record_id, file_id, suggestion_run_id,
  contract_version, ruleset_version, status, overall_confidence,
  structured_output_json, structured_output_sha256, prompt_version,
  ocr_engine_id, reasoning_engine_id, selected_pages_json, auto_applied,
  applied_fields_json, created_at
FROM scholarly_bibliographic_ai_runs;

DROP TABLE scholarly_bibliographic_ai_runs;
ALTER TABLE scholarly_bibliographic_ai_runs_v27 RENAME TO scholarly_bibliographic_ai_runs;

CREATE INDEX scholarly_bibliographic_ai_runs_record_index
  ON scholarly_bibliographic_ai_runs(owner_domain_id, record_id, created_at, id);

CREATE TRIGGER scholarly_bibliographic_ai_runs_no_update
BEFORE UPDATE ON scholarly_bibliographic_ai_runs
BEGIN
  SELECT RAISE(ABORT, 'bibliographic AI evidence is immutable');
END;

CREATE TRIGGER scholarly_bibliographic_ai_runs_no_delete
BEFORE DELETE ON scholarly_bibliographic_ai_runs
BEGIN
  SELECT RAISE(ABORT, 'bibliographic AI evidence is retained');
END;
