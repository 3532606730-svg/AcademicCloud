import type { NewStoredFile, StoredFile, StoredFileState } from "../../drive/file.js";
import type { StoredFileRepository } from "../../drive/repositories.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface StoredFileRow {
  id: string;
  owner_id: string;
  folder_id: string | null;
  display_name: string;
  storage_provider: string;
  object_key: string;
  media_type: string | null;
  size_bytes: number | null;
  checksum_algorithm: string | null;
  checksum: string | null;
  state: StoredFileState;
  revision: number;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  deleted_at: string | null;
  purged_at: string | null;
}

interface StoredFileParameters {
  id: string;
  ownerId: string;
  folderId: string | null;
  displayName: string;
  storageProvider: string;
  objectKey: string;
  mediaType: string | null;
  sizeBytes: number | null;
  checksumAlgorithm: string | null;
  checksum: string | null;
  state: StoredFileState;
  revision: number;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  deletedAt: string | null;
  purgedAt: string | null;
  expectedState?: StoredFileState;
  expectedRevision?: number;
}

function toStoredFile(row: StoredFileRow): StoredFile {
  return {
    id: row.id,
    ownerId: row.owner_id,
    folderId: row.folder_id,
    displayName: row.display_name,
    storageProvider: row.storage_provider,
    objectKey: row.object_key,
    mediaType: row.media_type,
    sizeBytes: row.size_bytes,
    checksumAlgorithm: row.checksum_algorithm,
    checksum: row.checksum,
    state: row.state,
    revision: row.revision,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
    activatedAt: fromDatabaseTimestamp(row.activated_at),
    deletedAt: fromDatabaseTimestamp(row.deleted_at),
    purgedAt: fromDatabaseTimestamp(row.purged_at),
  };
}

export class SqliteStoredFileRepository implements StoredFileRepository {
  readonly #insert;
  readonly #findById;
  readonly #findByDomainId;
  readonly #listRootByState;
  readonly #listFolderByState;
  readonly #listDeleted;
  readonly #update;
  readonly #deletePending;
  readonly #listStale;

  constructor(database: SqliteDatabase) {
    this.#insert = database.prepare<StoredFileParameters>(`
      INSERT INTO files (
        id, owner_domain_id, uploaded_by_account_id, folder_id, display_name, storage_provider, object_key,
        media_type, size_bytes, checksum_algorithm, checksum, state, revision,
        created_at, updated_at, activated_at, deleted_at, purged_at
      )
      SELECT
        @id, ownership_domains.id, @ownerId, @folderId, @displayName, @storageProvider, @objectKey,
        @mediaType, @sizeBytes, @checksumAlgorithm, @checksum, @state, @revision,
        @createdAt, @updatedAt, @activatedAt, @deletedAt, @purgedAt
      FROM ownership_domains
      WHERE kind = 'account' AND account_id = @ownerId
    `);
    this.#findById = database.prepare<[string, string], StoredFileRow>(`
      SELECT
        files.id, COALESCE(ownership_domains.account_id, ownership_domains.id) AS owner_id, files.folder_id,
        files.display_name, files.storage_provider, files.object_key,
        files.media_type, files.size_bytes, files.checksum_algorithm, files.checksum,
        files.state, files.revision, files.created_at, files.updated_at,
        files.activated_at, files.deleted_at, files.purged_at
      FROM files
      JOIN ownership_domains ON ownership_domains.id = files.owner_domain_id
      WHERE ownership_domains.kind = 'account'
        AND ownership_domains.account_id = ? AND files.id = ?
    `);
    this.#findByDomainId = database.prepare<[string, string], StoredFileRow>(`
      SELECT
        files.id, COALESCE(ownership_domains.account_id, ownership_domains.id) AS owner_id, files.folder_id,
        files.display_name, files.storage_provider, files.object_key,
        files.media_type, files.size_bytes, files.checksum_algorithm, files.checksum,
        files.state, files.revision, files.created_at, files.updated_at,
        files.activated_at, files.deleted_at, files.purged_at
      FROM files
      JOIN ownership_domains ON ownership_domains.id = files.owner_domain_id
      WHERE files.owner_domain_id = ? AND files.id = ?
    `);
    const columns = `
      files.id, ownership_domains.account_id AS owner_id, files.folder_id,
      files.display_name, files.storage_provider, files.object_key,
      files.media_type, files.size_bytes, files.checksum_algorithm, files.checksum,
      files.state, files.revision, files.created_at, files.updated_at,
      files.activated_at, files.deleted_at, files.purged_at
    `;
    const qualifiedColumns = `
      files.id, ownership_domains.account_id AS owner_id, files.folder_id, files.display_name,
      files.storage_provider, files.object_key, files.media_type,
      files.size_bytes, files.checksum_algorithm, files.checksum,
      files.state, files.revision, files.created_at, files.updated_at,
      files.activated_at, files.deleted_at, files.purged_at
    `;
    this.#listRootByState = database.prepare<[string, StoredFileState], StoredFileRow>(`
      SELECT ${columns} FROM files
      JOIN ownership_domains ON ownership_domains.id = files.owner_domain_id
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = ?
        AND files.folder_id IS NULL AND files.state = ?
      ORDER BY files.display_name COLLATE NOCASE, files.id
    `);
    this.#listFolderByState = database.prepare<[string, string, StoredFileState], StoredFileRow>(`
      SELECT ${columns} FROM files
      JOIN ownership_domains ON ownership_domains.id = files.owner_domain_id
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = ?
        AND files.folder_id = ? AND files.state = ?
      ORDER BY files.display_name COLLATE NOCASE, files.id
    `);
    this.#listDeleted = database.prepare<[string], StoredFileRow>(`
      SELECT ${qualifiedColumns}
      FROM files
      JOIN ownership_domains ON ownership_domains.id = files.owner_domain_id
      JOIN recycle_groups ON recycle_groups.id = files.recycle_group_id
        AND recycle_groups.owner_domain_id = files.owner_domain_id
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = ?
        AND files.state IN ('deleted', 'purging')
        AND recycle_groups.root_kind = 'file'
        AND recycle_groups.root_id = files.id
      ORDER BY files.deleted_at DESC, files.id
    `);
    this.#update = database.prepare<StoredFileParameters>(`
      UPDATE files SET
        folder_id = @folderId, display_name = @displayName,
        media_type = @mediaType, size_bytes = @sizeBytes,
        checksum_algorithm = @checksumAlgorithm, checksum = @checksum,
        state = @state, revision = revision + 1,
        updated_at = @updatedAt, activated_at = @activatedAt,
        deleted_at = @deletedAt, purged_at = @purgedAt
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = @ownerId
      ) AND id = @id
        AND state = @expectedState AND revision = @expectedRevision
    `);
    this.#deletePending = database.prepare<[string, string, number]>(`
      DELETE FROM files
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = ?
      ) AND id = ? AND state = 'pending_upload' AND revision = ?
    `);
    this.#listStale = database.prepare<[StoredFileState, string, number], StoredFileRow>(`
      SELECT ${columns} FROM files
      JOIN ownership_domains ON ownership_domains.id = files.owner_domain_id
      WHERE ownership_domains.kind = 'account' AND files.state = ? AND files.updated_at <= ?
      ORDER BY files.updated_at, files.owner_domain_id, files.id
      LIMIT ?
    `);
  }

  create(file: NewStoredFile): StoredFile {
    this.#insert.run({
      id: file.id,
      ownerId: file.ownerId,
      folderId: file.folderId,
      displayName: file.displayName,
      storageProvider: file.storageProvider,
      objectKey: file.objectKey,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
      checksumAlgorithm: file.checksumAlgorithm,
      checksum: file.checksum,
      state: file.state,
      revision: file.revision,
      createdAt: toDatabaseTimestamp(file.createdAt)!,
      updatedAt: toDatabaseTimestamp(file.updatedAt)!,
      activatedAt: toDatabaseTimestamp(file.activatedAt),
      deletedAt: toDatabaseTimestamp(file.deletedAt),
      purgedAt: toDatabaseTimestamp(file.purgedAt),
    });

    return this.findById(file.ownerId, file.id)!;
  }

  findById(ownerId: string, id: string): StoredFile | null {
    const row = this.#findById.get(ownerId, id);
    return row ? toStoredFile(row) : null;
  }

  findByDomainId(ownerDomainId: string, id: string): StoredFile | null {
    const row = this.#findByDomainId.get(ownerDomainId, id);
    return row ? toStoredFile(row) : null;
  }

  listByFolder(ownerId: string, folderId: string | null, state: StoredFileState): StoredFile[] {
    const rows = folderId === null
      ? this.#listRootByState.all(ownerId, state)
      : this.#listFolderByState.all(ownerId, folderId, state);
    return rows.map(toStoredFile);
  }

  listDeleted(ownerId: string): StoredFile[] {
    return this.#listDeleted.all(ownerId).map(toStoredFile);
  }

  listStale(state: "pending_upload" | "purging", updatedBefore: Date, limit: number): StoredFile[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new RangeError("stale file scan limit must be an integer from 1 to 1000");
    }
    return this.#listStale.all(state, toDatabaseTimestamp(updatedBefore)!, limit).map(toStoredFile);
  }

  update(
    file: StoredFile,
    expectedState: StoredFileState,
    expectedRevision: number,
  ): StoredFile | null {
    const result = this.#update.run({
      id: file.id,
      ownerId: file.ownerId,
      folderId: file.folderId,
      displayName: file.displayName,
      storageProvider: file.storageProvider,
      objectKey: file.objectKey,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
      checksumAlgorithm: file.checksumAlgorithm,
      checksum: file.checksum,
      state: file.state,
      revision: file.revision,
      createdAt: toDatabaseTimestamp(file.createdAt)!,
      updatedAt: toDatabaseTimestamp(file.updatedAt)!,
      activatedAt: toDatabaseTimestamp(file.activatedAt),
      deletedAt: toDatabaseTimestamp(file.deletedAt),
      purgedAt: toDatabaseTimestamp(file.purgedAt),
      expectedState,
      expectedRevision,
    });
    return result.changes === 1 ? this.findById(file.ownerId, file.id) : null;
  }

  deletePending(ownerId: string, id: string, expectedRevision: number): boolean {
    return this.#deletePending.run(ownerId, id, expectedRevision).changes === 1;
  }
}
