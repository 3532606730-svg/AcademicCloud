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
  readonly #listRootByState;
  readonly #listChildByState;
  readonly #listDeleted;
  readonly #update;

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
    this.#listRootByState = database.prepare<[string, FolderState], FolderRow>(`
      SELECT id, owner_id, parent_id, name, state, created_at, updated_at, deleted_at
      FROM folders
      WHERE owner_id = ? AND parent_id IS NULL AND state = ?
      ORDER BY name COLLATE NOCASE, id
    `);
    this.#listChildByState = database.prepare<[string, string, FolderState], FolderRow>(`
      SELECT id, owner_id, parent_id, name, state, created_at, updated_at, deleted_at
      FROM folders
      WHERE owner_id = ? AND parent_id = ? AND state = ?
      ORDER BY name COLLATE NOCASE, id
    `);
    this.#listDeleted = database.prepare<[string], FolderRow>(`
      SELECT id, owner_id, parent_id, name, state, created_at, updated_at, deleted_at
      FROM folders
      WHERE owner_id = ? AND state = 'deleted'
      ORDER BY deleted_at DESC, id
    `);
    this.#update = database.prepare<FolderParameters>(`
      UPDATE folders
      SET parent_id = @parentId, name = @name, state = @state,
          updated_at = @updatedAt, deleted_at = @deletedAt
      WHERE owner_id = @ownerId AND id = @id
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

  listByParent(ownerId: string, parentId: string | null, state: FolderState): Folder[] {
    const rows = parentId === null
      ? this.#listRootByState.all(ownerId, state)
      : this.#listChildByState.all(ownerId, parentId, state);
    return rows.map(toFolder);
  }

  listDeleted(ownerId: string): Folder[] {
    return this.#listDeleted.all(ownerId).map(toFolder);
  }

  update(folder: Folder): Folder {
    const result = this.#update.run({
      id: folder.id,
      ownerId: folder.ownerId,
      parentId: folder.parentId,
      name: folder.name,
      state: folder.state,
      createdAt: toDatabaseTimestamp(folder.createdAt)!,
      updatedAt: toDatabaseTimestamp(folder.updatedAt)!,
      deletedAt: toDatabaseTimestamp(folder.deletedAt),
    });
    if (result.changes !== 1) {
      throw new Error("folder update target was not found");
    }
    return this.findById(folder.ownerId, folder.id)!;
  }
}
