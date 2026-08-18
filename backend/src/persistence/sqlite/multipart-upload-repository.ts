import type {
  MultipartUpload,
  MultipartUploadRepository,
  MultipartUploadState,
  NewMultipartUpload,
} from "../../transfer/multipart-transfer.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface MultipartUploadRow {
  file_id: string;
  owner_id: string;
  storage_provider: string;
  provider_upload_id: string;
  part_size_bytes: number;
  total_parts: number;
  state: MultipartUploadState;
  revision: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

interface MultipartUploadParameters {
  fileId: string;
  ownerId: string;
  storageProvider: string;
  providerUploadId: string;
  partSizeBytes: number;
  totalParts: number;
  state: MultipartUploadState;
  revision: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  expectedState?: MultipartUploadState;
  expectedRevision?: number;
}

function toMultipartUpload(row: MultipartUploadRow): MultipartUpload {
  return {
    fileId: row.file_id,
    ownerId: row.owner_id,
    storageProvider: row.storage_provider,
    providerUploadId: row.provider_upload_id,
    partSizeBytes: row.part_size_bytes,
    totalParts: row.total_parts,
    state: row.state,
    revision: row.revision,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
    expiresAt: fromDatabaseTimestamp(row.expires_at)!,
  };
}

export class SqliteMultipartUploadRepository implements MultipartUploadRepository {
  readonly #insert;
  readonly #find;
  readonly #update;
  readonly #delete;
  readonly #listStale;

  constructor(database: SqliteDatabase) {
    const columns = `
      multipart_uploads.file_id, ownership_domains.account_id AS owner_id,
      multipart_uploads.storage_provider, multipart_uploads.provider_upload_id,
      multipart_uploads.part_size_bytes, multipart_uploads.total_parts,
      multipart_uploads.state, multipart_uploads.revision,
      multipart_uploads.created_at, multipart_uploads.updated_at, multipart_uploads.expires_at
    `;
    this.#insert = database.prepare<MultipartUploadParameters>(`
      INSERT INTO multipart_uploads (
        file_id, owner_domain_id, storage_provider, provider_upload_id,
        part_size_bytes, total_parts, state, revision, created_at, updated_at, expires_at
      )
      SELECT
        @fileId, ownership_domains.id, @storageProvider, @providerUploadId,
        @partSizeBytes, @totalParts, @state, @revision, @createdAt, @updatedAt, @expiresAt
      FROM ownership_domains
      JOIN files ON files.owner_domain_id = ownership_domains.id AND files.id = @fileId
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = @ownerId
        AND files.state = 'pending_upload' AND files.storage_provider = @storageProvider
    `);
    this.#find = database.prepare<[string, string], MultipartUploadRow>(`
      SELECT ${columns}
      FROM multipart_uploads
      JOIN ownership_domains ON ownership_domains.id = multipart_uploads.owner_domain_id
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = ?
        AND multipart_uploads.file_id = ?
    `);
    this.#update = database.prepare<MultipartUploadParameters>(`
      UPDATE multipart_uploads SET
        state = @state, revision = revision + 1,
        updated_at = @updatedAt, expires_at = @expiresAt
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = @ownerId
      ) AND file_id = @fileId AND state = @expectedState AND revision = @expectedRevision
    `);
    this.#delete = database.prepare<[string, string, number]>(`
      DELETE FROM multipart_uploads
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = ?
      ) AND file_id = ? AND revision = ?
    `);
    this.#listStale = database.prepare<[string, number], MultipartUploadRow>(`
      SELECT ${columns}
      FROM multipart_uploads
      JOIN ownership_domains ON ownership_domains.id = multipart_uploads.owner_domain_id
      JOIN files ON files.id = multipart_uploads.file_id
        AND files.owner_domain_id = multipart_uploads.owner_domain_id
      WHERE ownership_domains.kind = 'account' AND files.state = 'pending_upload'
        AND multipart_uploads.expires_at <= ?
      ORDER BY multipart_uploads.expires_at, multipart_uploads.owner_domain_id, multipart_uploads.file_id
      LIMIT ?
    `);
  }

  create(upload: NewMultipartUpload): MultipartUpload {
    const result = this.#insert.run(this.#parameters(upload));
    if (result.changes !== 1) throw new Error("multipart upload file is unavailable");
    return this.findByFileId(upload.ownerId, upload.fileId)!;
  }

  findByFileId(ownerId: string, fileId: string): MultipartUpload | null {
    const row = this.#find.get(ownerId, fileId);
    return row ? toMultipartUpload(row) : null;
  }

  update(upload: MultipartUpload, expectedState: MultipartUploadState, expectedRevision: number): MultipartUpload | null {
    const result = this.#update.run({
      ...this.#parameters(upload),
      expectedState,
      expectedRevision,
    });
    return result.changes === 1 ? this.findByFileId(upload.ownerId, upload.fileId) : null;
  }

  delete(ownerId: string, fileId: string, expectedRevision: number): boolean {
    return this.#delete.run(ownerId, fileId, expectedRevision).changes === 1;
  }

  listStale(expiresBefore: Date, limit: number): MultipartUpload[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new RangeError("multipart stale scan limit must be an integer from 1 to 1000");
    }
    return this.#listStale.all(toDatabaseTimestamp(expiresBefore)!, limit).map(toMultipartUpload);
  }

  #parameters(upload: MultipartUpload): MultipartUploadParameters {
    return {
      fileId: upload.fileId,
      ownerId: upload.ownerId,
      storageProvider: upload.storageProvider,
      providerUploadId: upload.providerUploadId,
      partSizeBytes: upload.partSizeBytes,
      totalParts: upload.totalParts,
      state: upload.state,
      revision: upload.revision,
      createdAt: toDatabaseTimestamp(upload.createdAt)!,
      updatedAt: toDatabaseTimestamp(upload.updatedAt)!,
      expiresAt: toDatabaseTimestamp(upload.expiresAt)!,
    };
  }
}
