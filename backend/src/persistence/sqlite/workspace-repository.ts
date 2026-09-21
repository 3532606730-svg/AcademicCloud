import type { CollectionItem, PageNote, ReadingState, ResearchCollection, WorkspaceRepository, WorkspaceResource } from "../../workspace/model.js";
import type { SqliteDatabase } from "./database.js";

const noteColumns = `id, file_id AS resourceId, source_id AS sourceId, physical_page AS physicalPage,
  locator, body, revision, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt`;
const collectionColumns = `c.id, c.name, c.revision, c.created_at AS createdAt, c.updated_at AS updatedAt,
  c.archived_at AS archivedAt, (SELECT count(*) FROM personal_collection_items i
    WHERE i.account_id = c.account_id AND i.collection_id = c.id) AS itemCount`;
const readingColumns = `file_id AS resourceId, status, important, to_cite AS toCite, revision, updated_at AS updatedAt`;
type ReadingRow = Omit<ReadingState, "important" | "toCite"> & { important: number; toCite: number };
const reading = (row: ReadingRow): ReadingState => ({ ...row, important: row.important === 1, toCite: row.toCite === 1 });

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly database: SqliteDatabase) {}

  resolveResources(accountId: string, ids: string[]): WorkspaceResource[] {
    if (!ids.length) return [];
    // Bounded page IDs first. The attached version and effective membership
    // gates mirror Library holdings; uploader identity is not file authority.
    return this.database.prepare<{ accountId: string; ids: string }, WorkspaceResource>(`
      WITH accessible AS (
        SELECT f.id, f.display_name, f.media_type, f.owner_domain_id,
          l.id AS library_id,
          (SELECT m.canonical_title FROM scholarly_artifact_versions v
            JOIN scholarly_artifacts a ON a.id = v.artifact_id AND a.owner_domain_id = v.owner_domain_id
            LEFT JOIN scholarly_record_metadata m ON m.record_id = a.record_id AND m.owner_domain_id = a.owner_domain_id
            WHERE v.stored_file_id = f.id AND v.owner_domain_id = f.owner_domain_id
              AND a.attachment_state = 'attached' ORDER BY v.id LIMIT 1) AS canonical_title
        FROM json_each(@ids) requested JOIN files f ON f.id = requested.value
        JOIN ownership_domains d ON d.id = f.owner_domain_id
        LEFT JOIN libraries l ON l.owner_domain_id = d.id
        WHERE f.state = 'active'
          AND EXISTS (SELECT 1 FROM accounts WHERE id = @accountId AND state = 'active')
          AND ((d.kind = 'account' AND d.account_id = @accountId) OR (
            d.kind = 'library' AND EXISTS (SELECT 1 FROM library_memberships lm WHERE lm.library_id = l.id AND lm.account_id = @accountId)
            AND EXISTS (SELECT 1 FROM scholarly_artifact_versions v
              JOIN scholarly_artifacts a ON a.id = v.artifact_id AND a.owner_domain_id = v.owner_domain_id
              JOIN scholarly_records r ON r.id = a.record_id AND r.owner_domain_id = a.owner_domain_id
              WHERE v.stored_file_id = f.id AND v.owner_domain_id = f.owner_domain_id AND a.attachment_state = 'attached')
          ))
      )
      SELECT a.id AS resourceId, COALESCE(NULLIF(a.canonical_title, ''), a.display_name) AS title,
        a.media_type AS mediaType, a.library_id AS libraryId, s.source_id AS sourceId
      FROM accessible a JOIN document_current_sources s ON s.file_id = a.id
    `).all({ accountId, ids: JSON.stringify(ids) });
  }
  getReading(accountId: string, resourceId: string): ReadingState | null {
    const row = this.database.prepare<[string, string], ReadingRow>(`SELECT ${readingColumns} FROM personal_reading_states WHERE account_id = ? AND file_id = ?`).get(accountId, resourceId);
    return row ? reading(row) : null;
  }
  saveReading(accountId: string, state: ReadingState, expectedRevision: number): boolean {
    if (expectedRevision === 0) return this.database.prepare(`INSERT INTO personal_reading_states
      (account_id, file_id, status, important, to_cite, revision, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(account_id, file_id) DO NOTHING`).run(accountId, state.resourceId, state.status, +state.important, +state.toCite, state.updatedAt).changes === 1;
    return this.database.prepare(`UPDATE personal_reading_states SET status = ?, important = ?, to_cite = ?, revision = revision + 1, updated_at = ?
      WHERE account_id = ? AND file_id = ? AND revision = ?`).run(state.status, +state.important, +state.toCite, state.updatedAt, accountId, state.resourceId, expectedRevision).changes === 1;
  }
  listReading(accountId: string, beforeId: string | null, limit: number, activeOnly = false): ReadingState[] {
    // Retain cleared rows for CAS and export, while list pages are filled only
    // with currently authored reading status or flags before applying LIMIT.
    return this.database.prepare<[string, string | null, string | null, number], ReadingRow>(`SELECT ${readingColumns} FROM personal_reading_states
      WHERE account_id = ? AND (? IS NULL OR file_id < ?)
        ${activeOnly ? "AND (status IS NOT NULL OR important = 1 OR to_cite = 1)" : ""}
      ORDER BY file_id DESC LIMIT ?`).all(accountId, beforeId, beforeId, limit).map(reading);
  }
  listCollections(accountId: string): ResearchCollection[] {
    return this.database.prepare<[string], ResearchCollection>(`SELECT ${collectionColumns} FROM personal_collections c WHERE c.account_id = ? ORDER BY c.created_at DESC, c.id DESC LIMIT 201`).all(accountId);
  }
  getCollection(accountId: string, id: string): ResearchCollection | null {
    return this.database.prepare<[string, string], ResearchCollection>(`SELECT ${collectionColumns} FROM personal_collections c WHERE c.account_id = ? AND c.id = ?`).get(accountId, id) ?? null;
  }
  createCollection(accountId: string, c: ResearchCollection): void {
    this.database.prepare(`INSERT INTO personal_collections (id, account_id, name, revision, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(c.id, accountId, c.name, c.revision, c.createdAt, c.updatedAt, c.archivedAt);
  }
  saveCollection(accountId: string, c: ResearchCollection, expectedRevision: number): boolean {
    return this.database.prepare(`UPDATE personal_collections SET name = ?, revision = revision + 1, updated_at = ?, archived_at = ? WHERE account_id = ? AND id = ? AND revision = ?`)
      .run(c.name, c.updatedAt, c.archivedAt, accountId, c.id, expectedRevision).changes === 1;
  }
  listCollectionItems(accountId: string, collectionId: string, beforeId: string | null, limit: number): CollectionItem[] {
    return this.database.prepare<[string, string, string | null, string | null, number], CollectionItem>(`SELECT collection_id AS collectionId, file_id AS resourceId, created_at AS createdAt
      FROM personal_collection_items WHERE account_id = ? AND collection_id = ? AND (? IS NULL OR file_id < ?) ORDER BY file_id DESC LIMIT ?`).all(accountId, collectionId, beforeId, beforeId, limit);
  }
  listResourceCollections(accountId: string, resourceId: string): string[] {
    return this.database.prepare<[string, string], { id: string }>(`SELECT collection_id AS id FROM personal_collection_items WHERE account_id = ? AND file_id = ? ORDER BY collection_id`).all(accountId, resourceId).map((row) => row.id);
  }
  setCollectionItem(accountId: string, collectionId: string, resourceId: string, included: boolean, now: string): boolean {
    if (included) return this.database.prepare(`INSERT INTO personal_collection_items (account_id, collection_id, file_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`).run(accountId, collectionId, resourceId, now).changes === 1;
    return this.database.prepare(`DELETE FROM personal_collection_items WHERE account_id = ? AND collection_id = ? AND file_id = ?`).run(accountId, collectionId, resourceId).changes === 1;
  }
  getNote(accountId: string, id: string): PageNote | null {
    return this.database.prepare<[string, string], PageNote>(`SELECT ${noteColumns} FROM personal_page_notes WHERE account_id = ? AND id = ?`).get(accountId, id) ?? null;
  }
  listNotes(accountId: string, filter: { resourceId?: string; deleted?: boolean; beforeId: string | null; limit: number }): PageNote[] {
    return this.database.prepare<{ accountId: string; resourceId: string | null; deleted: number | null; beforeId: string | null; limit: number }, PageNote>(`
      SELECT ${noteColumns} FROM personal_page_notes WHERE account_id = @accountId
        AND (@resourceId IS NULL OR file_id = @resourceId)
        AND (@deleted IS NULL OR (deleted_at IS NOT NULL) = @deleted)
        AND (@beforeId IS NULL OR (created_at, id) < (SELECT created_at, id FROM personal_page_notes WHERE account_id = @accountId AND id = @beforeId))
      ORDER BY created_at DESC, id DESC LIMIT @limit
    `).all({ accountId, resourceId: filter.resourceId ?? null, deleted: filter.deleted === undefined ? null : +filter.deleted, beforeId: filter.beforeId, limit: filter.limit });
  }
  createNote(accountId: string, n: PageNote): void {
    this.database.prepare(`INSERT INTO personal_page_notes (id, account_id, file_id, source_id, physical_page, locator, body, revision, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(n.id, accountId, n.resourceId, n.sourceId, n.physicalPage, n.locator, n.body, n.revision, n.createdAt, n.updatedAt, n.deletedAt);
  }
  saveNote(accountId: string, n: PageNote, expectedRevision: number): boolean {
    return this.database.prepare(`UPDATE personal_page_notes SET locator = ?, body = ?, revision = revision + 1, updated_at = ?, deleted_at = ? WHERE account_id = ? AND id = ? AND revision = ?`)
      .run(n.locator, n.body, n.updatedAt, n.deletedAt, accountId, n.id, expectedRevision).changes === 1;
  }
}
