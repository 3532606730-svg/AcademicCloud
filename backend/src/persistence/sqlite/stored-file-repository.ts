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
}
