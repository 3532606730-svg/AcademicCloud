import {
  projectSearchHolding, SEARCH_PROJECTION_VERSION,
} from "../../library/search-projection.js";
import type { SearchableAuthority } from "../../library/search.js";
import { SqliteCanonicalMetadataRepository } from "./metadata-repository.js";
import { SqliteBibliographicRepository } from "./bibliographic-repository.js";
import type { SqliteDatabase } from "./database.js";

const REFRESH_CHUNK = 200;

/** Canonical, rebuildable derived data; refresh never consults private overlays. */
export class SqliteSearchProjection {
  readonly #metadata;
  readonly #bibliography;
  readonly #dirty;
  readonly #dirtyDomain;
  readonly #put;
  readonly #delete;
  readonly #clean;

  constructor(private readonly database: SqliteDatabase) {
    this.#metadata = new SqliteCanonicalMetadataRepository(database);
    this.#bibliography = new SqliteBibliographicRepository(database);
    this.#dirty = database.prepare<{ limit: number }, { owner_domain_id: string; record_id: string }>(`
      SELECT owner_domain_id, record_id FROM scholarly_search_dirty
      ORDER BY owner_domain_id, record_id LIMIT @limit
    `);
    this.#dirtyDomain = database.prepare<{ ownerDomainId: string; limit: number }, { owner_domain_id: string; record_id: string }>(`
      SELECT owner_domain_id, record_id FROM scholarly_search_dirty
      WHERE owner_domain_id = @ownerDomainId
      ORDER BY record_id LIMIT @limit
    `);
    this.#put = database.prepare(`
      INSERT INTO scholarly_search_projection (
        owner_domain_id, record_id, projection_version, canonical_title,
        title_compact, title_pinyin, title_order, pinyin_order,
        people_json, people_text, identifiers_text, other_text, filters_json
      ) VALUES (@ownerDomainId, @recordId, @version, @canonicalTitle,
        @titleCompact, @titlePinyin, @titleOrder, @pinyinOrder,
        @peopleJson, @peopleText, @identifiersText, @otherText, @filtersJson)
      ON CONFLICT(owner_domain_id, record_id) DO UPDATE SET
        projection_version = excluded.projection_version,
        canonical_title = excluded.canonical_title, title_compact = excluded.title_compact,
        title_pinyin = excluded.title_pinyin, title_order = excluded.title_order,
        pinyin_order = excluded.pinyin_order, people_json = excluded.people_json,
        people_text = excluded.people_text, identifiers_text = excluded.identifiers_text, other_text = excluded.other_text,
        filters_json = excluded.filters_json
    `);
    this.#delete = database.prepare("DELETE FROM scholarly_search_projection WHERE owner_domain_id = ? AND record_id = ?");
    this.#clean = database.prepare("DELETE FROM scholarly_search_dirty WHERE owner_domain_id = ? AND record_id = ?");
  }

  /** Caller authorizes the domain before invoking this on an HTTP request. */
  refresh(ownerDomainId: string | null = null): number {
    return this.database.transaction(() => {
      let refreshed = 0;
      for (;;) {
        const dirty = ownerDomainId === null ? this.#dirty.all({ limit: REFRESH_CHUNK })
          : this.#dirtyDomain.all({ ownerDomainId, limit: REFRESH_CHUNK });
        if (dirty.length === 0) return refreshed;
        const domains = new Set(dirty.map((row) => row.owner_domain_id));
        for (const domain of domains) {
          const recordIds = dirty.filter((row) => row.owner_domain_id === domain).map((row) => row.record_id);
          const existing = new Set(this.database.prepare<[string, string], { id: string }>(`
            SELECT id FROM scholarly_records WHERE owner_domain_id = ?
              AND id IN (SELECT value FROM json_each(?))
          `).all(domain, JSON.stringify(recordIds)).map((row) => row.id));
          const metadata = new Map(this.#metadata.findMetadataMany(domain, recordIds).map((row) => [row.recordId, row]));
          const profiles = new Map(this.#bibliography.findProfiles(domain, recordIds).map((row) => [row.recordId, row]));
          const authorityIds = [...new Set([...metadata.values()].flatMap((row) => row.authorityLinks.map((link) => link.authorityId)))];
          const authorities = new Map(this.#metadata.findAuthorities(domain, authorityIds).map((row) => [row.id, row]));
          for (const recordId of recordIds) {
            if (existing.has(recordId)) {
              const canonical = metadata.get(recordId) ?? null;
              const linked: SearchableAuthority[] = (canonical?.authorityLinks ?? []).flatMap((link) => {
                const authority = authorities.get(link.authorityId);
                return authority ? [{ type: authority.type, role: link.role, label: authority.canonicalLabel, aliases: [...authority.aliases] }] : [];
              });
              const projection = projectSearchHolding({
                fileId: "", displayName: "", artifactId: "", artifactCreatedAt: new Date(0), sizeBytes: 0,
                canonicalTitle: canonical?.canonicalTitle ?? null,
                metadata: canonical, bibliography: profiles.get(recordId) ?? null,
                authorLabels: linked.filter((entry) => entry.role === "author").map((entry) => entry.label),
                authorities: linked,
              });
              this.#put.run({ ownerDomainId: domain, recordId, version: SEARCH_PROJECTION_VERSION, ...projection });
            } else this.#delete.run(domain, recordId);
            this.#clean.run(domain, recordId);
            refreshed += 1;
          }
        }
      }
    }).immediate();
  }
}

/** Explicit initializer/repair entry point; startup itself need not mutate data. */
export function initializeLibrarySearchProjection(database: SqliteDatabase, rebuild = false): { refreshed: number } {
  database.prepare(`
    INSERT OR IGNORE INTO scholarly_search_dirty(owner_domain_id, record_id)
      SELECT owner_domain_id, id FROM scholarly_records
      WHERE ? = 1 OR NOT EXISTS (
        SELECT 1 FROM scholarly_search_projection p
        WHERE p.owner_domain_id = scholarly_records.owner_domain_id
          AND p.record_id = scholarly_records.id AND p.projection_version = ?
      )
  `).run(rebuild ? 1 : 0, SEARCH_PROJECTION_VERSION);
  return { refreshed: new SqliteSearchProjection(database).refresh() };
}
