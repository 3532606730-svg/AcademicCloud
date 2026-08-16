import type { FavoriteRepository } from "../../favorites/favorite-repository.js";
import type { SqliteDatabase } from "./database.js";
import { toDatabaseTimestamp } from "./records.js";

export class SqliteFavoriteRepository implements FavoriteRepository {
  readonly #listFileIds;
  readonly #listFolderIds;
  readonly #addFile;
  readonly #addFolder;
  readonly #removeFile;
  readonly #removeFolder;

  constructor(database: SqliteDatabase) {
    this.#listFileIds = database.prepare<[string], { file_id: string }>(`
      SELECT file_id FROM favorite_files WHERE account_id = ? ORDER BY file_id
    `);
    this.#listFolderIds = database.prepare<[string], { folder_id: string }>(`
      SELECT folder_id FROM favorite_folders WHERE account_id = ? ORDER BY folder_id
    `);
    // INSERT OR IGNORE keeps adds idempotent per (account, resource).
    this.#addFile = database.prepare<[string, string, string]>(`
      INSERT OR IGNORE INTO favorite_files (account_id, file_id, created_at)
      VALUES (?, ?, ?)
    `);
    this.#addFolder = database.prepare<[string, string, string]>(`
      INSERT OR IGNORE INTO favorite_folders (account_id, folder_id, created_at)
      VALUES (?, ?, ?)
    `);
    this.#removeFile = database.prepare<[string, string]>(`
      DELETE FROM favorite_files WHERE account_id = ? AND file_id = ?
    `);
    this.#removeFolder = database.prepare<[string, string]>(`
      DELETE FROM favorite_folders WHERE account_id = ? AND folder_id = ?
    `);
  }

  listFileIds(accountId: string): string[] {
    return this.#listFileIds.all(accountId).map((row) => row.file_id);
  }

  listFolderIds(accountId: string): string[] {
    return this.#listFolderIds.all(accountId).map((row) => row.folder_id);
  }

  addFile(accountId: string, fileId: string, createdAt: Date): void {
    this.#addFile.run(accountId, fileId, toDatabaseTimestamp(createdAt)!);
  }

  removeFile(accountId: string, fileId: string): void {
    this.#removeFile.run(accountId, fileId);
  }

  addFolder(accountId: string, folderId: string, createdAt: Date): void {
    this.#addFolder.run(accountId, folderId, toDatabaseTimestamp(createdAt)!);
  }

  removeFolder(accountId: string, folderId: string): void {
    this.#removeFolder.run(accountId, folderId);
  }
}
