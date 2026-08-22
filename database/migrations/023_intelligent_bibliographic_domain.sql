-- L1-INTELLIGENT-LIBRARY01 adds the authoritative Layer-1 bibliographic
-- classification/profile, structured contributor and carrier/source-edition
-- semantics, and durable field authority. Existing v18 canonical metadata and
-- immutable v19/v20 suggestion evidence are preserved without reinterpretation
-- or guessed backfill.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE scholarly_bibliographic_profiles (
  record_id TEXT PRIMARY KEY,
  owner_domain_id TEXT NOT NULL,
  contract_version INTEGER NOT NULL DEFAULT 1 CHECK (contract_version = 1),
  material_class TEXT NOT NULL CHECK (material_class IN (
    'scholarly_monograph', 'edited_volume', 'journal_article', 'book_chapter',
    'thesis_dissertation', 'conference_paper', 'review', 'reference_work',
    'dictionary_lexicon', 'primary_source_modern_edition', 'traditional_book',
    'archival_document', 'inscription_epigraphy', 'rubbing', 'manuscript',
    'collected_documents', 'catalogue_bibliography', 'other', 'unknown'
  )),
  publication_publisher TEXT CHECK (publication_publisher IS NULL OR (length(publication_publisher) BETWEEN 1 AND 255 AND publication_publisher = trim(publication_publisher))),
  publication_place TEXT CHECK (publication_place IS NULL OR (length(publication_place) BETWEEN 1 AND 255 AND publication_place = trim(publication_place))),
  publication_date TEXT CHECK (publication_date IS NULL OR (length(publication_date) BETWEEN 1 AND 64 AND publication_date = trim(publication_date))),
  edition_number TEXT CHECK (edition_number IS NULL OR (length(edition_number) BETWEEN 1 AND 128 AND edition_number = trim(edition_number))),
  printing TEXT CHECK (printing IS NULL OR (length(printing) BETWEEN 1 AND 128 AND printing = trim(printing))),
  series_title TEXT CHECK (series_title IS NULL OR (length(series_title) BETWEEN 1 AND 255 AND series_title = trim(series_title))),
  volume_part TEXT CHECK (volume_part IS NULL OR (length(volume_part) BETWEEN 1 AND 128 AND volume_part = trim(volume_part))),
  language_label TEXT CHECK (language_label IS NULL OR (length(language_label) BETWEEN 1 AND 128 AND language_label = trim(language_label))),
  carrier_edition_type TEXT CHECK (carrier_edition_type IS NULL OR carrier_edition_type IN (
    'critical_edition', 'annotated_edition', 'collated_edition', 'punctuated_edition',
    'translated_edition', 'facsimile', 'reprint', 'engraved', 'recut',
    'facsimile_engraved', 'movable_type', 'multicolor_print', 'manuscript_copy',
    'hand_copy', 'draft_manuscript', 'facsimile_hand_copy', 'lithograph',
    'letterpress', 'composite_repaired', 'hand_copy_repaired', 'repaired', 'other', 'unknown'
  )),
  carrier_edition_statement TEXT CHECK (carrier_edition_statement IS NULL OR (length(carrier_edition_statement) BETWEEN 1 AND 512 AND carrier_edition_statement = trim(carrier_edition_statement))),
  carrier_facsimile_statement TEXT CHECK (carrier_facsimile_statement IS NULL OR (length(carrier_facsimile_statement) BETWEEN 1 AND 512 AND carrier_facsimile_statement = trim(carrier_facsimile_statement))),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by_account_id TEXT NOT NULL,
  updated_by_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  UNIQUE (record_id, owner_domain_id),
  FOREIGN KEY (record_id, owner_domain_id) REFERENCES scholarly_records(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_domain_id) REFERENCES ownership_domains(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_bibliographic_contributors (
  id TEXT NOT NULL CHECK (length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
  record_id TEXT NOT NULL,
  owner_domain_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 63),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 255 AND label = trim(label)),
  role TEXT NOT NULL CHECK (role IN (
    'author', 'editor', 'compiler', 'translator', 'annotator', 'collator',
    'punctuator', 'commentator', 'reviser', 'selector', 'organizer', 'other'
  )),
  role_label TEXT CHECK (role_label IS NULL OR (length(role_label) BETWEEN 1 AND 64 AND role_label = trim(role_label))),
  authority_id TEXT,
  PRIMARY KEY (record_id, id),
  UNIQUE (record_id, position),
  FOREIGN KEY (record_id, owner_domain_id) REFERENCES scholarly_bibliographic_profiles(record_id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (authority_id, owner_domain_id) REFERENCES scholarly_authorities(id, owner_domain_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_bibliographic_source_editions (
  record_id TEXT PRIMARY KEY,
  owner_domain_id TEXT NOT NULL,
  dynasty TEXT CHECK (dynasty IS NULL OR (length(dynasty) BETWEEN 1 AND 64 AND dynasty = trim(dynasty))),
  reign_title TEXT CHECK (reign_title IS NULL OR (length(reign_title) BETWEEN 1 AND 64 AND reign_title = trim(reign_title))),
  reign_year TEXT CHECK (reign_year IS NULL OR (length(reign_year) BETWEEN 1 AND 64 AND reign_year = trim(reign_year))),
  absolute_year INTEGER CHECK (absolute_year IS NULL OR absolute_year BETWEEN -9999 AND 9999),
  printer TEXT CHECK (printer IS NULL OR (length(printer) BETWEEN 1 AND 255 AND printer = trim(printer))),
  imprint TEXT CHECK (imprint IS NULL OR (length(imprint) BETWEEN 1 AND 255 AND imprint = trim(imprint))),
  bookshop TEXT CHECK (bookshop IS NULL OR (length(bookshop) BETWEEN 1 AND 255 AND bookshop = trim(bookshop))),
  institution TEXT CHECK (institution IS NULL OR (length(institution) BETWEEN 1 AND 255 AND institution = trim(institution))),
  printing_place TEXT CHECK (printing_place IS NULL OR (length(printing_place) BETWEEN 1 AND 255 AND printing_place = trim(printing_place))),
  edition_type TEXT CHECK (edition_type IS NULL OR edition_type IN (
    'critical_edition', 'annotated_edition', 'collated_edition', 'punctuated_edition',
    'translated_edition', 'facsimile', 'reprint', 'engraved', 'recut',
    'facsimile_engraved', 'movable_type', 'multicolor_print', 'manuscript_copy',
    'hand_copy', 'draft_manuscript', 'facsimile_hand_copy', 'lithograph',
    'letterpress', 'composite_repaired', 'hand_copy_repaired', 'repaired', 'other', 'unknown'
  )),
  edition_statement TEXT CHECK (edition_statement IS NULL OR (length(edition_statement) BETWEEN 1 AND 512 AND edition_statement = trim(edition_statement))),
  holding_information TEXT CHECK (holding_information IS NULL OR (length(holding_information) BETWEEN 1 AND 512 AND holding_information = trim(holding_information))),
  UNIQUE (record_id, owner_domain_id),
  FOREIGN KEY (record_id, owner_domain_id) REFERENCES scholarly_bibliographic_profiles(record_id, owner_domain_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE scholarly_bibliographic_field_authority (
  record_id TEXT NOT NULL,
  owner_domain_id TEXT NOT NULL,
  field_name TEXT NOT NULL CHECK (field_name IN (
    'materialClass', 'canonicalTitle', 'subtitle', 'alternativeTitles', 'dateStatement', 'identifiers',
    'publication.publisher', 'publication.place', 'publication.publicationDate',
    'publication.editionNumber', 'publication.printing', 'series', 'volume', 'language',
    'carrierEdition.editionType', 'carrierEdition.editionStatement', 'carrierEdition.facsimileStatement',
    'sourceEdition.dynasty', 'sourceEdition.reignTitle', 'sourceEdition.reignYear',
    'sourceEdition.absoluteYear', 'sourceEdition.printer', 'sourceEdition.imprint',
    'sourceEdition.bookshop', 'sourceEdition.institution', 'sourceEdition.printingPlace',
    'sourceEdition.editionType', 'sourceEdition.editionStatement', 'sourceEdition.holdingInformation',
    'contributor.label', 'contributor.role', 'contributor.roleLabel', 'contributor.authorityId'
  )),
  scope_key TEXT NOT NULL DEFAULT '' CHECK (length(scope_key) <= 128 AND scope_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  authority_source TEXT NOT NULL CHECK (authority_source IN ('human', 'ai')),
  source_run_id TEXT,
  actor_account_id TEXT,
  established_at TEXT NOT NULL CHECK (length(established_at) > 0),
  PRIMARY KEY (record_id, field_name, scope_key),
  FOREIGN KEY (record_id, owner_domain_id) REFERENCES scholarly_records(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_run_id, owner_domain_id) REFERENCES scholarly_metadata_suggestion_runs(id, owner_domain_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK ((authority_source = 'human' AND actor_account_id IS NOT NULL AND source_run_id IS NULL)
    OR (authority_source = 'ai' AND source_run_id IS NOT NULL AND actor_account_id IS NULL)),
  CHECK ((field_name LIKE 'contributor.%' AND length(scope_key) > 0)
    OR (field_name NOT LIKE 'contributor.%' AND scope_key = ''))
) STRICT;

CREATE INDEX scholarly_bibliographic_profiles_class_index
  ON scholarly_bibliographic_profiles(owner_domain_id, material_class, record_id);
CREATE INDEX scholarly_bibliographic_contributors_search_index
  ON scholarly_bibliographic_contributors(owner_domain_id, label, role, record_id);
CREATE INDEX scholarly_bibliographic_publication_index
  ON scholarly_bibliographic_profiles(owner_domain_id, publication_publisher, publication_date, record_id);
CREATE INDEX scholarly_bibliographic_source_index
  ON scholarly_bibliographic_source_editions(owner_domain_id, dynasty, reign_title, absolute_year, record_id);

CREATE TRIGGER scholarly_bibliographic_profiles_library_domain_guard_insert
BEFORE INSERT ON scholarly_bibliographic_profiles
WHEN NOT EXISTS (
  SELECT 1 FROM ownership_domains
  WHERE ownership_domains.id = NEW.owner_domain_id
    AND ownership_domains.kind = 'library'
    AND ownership_domains.account_id IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'bibliographic profile requires a Library ownership domain');
END;

CREATE TRIGGER scholarly_bibliographic_profiles_identity_immutable
BEFORE UPDATE OF record_id, owner_domain_id, contract_version, created_by_account_id
ON scholarly_bibliographic_profiles
WHEN NEW.record_id <> OLD.record_id OR NEW.owner_domain_id <> OLD.owner_domain_id
  OR NEW.contract_version <> OLD.contract_version OR NEW.created_by_account_id <> OLD.created_by_account_id
BEGIN
  SELECT RAISE(ABORT, 'bibliographic profile identity is immutable');
END;

CREATE TRIGGER scholarly_bibliographic_profiles_no_delete
BEFORE DELETE ON scholarly_bibliographic_profiles
BEGIN
  SELECT RAISE(ABORT, 'bibliographic profile is retained');
END;

CREATE TRIGGER scholarly_bibliographic_contributor_authority_exact_guard_insert
BEFORE INSERT ON scholarly_bibliographic_contributors
WHEN NEW.authority_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM scholarly_authorities
  WHERE scholarly_authorities.id = NEW.authority_id
    AND scholarly_authorities.owner_domain_id = NEW.owner_domain_id
    AND scholarly_authorities.authority_type = 'person'
    AND (
      scholarly_authorities.canonical_label = NEW.label
      OR EXISTS (
        SELECT 1 FROM scholarly_authority_aliases
        WHERE scholarly_authority_aliases.authority_id = scholarly_authorities.id
          AND scholarly_authority_aliases.owner_domain_id = scholarly_authorities.owner_domain_id
          AND scholarly_authority_aliases.alias = NEW.label
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'contributor authority binding requires an exact person label or alias match');
END;

CREATE TRIGGER scholarly_bibliographic_field_authority_scope_guard_insert
BEFORE INSERT ON scholarly_bibliographic_field_authority
WHEN NEW.scope_key <> '' AND NOT EXISTS (
  SELECT 1 FROM scholarly_bibliographic_contributors
  WHERE scholarly_bibliographic_contributors.record_id = NEW.record_id
    AND scholarly_bibliographic_contributors.owner_domain_id = NEW.owner_domain_id
    AND scholarly_bibliographic_contributors.id = NEW.scope_key
)
BEGIN
  SELECT RAISE(ABORT, 'field authority contributor scope does not exist');
END;

CREATE TRIGGER scholarly_bibliographic_field_authority_scope_guard_update
BEFORE UPDATE OF record_id, owner_domain_id, field_name, scope_key
ON scholarly_bibliographic_field_authority
BEGIN
  SELECT RAISE(ABORT, 'field authority identity is immutable');
END;
