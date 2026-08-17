import type { RecycleRepository } from "../../drive/recycle-repository.js";
import type { NewRecycleGroup, RecycleGroup, RecycleRootKind } from "../../drive/recycle.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface RecycleGroupRow {
  id: string;
  owner_id: string;
  root_kind: RecycleRootKind;
  root_id: string;
  folder_count: number;
  file_count: number;
  created_at: string;
}

interface RecycleGroupParameters {
  id: string;
  ownerId: string;
  rootKind: RecycleRootKind;
  rootId: string;
  folderCount: number;
  fileCount: number;
  createdAt: string;
}

function toRecycleGroup(row: RecycleGroupRow): RecycleGroup {
  return {
    id: row.id,
    ownerId: row.owner_id,
    rootKind: row.root_kind,
    rootId: row.root_id,
    folderCount: row.folder_count,
    fileCount: row.file_count,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
  };
}

export class SqliteRecycleRepository implements RecycleRepository {
  readonly #insertGroup;
  readonly #findGroupById;
  readonly #findGroupByRoot;
  readonly #listFolderIds;
  readonly #listFileIds;
  readonly #recycleFolder;
  readonly #recycleFile;
  readonly #restoreFolder;
  readonly #restoreFile;
  readonly #markFilePurged;
  readonly #deleteGroup;

  constructor(database: SqliteDatabase) {
    const groupColumns = `
      id, owner_id, root_kind, root_id, folder_count, file_count, created_at
    `;
    this.#insertGroup = database.prepare<RecycleGroupParameters>(`
      INSERT INTO recycle_groups (
        id, owner_id, root_kind, root_id, folder_count, file_count, created_at
      ) VALUES (
        @id, @ownerId, @rootKind, @rootId, @folderCount, @fileCount, @createdAt
      )
    `);
    this.#findGroupById = database.prepare<[string, string], RecycleGroupRow>(`
      SELECT ${groupColumns}
      FROM recycle_groups
      WHERE owner_id = ? AND id = ?
    `);
    this.#findGroupByRoot = database.prepare<[string, RecycleRootKind, string], RecycleGroupRow>(`
      SELECT ${groupColumns}
      FROM recycle_groups
      WHERE owner_id = ? AND root_kind = ? AND root_id = ?
    `);
    this.#listFolderIds = database.prepare<[string, string, string], { id: string }>(`
      SELECT folders.id
      FROM folders
      JOIN recycle_groups ON recycle_groups.id = folders.recycle_group_id
      WHERE folders.owner_id = ? AND recycle_groups.owner_id = ?
        AND folders.recycle_group_id = ?
      ORDER BY folders.id
    `);
    this.#listFileIds = database.prepare<[string, string, string], { id: string }>(`
      SELECT files.id
      FROM files
      JOIN recycle_groups ON recycle_groups.id = files.recycle_group_id
      WHERE files.owner_id = ? AND recycle_groups.owner_id = ?
        AND files.recycle_group_id = ?
      ORDER BY files.id
    `);
    this.#recycleFolder = database.prepare<[string, string, string, string, string]>(`
      UPDATE folders
      SET state = 'deleted', updated_at = ?, deleted_at = ?, recycle_group_id = ?
      WHERE owner_id = ? AND id = ? AND state = 'active' AND recycle_group_id IS NULL
    `);
    this.#recycleFile = database.prepare<[string, string, string, string, string, number]>(`
      UPDATE files
      SET state = 'deleted', revision = revision + 1,
          updated_at = ?, deleted_at = ?, recycle_group_id = ?
      WHERE owner_id = ? AND id = ? AND state = 'active'
        AND revision = ? AND recycle_group_id IS NULL
    `);
    this.#restoreFolder = database.prepare<[string, string, string, string]>(`
      UPDATE folders
      SET state = 'active', updated_at = ?, deleted_at = NULL, recycle_group_id = NULL
      WHERE owner_id = ? AND id = ? AND state = 'deleted' AND recycle_group_id = ?
    `);
    this.#restoreFile = database.prepare<[string, string, string, number, string]>(`
      UPDATE files
      SET state = 'active', revision = revision + 1,
          updated_at = ?, deleted_at = NULL, recycle_group_id = NULL
      WHERE owner_id = ? AND id = ? AND state = 'deleted'
        AND revision = ? AND recycle_group_id = ?
    `);
    this.#markFilePurged = database.prepare<[string, string, string, string, number, string]>(`
      UPDATE files
      SET state = 'purged', revision = revision + 1,
          updated_at = ?, purged_at = ?, recycle_group_id = NULL
      WHERE owner_id = ? AND id = ? AND state = 'purging'
        AND revision = ? AND recycle_group_id = ?
    `);
    this.#deleteGroup = database.prepare<[string, string]>(`
      DELETE FROM recycle_groups WHERE owner_id = ? AND id = ?
    `);
  }

  createGroup(group: NewRecycleGroup): RecycleGroup {
    this.#insertGroup.run({
      id: group.id,
      ownerId: group.ownerId,
      rootKind: group.rootKind,
      rootId: group.rootId,
      folderCount: group.folderCount,
      fileCount: group.fileCount,
      createdAt: toDatabaseTimestamp(group.createdAt)!,
    });
    return this.findGroupById(group.ownerId, group.id)!;
  }

  findGroupById(ownerId: string, groupId: string): RecycleGroup | null {
    const row = this.#findGroupById.get(ownerId, groupId);
    return row ? toRecycleGroup(row) : null;
  }

  findGroupByRoot(ownerId: string, rootKind: RecycleRootKind, rootId: string): RecycleGroup | null {
    const row = this.#findGroupByRoot.get(ownerId, rootKind, rootId);
    return row ? toRecycleGroup(row) : null;
  }

  listFolderIds(ownerId: string, groupId: string): string[] {
    return this.#listFolderIds.all(ownerId, ownerId, groupId).map((row) => row.id);
  }

  listFileIds(ownerId: string, groupId: string): string[] {
    return this.#listFileIds.all(ownerId, ownerId, groupId).map((row) => row.id);
  }

  recycleFolder(ownerId: string, folderId: string, groupId: string, deletedAt: Date): boolean {
    const timestamp = toDatabaseTimestamp(deletedAt)!;
    return this.#recycleFolder.run(timestamp, timestamp, groupId, ownerId, folderId).changes === 1;
  }

  recycleFile(
    ownerId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    deletedAt: Date,
  ): boolean {
    const timestamp = toDatabaseTimestamp(deletedAt)!;
    return this.#recycleFile.run(timestamp, timestamp, groupId, ownerId, fileId, expectedRevision).changes === 1;
  }

  restoreFolder(ownerId: string, folderId: string, groupId: string, restoredAt: Date): boolean {
    return this.#restoreFolder.run(toDatabaseTimestamp(restoredAt)!, ownerId, folderId, groupId).changes === 1;
  }

  restoreFile(
    ownerId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    restoredAt: Date,
  ): boolean {
    return this.#restoreFile.run(
      toDatabaseTimestamp(restoredAt)!,
      ownerId,
      fileId,
      expectedRevision,
      groupId,
    ).changes === 1;
  }

  markFilePurged(
    ownerId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    purgedAt: Date,
  ): boolean {
    const timestamp = toDatabaseTimestamp(purgedAt)!;
    return this.#markFilePurged.run(
      timestamp,
      timestamp,
      ownerId,
      fileId,
      expectedRevision,
      groupId,
    ).changes === 1;
  }

  deleteGroup(ownerId: string, groupId: string): boolean {
    return this.#deleteGroup.run(ownerId, groupId).changes === 1;
  }
}
