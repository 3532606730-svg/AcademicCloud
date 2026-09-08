-- R02: rebuildable canonical-metadata search projection. No file bytes or private
-- research overlays are indexed. Live resource joins remain authorization authority.
CREATE TABLE scholarly_search_projection (
  owner_domain_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  projection_version INTEGER NOT NULL,
  canonical_title TEXT,
  title_compact TEXT NOT NULL,
  title_pinyin TEXT NOT NULL,
  title_order TEXT NOT NULL,
  pinyin_order TEXT NOT NULL,
  people_json TEXT NOT NULL CHECK(json_valid(people_json)),
  people_text TEXT NOT NULL,
  identifiers_text TEXT NOT NULL,
  other_text TEXT NOT NULL,
  filters_json TEXT NOT NULL CHECK(json_valid(filters_json)),
  PRIMARY KEY (owner_domain_id, record_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE scholarly_search_dirty (
  owner_domain_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  PRIMARY KEY (owner_domain_id, record_id)
) STRICT, WITHOUT ROWID;

-- The explicit initializer rebuilds these before production startup. Triggers
-- also cover SQL corrections/imports so repository write paths cannot omit invalidation.
INSERT INTO scholarly_search_dirty SELECT owner_domain_id, id FROM scholarly_records;
CREATE INDEX scholarly_artifacts_domain_active_order_index
  ON scholarly_artifacts(owner_domain_id, attachment_state, created_at, id);

CREATE TRIGGER search_dirty_scholarly_records_insert
AFTER INSERT ON scholarly_records BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.id);
END;

CREATE TRIGGER search_dirty_scholarly_records_update
AFTER UPDATE ON scholarly_records BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.id);
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.id);
END;

CREATE TRIGGER search_dirty_scholarly_records_delete
AFTER DELETE ON scholarly_records BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.id);
END;

CREATE TRIGGER search_dirty_scholarly_record_metadata_insert
AFTER INSERT ON scholarly_record_metadata BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_metadata_update
AFTER UPDATE ON scholarly_record_metadata BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_metadata_delete
AFTER DELETE ON scholarly_record_metadata BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_alternative_titles_insert
AFTER INSERT ON scholarly_record_alternative_titles BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_alternative_titles_update
AFTER UPDATE ON scholarly_record_alternative_titles BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_alternative_titles_delete
AFTER DELETE ON scholarly_record_alternative_titles BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_identifiers_insert
AFTER INSERT ON scholarly_record_identifiers BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_identifiers_update
AFTER UPDATE ON scholarly_record_identifiers BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_identifiers_delete
AFTER DELETE ON scholarly_record_identifiers BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_type_fields_insert
AFTER INSERT ON scholarly_record_type_fields BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_type_fields_update
AFTER UPDATE ON scholarly_record_type_fields BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_type_fields_delete
AFTER DELETE ON scholarly_record_type_fields BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_authority_links_insert
AFTER INSERT ON scholarly_record_authority_links BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_authority_links_update
AFTER UPDATE ON scholarly_record_authority_links BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_record_authority_links_delete
AFTER DELETE ON scholarly_record_authority_links BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_bibliographic_profiles_insert
AFTER INSERT ON scholarly_bibliographic_profiles BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_bibliographic_profiles_update
AFTER UPDATE ON scholarly_bibliographic_profiles BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_bibliographic_profiles_delete
AFTER DELETE ON scholarly_bibliographic_profiles BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_bibliographic_contributors_insert
AFTER INSERT ON scholarly_bibliographic_contributors BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_bibliographic_contributors_update
AFTER UPDATE ON scholarly_bibliographic_contributors BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_bibliographic_contributors_delete
AFTER DELETE ON scholarly_bibliographic_contributors BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_bibliographic_source_editions_insert
AFTER INSERT ON scholarly_bibliographic_source_editions BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_bibliographic_source_editions_update
AFTER UPDATE ON scholarly_bibliographic_source_editions BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (NEW.owner_domain_id, NEW.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_bibliographic_source_editions_delete
AFTER DELETE ON scholarly_bibliographic_source_editions BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    VALUES (OLD.owner_domain_id, OLD.record_id);
END;

CREATE TRIGGER search_dirty_scholarly_authorities_insert
AFTER INSERT ON scholarly_authorities BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    SELECT owner_domain_id, record_id FROM scholarly_record_authority_links
    WHERE owner_domain_id = NEW.owner_domain_id AND authority_id = NEW.id;
END;

CREATE TRIGGER search_dirty_scholarly_authorities_update
AFTER UPDATE ON scholarly_authorities BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    SELECT owner_domain_id, record_id FROM scholarly_record_authority_links
    WHERE owner_domain_id = OLD.owner_domain_id AND authority_id = OLD.id;
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    SELECT owner_domain_id, record_id FROM scholarly_record_authority_links
    WHERE owner_domain_id = NEW.owner_domain_id AND authority_id = NEW.id;
END;

CREATE TRIGGER search_dirty_scholarly_authorities_delete
AFTER DELETE ON scholarly_authorities BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    SELECT owner_domain_id, record_id FROM scholarly_record_authority_links
    WHERE owner_domain_id = OLD.owner_domain_id AND authority_id = OLD.id;
END;

CREATE TRIGGER search_dirty_scholarly_authority_aliases_insert
AFTER INSERT ON scholarly_authority_aliases BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    SELECT owner_domain_id, record_id FROM scholarly_record_authority_links
    WHERE owner_domain_id = NEW.owner_domain_id AND authority_id = NEW.authority_id;
END;

CREATE TRIGGER search_dirty_scholarly_authority_aliases_update
AFTER UPDATE ON scholarly_authority_aliases BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    SELECT owner_domain_id, record_id FROM scholarly_record_authority_links
    WHERE owner_domain_id = OLD.owner_domain_id AND authority_id = OLD.authority_id;
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    SELECT owner_domain_id, record_id FROM scholarly_record_authority_links
    WHERE owner_domain_id = NEW.owner_domain_id AND authority_id = NEW.authority_id;
END;

CREATE TRIGGER search_dirty_scholarly_authority_aliases_delete
AFTER DELETE ON scholarly_authority_aliases BEGIN
  INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
    SELECT owner_domain_id, record_id FROM scholarly_record_authority_links
    WHERE owner_domain_id = OLD.owner_domain_id AND authority_id = OLD.authority_id;
END;
