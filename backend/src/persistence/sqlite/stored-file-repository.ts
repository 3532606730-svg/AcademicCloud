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
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  deletedAt: string | null;
  purgedAt: string | null;
  expectedState?: StoredFileState;
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
  readonly #listRootByState;
  readonly #listFolderByState;
  readonly #listDeleted;
  readonly #update;
  readonly #deletePending;

  constructor(database: SqliteDatabase) {
    this.#insert = database.prepare<StoredFileParameters>(`
      INSERT INTO files (
        id, owner_id, folder_id, display_name, storage_provider, object_key,
        media_type, size_bytes, checksum_algorithm, checksum, state,
        created_at, updated_at, activated_at, deleted_at, purged_at
      ) VALUES (
        @id, @ownerId, @folderId, @displayName, @storageProvider, @objectKey,
        @mediaType, @sizeBytes, @checksumAlgorithm, @checksum, @state,
        @createdAt, @updatedAt, @activatedAt, @deletedAt, @purgedAt
      )
    `);
    this.#findById = database.prepare<[string, string], StoredFileRow>(`
      SELECT
        id, owner_id, folder_id, display_name, storage_provider, object_key,
        media_type, size_bytes, checksum_algorithm, checksum, state,
        created_at, updated_at, activated_at, deleted_at, purged_at
      FROM files
      WHERE owner_id = ? AND id = ?
    `);
    const columns = `
      id, owner_id, folder_id, display_name, storage_provider, object_key,
      media_type, size_bytes, checksum_algorithm, checksum, state,
      created_at, updated_at, activated_at, deleted_at, purged_at
    `;
    this.#listRootByState = database.prepare<[string, StoredFileState], StoredFileRow>(`
      SELECT ${columns} FROM files
      WHERE owner_id = ? AND folder_id IS NULL AND state = ?
      ORDER BY display_name COLLATE NOCASE, id
    `);
    this.#listFolderByState = database.prepare<[string, string, StoredFileState], StoredFileRow>(`
      SELECT ${columns} FROM files
      WHERE owner_id = ? AND folder_id = ? AND state = ?
      ORDER BY display_name COLLATE NOCASE, id
    `);
    this.#listDeleted = database.prepare<[string], StoredFileRow>(`
      SELECT ${columns} FROM files
      WHERE owner_id = ? AND state IN ('deleted', 'purging')
      ORDER BY deleted_at DESC, id
    `);
    this.#update = database.prepare<StoredFileParameters>(`
      UPDATE files SET
        folder_id = @folderId, display_name = @displayName,
        media_type = @mediaType, size_bytes = @sizeBytes,
        checksum_algorithm = @checksumAlgorithm, checksum = @checksum,
        state = @state, updated_at = @updatedAt, activated_at = @activatedAt,
        deleted_at = @deletedAt, purged_at = @purgedAt
      WHERE owner_id = @ownerId AND id = @id AND state = @expectedState
    `);
    this.#deletePending = database.prepare<[string, string]>(`
      DELETE FROM files WHERE owner_id = ? AND id = ? AND state = 'pending_upload'
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

  listByFolder(ownerId: string, folderId: string | null, state: StoredFileState): StoredFile[] {
    const rows = folderId === null
      ? this.#listRootByState.all(ownerId, state)
      : this.#listFolderByState.all(ownerId, folderId, state);
    return rows.map(toStoredFile);
  }

  listDeleted(ownerId: string): StoredFile[] {
    return this.#listDeleted.all(ownerId).map(toStoredFile);
  }

  update(file: StoredFile, expectedState: StoredFileState): StoredFile | null {
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
      createdAt: toDatabaseTimestamp(file.createdAt)!,
      updatedAt: toDatabaseTimestamp(file.updatedAt)!,
      activatedAt: toDatabaseTimestamp(file.activatedAt),
      deletedAt: toDatabaseTimestamp(file.deletedAt),
      purgedAt: toDatabaseTimestamp(file.purgedAt),
      expectedState,
    });
    return result.changes === 1 ? this.findById(file.ownerId, file.id) : null;
  }

  deletePending(ownerId: string, id: string): boolean {
    return this.#deletePending.run(ownerId, id).changes === 1;
  }
}
