-- RF-META01 adds strict canonical scholarly metadata and minimal, Library-
-- domain authority records. Existing records remain metadata-less and keep
-- their file.display_name catalogue fallback; no physical/provenance state is
-- rewritten or backfilled.

PRAGMA defer_foreign_keys = ON;

INSERT INTO governance_audit_target_types (target_type)
VALUES ('scholarly_record'), ('authority');

INSERT INTO governance_audit_event_kinds (kind, target_type)
VALUES
  ('libraries.metadata_update', 'scholarly_record'),
  ('libraries.authority_create', 'authority'),
  ('libraries.authority_update', 'authority');

CREATE TABLE scholarly_record_metadata (
  record_id TEXT PRIMARY KEY,
  owner_domain_id TEXT NOT NULL,
  contract_version INTEGER NOT NULL DEFAULT 1
    CHECK (contract_version = 1),
  material_type TEXT NOT NULL
    CHECK (material_type IN ('book', 'article', 'manuscript', 'inscription', 'archival_document')),
  canonical_title TEXT NOT NULL
    CHECK (
      length(canonical_title) BETWEEN 1 AND 512
      AND canonical_title = trim(canonical_title)
      AND instr(canonical_title, char(0)) = 0
      AND instr(canonical_title, char(9)) = 0
      AND instr(canonical_title, char(10)) = 0
      AND instr(canonical_title, char(13)) = 0
    ),
  subtitle TEXT
    CHECK (
      subtitle IS NULL OR (
        length(subtitle) BETWEEN 1 AND 512
        AND subtitle = trim(subtitle)
        AND instr(subtitle, char(0)) = 0
        AND instr(subtitle, char(9)) = 0
        AND instr(subtitle, char(10)) = 0
        AND instr(subtitle, char(13)) = 0
      )
    ),
  date_statement TEXT
    CHECK (
      date_statement IS NULL OR (
        length(date_statement) BETWEEN 1 AND 128
        AND date_statement = trim(date_statement)
        AND instr(date_statement, char(0)) = 0
        AND instr(date_statement, char(9)) = 0
        AND instr(date_statement, char(10)) = 0
        AND instr(date_statement, char(13)) = 0
      )
    ),
  revision INTEGER NOT NULL DEFAULT 1
    CHECK (revision >= 1),
  created_by_account_id TEXT NOT NULL,
  updated_by_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  UNIQUE (record_id, owner_domain_id),
  FOREIGN KEY (record_id, owner_domain_id)
    REFERENCES scholarly_records(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_record_alternative_titles (
  record_id TEXT NOT NULL,
  owner_domain_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 7),
  title TEXT NOT NULL
    CHECK (
      length(title) BETWEEN 1 AND 512
      AND title = trim(title)
      AND instr(title, char(0)) = 0
      AND instr(title, char(9)) = 0
      AND instr(title, char(10)) = 0
      AND instr(title, char(13)) = 0
    ),
  PRIMARY KEY (record_id, position),
  UNIQUE (record_id, owner_domain_id, title),
  FOREIGN KEY (record_id, owner_domain_id)
    REFERENCES scholarly_record_metadata(record_id, owner_domain_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_record_identifiers (
  record_id TEXT NOT NULL,
  owner_domain_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 7),
  scheme TEXT NOT NULL
    CHECK (
      length(scheme) BETWEEN 1 AND 32
      AND scheme = lower(scheme)
      AND scheme NOT GLOB '*[^a-z0-9._-]*'
      AND substr(scheme, 1, 1) GLOB '[a-z]'
    ),
  value TEXT NOT NULL
    CHECK (
      length(value) BETWEEN 1 AND 128
      AND value = trim(value)
      AND instr(value, char(0)) = 0
      AND instr(value, char(9)) = 0
      AND instr(value, char(10)) = 0
      AND instr(value, char(13)) = 0
    ),
  PRIMARY KEY (record_id, position),
  UNIQUE (record_id, owner_domain_id, scheme, value),
  FOREIGN KEY (record_id, owner_domain_id)
    REFERENCES scholarly_record_metadata(record_id, owner_domain_id) ON DELETE RESTRICT
) STRICT;

-- This is a migration-fixed field registry, not client-defined EAV. Both the
-- discriminator compatibility and per-field limits are guarded below.
CREATE TABLE scholarly_record_type_fields (
  record_id TEXT NOT NULL,
  owner_domain_id TEXT NOT NULL,
  field_name TEXT NOT NULL
    CHECK (field_name IN (
      'edition_statement', 'volume_statement', 'issue_statement', 'locator',
      'shelfmark', 'support_statement', 'extent_statement', 'script_statement',
      'object_type', 'material_statement', 'dimensions_statement',
      'document_type', 'fonds_or_collection', 'series_statement', 'reference_code'
    )),
  value TEXT NOT NULL
    CHECK (
      length(value) BETWEEN 1 AND 255
      AND value = trim(value)
      AND instr(value, char(0)) = 0
      AND instr(value, char(9)) = 0
      AND instr(value, char(10)) = 0
      AND instr(value, char(13)) = 0
    ),
  PRIMARY KEY (record_id, field_name),
  FOREIGN KEY (record_id, owner_domain_id)
    REFERENCES scholarly_record_metadata(record_id, owner_domain_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_authorities (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 1 AND 128 AND id = trim(id)),
  owner_domain_id TEXT NOT NULL,
  authority_type TEXT NOT NULL
    CHECK (authority_type IN ('person', 'place', 'language', 'work', 'institution')),
  canonical_label TEXT NOT NULL
    CHECK (
      length(canonical_label) BETWEEN 1 AND 255
      AND canonical_label = trim(canonical_label)
      AND instr(canonical_label, char(0)) = 0
      AND instr(canonical_label, char(9)) = 0
      AND instr(canonical_label, char(10)) = 0
      AND instr(canonical_label, char(13)) = 0
    ),
  revision INTEGER NOT NULL DEFAULT 1
    CHECK (revision >= 1),
  created_by_account_id TEXT NOT NULL,
  updated_by_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  UNIQUE (id, owner_domain_id),
  UNIQUE (owner_domain_id, authority_type, canonical_label),
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_authority_aliases (
  authority_id TEXT NOT NULL,
  owner_domain_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 7),
  alias TEXT NOT NULL
    CHECK (
      length(alias) BETWEEN 1 AND 255
      AND alias = trim(alias)
      AND instr(alias, char(0)) = 0
      AND instr(alias, char(9)) = 0
      AND instr(alias, char(10)) = 0
      AND instr(alias, char(13)) = 0
    ),
  PRIMARY KEY (authority_id, position),
  UNIQUE (authority_id, owner_domain_id, alias),
  FOREIGN KEY (authority_id, owner_domain_id)
    REFERENCES scholarly_authorities(id, owner_domain_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_record_authority_links (
  record_id TEXT NOT NULL,
  owner_domain_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 31),
  authority_id TEXT NOT NULL,
  role TEXT NOT NULL
    CHECK (role IN (
      'author', 'editor', 'translator', 'compiler', 'scribe', 'sender',
      'recipient', 'creator', 'contributor', 'publication_place',
      'creation_place', 'discovery_place', 'content_language',
      'original_language', 'container_work', 'series_work', 'source_work',
      'publisher', 'holding_institution', 'issuing_body'
    )),
  PRIMARY KEY (record_id, position),
  UNIQUE (record_id, owner_domain_id, authority_id, role),
  FOREIGN KEY (record_id, owner_domain_id)
    REFERENCES scholarly_record_metadata(record_id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (authority_id, owner_domain_id)
    REFERENCES scholarly_authorities(id, owner_domain_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX scholarly_record_metadata_domain_index
  ON scholarly_record_metadata(owner_domain_id, material_type, record_id);

CREATE INDEX scholarly_authorities_domain_type_label_index
  ON scholarly_authorities(owner_domain_id, authority_type, canonical_label, id);

CREATE INDEX scholarly_record_authority_links_authority_index
  ON scholarly_record_authority_links(owner_domain_id, authority_id, record_id);

CREATE TRIGGER scholarly_record_metadata_library_domain_guard_insert
BEFORE INSERT ON scholarly_record_metadata
WHEN NOT EXISTS (
  SELECT 1 FROM ownership_domains
  WHERE ownership_domains.id = NEW.owner_domain_id
    AND ownership_domains.kind = 'library'
    AND ownership_domains.account_id IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'canonical metadata requires a Library ownership domain');
END;

CREATE TRIGGER scholarly_record_metadata_identity_immutable
BEFORE UPDATE OF record_id, owner_domain_id, contract_version, created_by_account_id
ON scholarly_record_metadata
WHEN NEW.record_id <> OLD.record_id
  OR NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.contract_version <> OLD.contract_version
  OR NEW.created_by_account_id <> OLD.created_by_account_id
BEGIN
  SELECT RAISE(ABORT, 'canonical metadata identity is immutable');
END;

CREATE TRIGGER scholarly_record_metadata_type_change_guard
BEFORE UPDATE OF material_type ON scholarly_record_metadata
WHEN NEW.material_type <> OLD.material_type
  AND EXISTS (
    SELECT 1 FROM scholarly_record_type_fields
    WHERE scholarly_record_type_fields.record_id = OLD.record_id
      AND scholarly_record_type_fields.owner_domain_id = OLD.owner_domain_id
  )
BEGIN
  SELECT RAISE(ABORT, 'material type change requires cleared type fields');
END;

CREATE TRIGGER scholarly_record_metadata_no_delete
BEFORE DELETE ON scholarly_record_metadata
BEGIN
  SELECT RAISE(ABORT, 'canonical metadata is retained');
END;

CREATE TRIGGER scholarly_record_type_fields_contract_guard_insert
BEFORE INSERT ON scholarly_record_type_fields
WHEN NOT EXISTS (
  SELECT 1 FROM scholarly_record_metadata
  WHERE scholarly_record_metadata.record_id = NEW.record_id
    AND scholarly_record_metadata.owner_domain_id = NEW.owner_domain_id
    AND (
      (material_type = 'book' AND NEW.field_name IN ('edition_statement', 'volume_statement'))
      OR (material_type = 'article' AND NEW.field_name IN ('volume_statement', 'issue_statement', 'locator'))
      OR (material_type = 'manuscript' AND NEW.field_name IN ('shelfmark', 'support_statement', 'extent_statement', 'script_statement'))
      OR (material_type = 'inscription' AND NEW.field_name IN ('object_type', 'material_statement', 'dimensions_statement', 'script_statement'))
      OR (material_type = 'archival_document' AND NEW.field_name IN ('document_type', 'fonds_or_collection', 'series_statement', 'reference_code'))
    )
    AND length(NEW.value) <= CASE
      WHEN NEW.field_name IN ('fonds_or_collection', 'series_statement') THEN 255
      WHEN material_type = 'article' AND NEW.field_name IN ('volume_statement', 'issue_statement') THEN 64
      ELSE 128
    END
)
BEGIN
  SELECT RAISE(ABORT, 'invalid material type field');
END;

CREATE TRIGGER scholarly_record_type_fields_contract_guard_update
BEFORE UPDATE ON scholarly_record_type_fields
BEGIN
  SELECT RAISE(ABORT, 'material type fields are replaced, not updated');
END;

CREATE TRIGGER scholarly_authorities_library_domain_guard_insert
BEFORE INSERT ON scholarly_authorities
WHEN NOT EXISTS (
  SELECT 1 FROM ownership_domains
  WHERE ownership_domains.id = NEW.owner_domain_id
    AND ownership_domains.kind = 'library'
    AND ownership_domains.account_id IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'authority requires a Library ownership domain');
END;

CREATE TRIGGER scholarly_authorities_identity_immutable
BEFORE UPDATE OF id, owner_domain_id, authority_type, created_by_account_id
ON scholarly_authorities
WHEN NEW.id <> OLD.id
  OR NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.authority_type <> OLD.authority_type
  OR NEW.created_by_account_id <> OLD.created_by_account_id
BEGIN
  SELECT RAISE(ABORT, 'authority identity is immutable');
END;

CREATE TRIGGER scholarly_authorities_no_delete
BEFORE DELETE ON scholarly_authorities
BEGIN
  SELECT RAISE(ABORT, 'authority identity is retained');
END;

CREATE TRIGGER scholarly_record_authority_links_role_guard_insert
BEFORE INSERT ON scholarly_record_authority_links
WHEN NOT EXISTS (
  SELECT 1 FROM scholarly_authorities
  WHERE scholarly_authorities.id = NEW.authority_id
    AND scholarly_authorities.owner_domain_id = NEW.owner_domain_id
    AND (
      (authority_type = 'person' AND NEW.role IN ('author', 'editor', 'translator', 'compiler', 'scribe', 'sender', 'recipient', 'creator', 'contributor'))
      OR (authority_type = 'place' AND NEW.role IN ('publication_place', 'creation_place', 'discovery_place'))
      OR (authority_type = 'language' AND NEW.role IN ('content_language', 'original_language'))
      OR (authority_type = 'work' AND NEW.role IN ('container_work', 'series_work', 'source_work'))
      OR (authority_type = 'institution' AND NEW.role IN ('publisher', 'holding_institution', 'issuing_body', 'creator'))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'authority role is incompatible with authority type');
END;

CREATE TRIGGER scholarly_record_authority_links_no_update
BEFORE UPDATE ON scholarly_record_authority_links
BEGIN
  SELECT RAISE(ABORT, 'authority links are replaced, not updated');
END;
