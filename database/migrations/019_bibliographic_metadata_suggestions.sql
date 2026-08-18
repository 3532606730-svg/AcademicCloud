-- RF-METASUGGEST01 records bounded, deterministic bibliographic suggestion
-- runs.  The rows retain only review evidence (source/page/class/confidence)
-- and never retain PDF bytes, raw page text, object keys, or private overlay
-- state.  Canonical metadata is unchanged until an explicit manager accepts
-- it through the RF-META01 service boundary.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE scholarly_metadata_suggestion_runs (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_domain_id TEXT NOT NULL,
  library_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN (
      'ready', 'ambiguous', 'no_suggestions', 'ocr_deferred',
      'unsupported', 'stale', 'accepted'
    )),
  ruleset_version TEXT NOT NULL
    CHECK (length(ruleset_version) BETWEEN 1 AND 128 AND ruleset_version = trim(ruleset_version)),
  source_version TEXT NOT NULL
    CHECK (length(source_version) BETWEEN 1 AND 255 AND source_version = trim(source_version)),
  source_file_revision INTEGER NOT NULL CHECK (source_file_revision >= 0),
  source_checksum_algorithm TEXT,
  source_checksum TEXT,
  first_pages INTEGER NOT NULL CHECK (first_pages = 15),
  last_pages INTEGER NOT NULL CHECK (last_pages = 5),
  page_count INTEGER CHECK (page_count IS NULL OR page_count >= 0),
  page_indices TEXT NOT NULL CHECK (length(page_indices) > 0 AND json_valid(page_indices)),
  window_complete INTEGER NOT NULL CHECK (window_complete IN (0, 1)),
  created_by_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  UNIQUE (id, owner_domain_id),
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE RESTRICT,
  FOREIGN KEY (record_id, owner_domain_id)
    REFERENCES scholarly_records(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_metadata_suggestion_candidates (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 192 AND id = trim(id)),
  run_id TEXT NOT NULL,
  owner_domain_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0 AND position <= 255),
  field_path TEXT NOT NULL
    CHECK (field_path IN ('canonicalTitle', 'subtitle', 'dateStatement', 'identifier', 'typeField', 'authority')),
  type_field_name TEXT,
  authority_type TEXT,
  authority_role TEXT,
  identifier_scheme TEXT,
  value TEXT NOT NULL
    CHECK (
      length(value) BETWEEN 1 AND 512
      AND value = trim(value)
      AND instr(value, char(0)) = 0
      AND instr(value, char(9)) = 0
      AND instr(value, char(10)) = 0
      AND instr(value, char(13)) = 0
    ),
  source_type TEXT NOT NULL
    CHECK (source_type IN (
      'title_page', 'copyright_page', 'cip_page', 'colophon',
      'series_page', 'embedded_pdf_metadata', 'filename'
    )),
  source_page_index INTEGER CHECK (source_page_index IS NULL OR source_page_index >= 1),
  page_class TEXT CHECK (page_class IS NULL OR page_class IN (
    'cover', 'half_title', 'title_page', 'copyright_page', 'cip_page',
    'colophon', 'series_page', 'contents_preface', 'ordinary_body', 'unknown'
  )),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  precedence_rank INTEGER NOT NULL CHECK (precedence_rank >= 0 AND precedence_rank <= 255),
  evidence_excerpt TEXT
    CHECK (
      evidence_excerpt IS NULL OR (
        length(evidence_excerpt) BETWEEN 1 AND 512
        AND evidence_excerpt = trim(evidence_excerpt)
        AND instr(evidence_excerpt, char(0)) = 0
        AND instr(evidence_excerpt, char(9)) = 0
        AND instr(evidence_excerpt, char(10)) = 0
        AND instr(evidence_excerpt, char(13)) = 0
      )
    ),
  ruleset_version TEXT NOT NULL
    CHECK (length(ruleset_version) BETWEEN 1 AND 128 AND ruleset_version = trim(ruleset_version)),
  CHECK (type_field_name IS NULL OR type_field_name IN (
    'editionStatement', 'volumeStatement', 'issueStatement', 'locator',
    'shelfmark', 'supportStatement', 'extentStatement', 'scriptStatement',
    'objectType', 'materialStatement', 'dimensionsStatement', 'documentType',
    'fondsOrCollection', 'seriesStatement', 'referenceCode'
  )),
  CHECK (authority_type IS NULL OR authority_type IN ('person', 'place', 'language', 'work', 'institution')),
  CHECK (authority_role IS NULL OR authority_role IN (
    'author', 'editor', 'translator', 'compiler', 'scribe', 'sender',
    'recipient', 'creator', 'contributor', 'publication_place',
    'creation_place', 'discovery_place', 'content_language',
    'original_language', 'container_work', 'series_work', 'source_work',
    'publisher', 'holding_institution', 'issuing_body'
  )),
  CHECK (field_path = 'typeField' OR type_field_name IS NULL),
  CHECK (field_path = 'authority' OR (authority_type IS NULL AND authority_role IS NULL)),
  CHECK (field_path = 'identifier' OR identifier_scheme IS NULL),
  UNIQUE (run_id, position),
  UNIQUE (run_id, id),
  FOREIGN KEY (run_id, owner_domain_id)
    REFERENCES scholarly_metadata_suggestion_runs(id, owner_domain_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX scholarly_metadata_suggestion_runs_holding_index
  ON scholarly_metadata_suggestion_runs(owner_domain_id, library_id, file_id, created_at DESC, id DESC);

CREATE INDEX scholarly_metadata_suggestion_candidates_run_index
  ON scholarly_metadata_suggestion_candidates(owner_domain_id, run_id, position);

-- A run belongs to exactly one Library-domain Record and its active physical
-- file/version.  This guard prevents a caller from persisting evidence for a
-- different ownership domain or an unrelated Record/file pair.
CREATE TRIGGER scholarly_metadata_suggestion_runs_domain_guard_insert
BEFORE INSERT ON scholarly_metadata_suggestion_runs
WHEN NOT EXISTS (
  SELECT 1
  FROM libraries
  JOIN scholarly_records
    ON scholarly_records.id = NEW.record_id
   AND scholarly_records.owner_domain_id = NEW.owner_domain_id
  JOIN scholarly_artifacts
    ON scholarly_artifacts.record_id = scholarly_records.id
   AND scholarly_artifacts.owner_domain_id = scholarly_records.owner_domain_id
  JOIN scholarly_artifact_versions
    ON scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
   AND scholarly_artifact_versions.owner_domain_id = scholarly_artifacts.owner_domain_id
   AND scholarly_artifact_versions.stored_file_id = NEW.file_id
  JOIN files ON files.id = NEW.file_id
   AND files.owner_domain_id = NEW.owner_domain_id
   AND files.state = 'active'
  WHERE libraries.id = NEW.library_id
    AND libraries.owner_domain_id = NEW.owner_domain_id
)
BEGIN
  SELECT RAISE(ABORT, 'suggestion run requires an active same-domain Library holding');
END;

CREATE TRIGGER scholarly_metadata_suggestion_runs_identity_immutable
BEFORE UPDATE OF id, owner_domain_id, library_id, record_id, file_id,
  ruleset_version, source_version, source_file_revision,
  source_checksum_algorithm, source_checksum, first_pages, last_pages,
  page_count, page_indices, window_complete, created_by_account_id, created_at
ON scholarly_metadata_suggestion_runs
WHEN NEW.id <> OLD.id
  OR NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.library_id <> OLD.library_id
  OR NEW.record_id <> OLD.record_id
  OR NEW.file_id <> OLD.file_id
  OR NEW.ruleset_version <> OLD.ruleset_version
  OR NEW.source_version <> OLD.source_version
  OR NEW.source_file_revision <> OLD.source_file_revision
  OR NEW.source_checksum_algorithm IS NOT OLD.source_checksum_algorithm
  OR NEW.source_checksum IS NOT OLD.source_checksum
  OR NEW.first_pages <> OLD.first_pages
  OR NEW.last_pages <> OLD.last_pages
  OR NEW.page_count IS NOT OLD.page_count
  OR NEW.page_indices <> OLD.page_indices
  OR NEW.window_complete <> OLD.window_complete
  OR NEW.created_by_account_id <> OLD.created_by_account_id
  OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'suggestion run evidence is immutable');
END;

-- Runs are append-only evidence.  Only lifecycle transitions are allowed;
-- accepted runs cannot be reopened or rewritten.
CREATE TRIGGER scholarly_metadata_suggestion_runs_status_guard_update
BEFORE UPDATE OF status ON scholarly_metadata_suggestion_runs
WHEN NEW.status <> OLD.status
  AND NOT (
    (NEW.status = 'accepted' AND OLD.status IN ('ready', 'ambiguous'))
    OR (NEW.status = 'stale' AND OLD.status IN (
      'ready', 'ambiguous', 'no_suggestions', 'ocr_deferred', 'unsupported'
    ))
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid suggestion run status transition');
END;

CREATE TRIGGER scholarly_metadata_suggestion_runs_no_delete
BEFORE DELETE ON scholarly_metadata_suggestion_runs
BEGIN
  SELECT RAISE(ABORT, 'suggestion run evidence is retained');
END;

CREATE TRIGGER scholarly_metadata_suggestion_candidates_identity_immutable
BEFORE UPDATE ON scholarly_metadata_suggestion_candidates
BEGIN
  SELECT RAISE(ABORT, 'suggestion candidate evidence is immutable');
END;

CREATE TRIGGER scholarly_metadata_suggestion_candidates_no_delete
BEFORE DELETE ON scholarly_metadata_suggestion_candidates
BEGIN
  SELECT RAISE(ABORT, 'suggestion candidate evidence is retained');
END;
