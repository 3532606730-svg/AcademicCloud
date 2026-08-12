import type { Folder, FolderState, NewFolder } from "../../drive/folder.js";
import type { FolderRepository } from "../../drive/repositories.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface FolderRow {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  state: FolderState;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface FolderParameters {
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  state: FolderState;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    ownerId: row.owner_id,
    parentId: row.parent_id,
    name: row.name,
    state: row.state,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
    deletedAt: fromDatabaseTimestamp(row.deleted_at),
  };
}

export class SqliteFolderRepository implements FolderRepository {
  readonly #insert;
  readonly #findById;

  constructor(database: SqliteDatabase) {
    this.#insert = database.prepare<FolderParameters>(`
      INSERT INTO folders (
        id, owner_id, parent_id, name, state, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @ownerId, @parentId, @name, @state, @createdAt, @updatedAt, @deletedAt
      )
    `);
    this.#findById = database.prepare<[string, string], FolderRow>(`
      SELECT id, owner_id, parent_id, name, state, created_at, updated_at, deleted_at
      FROM folders
      WHERE owner_id = ? AND id = ?
    `);
  }

  create(folder: NewFolder): Folder {
    this.#insert.run({
      id: folder.id,
      ownerId: folder.ownerId,
      parentId: folder.parentId,
      name: folder.name,
      state: folder.state,
      createdAt: toDatabaseTimestamp(folder.createdAt)!,
      updatedAt: toDatabaseTimestamp(folder.updatedAt)!,
      deletedAt: toDatabaseTimestamp(folder.deletedAt),
    });

    return this.findById(folder.ownerId, folder.id)!;
  }

  findById(ownerId: string, id: string): Folder | null {
    const row = this.#findById.get(ownerId, id);
    return row ? toFolder(row) : null;
  }
}
