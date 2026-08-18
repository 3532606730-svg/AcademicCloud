import type {
  DomainRecycleGroup,
  NewDomainRecycleGroup,
  RecycleRepository,
} from "../../drive/recycle-repository.js";
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

interface DomainRecycleGroupRow {
  id: string;
  owner_domain_id: string;
  created_by_account_id: string;
  root_kind: RecycleRootKind;
  root_id: string;
  folder_count: number;
  file_count: number;
  created_at: string;
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

function toDomainRecycleGroup(row: DomainRecycleGroupRow): DomainRecycleGroup {
  return {
    id: row.id,
    ownerDomainId: row.owner_domain_id,
    createdByAccountId: row.created_by_account_id,
    rootKind: row.root_kind,
    rootId: row.root_id,
    folderCount: row.folder_count,
    fileCount: row.file_count,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
  };
}

export class SqliteRecycleRepository implements RecycleRepository {
  readonly #insertGroup;
  readonly #insertGroupForDomain;
  readonly #findGroupById;
  readonly #findGroupByRoot;
  readonly #listFolderIds;
  readonly #listFileIds;
  readonly #recycleFolder;
  readonly #recycleFile;
  readonly #recycleFileForDomain;
  readonly #findGroupByRootForDomain;
  readonly #listFolderIdsForDomain;
  readonly #listFileIdsForDomain;
  readonly #restoreFileForDomain;
  readonly #deleteGroupForDomain;
  readonly #restoreFolder;
  readonly #restoreFile;
  readonly #markFilePurged;
  readonly #markFilePurgedForDomain;
  readonly #deleteGroup;

  constructor(database: SqliteDatabase) {
    const groupColumns = `
      recycle_groups.id, ownership_domains.account_id AS owner_id,
      recycle_groups.root_kind, recycle_groups.root_id,
      recycle_groups.folder_count, recycle_groups.file_count, recycle_groups.created_at
    `;
    this.#insertGroup = database.prepare<RecycleGroupParameters>(`
      INSERT INTO recycle_groups (
        id, owner_domain_id, created_by_account_id, root_kind, root_id,
        folder_count, file_count, created_at
      )
      SELECT
        @id, ownership_domains.id, @ownerId, @rootKind, @rootId,
        @folderCount, @fileCount, @createdAt
      FROM ownership_domains
      WHERE kind = 'account' AND account_id = @ownerId
    `);
    this.#insertGroupForDomain = database.prepare<{
      id: string;
      ownerDomainId: string;
      createdByAccountId: string;
      rootKind: RecycleRootKind;
      rootId: string;
      folderCount: number;
      fileCount: number;
      createdAt: string;
    }>(`
      INSERT INTO recycle_groups (
        id, owner_domain_id, created_by_account_id, root_kind, root_id,
        folder_count, file_count, created_at
      )
      SELECT
        @id, ownership_domains.id, @createdByAccountId, @rootKind, @rootId,
        @folderCount, @fileCount, @createdAt
      FROM ownership_domains
      WHERE ownership_domains.id = @ownerDomainId
    `);
    this.#findGroupById = database.prepare<[string, string], RecycleGroupRow>(`
      SELECT ${groupColumns}
      FROM recycle_groups
      JOIN ownership_domains ON ownership_domains.id = recycle_groups.owner_domain_id
      WHERE ownership_domains.kind = 'account'
        AND ownership_domains.account_id = ? AND recycle_groups.id = ?
    `);
    this.#findGroupByRoot = database.prepare<[string, RecycleRootKind, string], RecycleGroupRow>(`
      SELECT ${groupColumns}
      FROM recycle_groups
      JOIN ownership_domains ON ownership_domains.id = recycle_groups.owner_domain_id
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = ?
        AND recycle_groups.root_kind = ? AND recycle_groups.root_id = ?
    `);
    this.#listFolderIds = database.prepare<[string, string, string], { id: string }>(`
      SELECT folders.id
      FROM folders
      JOIN recycle_groups ON recycle_groups.id = folders.recycle_group_id
        AND recycle_groups.owner_domain_id = folders.owner_domain_id
      JOIN ownership_domains ON ownership_domains.id = folders.owner_domain_id
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = ?
        AND recycle_groups.owner_domain_id = (
          SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = ?
        ) AND folders.recycle_group_id = ?
      ORDER BY folders.id
    `);
    this.#listFileIds = database.prepare<[string, string, string], { id: string }>(`
      SELECT files.id
      FROM files
      JOIN recycle_groups ON recycle_groups.id = files.recycle_group_id
        AND recycle_groups.owner_domain_id = files.owner_domain_id
      JOIN ownership_domains ON ownership_domains.id = files.owner_domain_id
      WHERE ownership_domains.kind = 'account' AND ownership_domains.account_id = ?
        AND recycle_groups.owner_domain_id = (
          SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = ?
        ) AND files.recycle_group_id = ?
      ORDER BY files.id
    `);
    this.#recycleFolder = database.prepare<[string, string, string, string, string]>(`
      UPDATE folders
      SET state = 'deleted', updated_at = ?, deleted_at = ?, recycle_group_id = ?
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = ?
      ) AND id = ? AND state = 'active' AND recycle_group_id IS NULL
    `);
    this.#recycleFile = database.prepare<[string, string, string, string, string, number]>(`
      UPDATE files
      SET state = 'deleted', revision = revision + 1,
          updated_at = ?, deleted_at = ?, recycle_group_id = ?
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = ?
      ) AND id = ? AND state = 'active'
        AND revision = ? AND recycle_group_id IS NULL
    `);
    this.#recycleFileForDomain = database.prepare<[string, string, string, string, string, number]>(`
      UPDATE files
      SET state = 'deleted', revision = revision + 1,
          updated_at = ?, deleted_at = ?, recycle_group_id = ?
      WHERE owner_domain_id = ? AND id = ? AND state = 'active'
        AND revision = ? AND recycle_group_id IS NULL
    `);
    this.#findGroupByRootForDomain = database.prepare<
      [string, RecycleRootKind, string],
      DomainRecycleGroupRow
    >(`
      SELECT
        recycle_groups.id, recycle_groups.owner_domain_id,
        recycle_groups.created_by_account_id, recycle_groups.root_kind,
        recycle_groups.root_id, recycle_groups.folder_count,
        recycle_groups.file_count, recycle_groups.created_at
      FROM recycle_groups
      WHERE recycle_groups.owner_domain_id = ?
        AND recycle_groups.root_kind = ? AND recycle_groups.root_id = ?
    `);
    this.#listFolderIdsForDomain = database.prepare<[string, string], { id: string }>(`
      SELECT folders.id
      FROM folders
      JOIN recycle_groups ON recycle_groups.id = folders.recycle_group_id
        AND recycle_groups.owner_domain_id = folders.owner_domain_id
      WHERE folders.owner_domain_id = ? AND folders.recycle_group_id = ?
      ORDER BY folders.id
    `);
    this.#listFileIdsForDomain = database.prepare<[string, string], { id: string }>(`
      SELECT files.id
      FROM files
      JOIN recycle_groups ON recycle_groups.id = files.recycle_group_id
        AND recycle_groups.owner_domain_id = files.owner_domain_id
      WHERE files.owner_domain_id = ? AND files.recycle_group_id = ?
      ORDER BY files.id
    `);
    this.#restoreFileForDomain = database.prepare<[string, string, string, number, string]>(`
      UPDATE files
      SET state = 'active', revision = revision + 1,
          updated_at = ?, deleted_at = NULL, recycle_group_id = NULL
      WHERE owner_domain_id = ? AND id = ? AND state = 'deleted'
        AND revision = ? AND recycle_group_id = ?
    `);
    this.#deleteGroupForDomain = database.prepare<[string, string]>(`
      DELETE FROM recycle_groups WHERE owner_domain_id = ? AND id = ?
    `);
    this.#restoreFolder = database.prepare<[string, string, string, string]>(`
      UPDATE folders
      SET state = 'active', updated_at = ?, deleted_at = NULL, recycle_group_id = NULL
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = ?
      ) AND id = ? AND state = 'deleted' AND recycle_group_id = ?
    `);
    this.#restoreFile = database.prepare<[string, string, string, number, string]>(`
      UPDATE files
      SET state = 'active', revision = revision + 1,
          updated_at = ?, deleted_at = NULL, recycle_group_id = NULL
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = ?
      ) AND id = ? AND state = 'deleted'
        AND revision = ? AND recycle_group_id = ?
    `);
    this.#markFilePurged = database.prepare<[string, string, string, string, number, string]>(`
      UPDATE files
      SET state = 'purged', revision = revision + 1,
          updated_at = ?, purged_at = ?, recycle_group_id = NULL
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = ?
      ) AND id = ? AND state = 'purging'
        AND revision = ? AND recycle_group_id = ?
    `);
    this.#markFilePurgedForDomain = database.prepare<[string, string, string, string, number, string]>(`
      UPDATE files
      SET state = 'purged', revision = revision + 1,
          updated_at = ?, purged_at = ?, recycle_group_id = NULL
      WHERE owner_domain_id = ? AND id = ? AND state = 'purging'
        AND revision = ? AND recycle_group_id = ?
    `);
    this.#deleteGroup = database.prepare<[string, string]>(`
      DELETE FROM recycle_groups
      WHERE owner_domain_id = (
        SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = ?
      ) AND id = ?
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

  createGroupForDomain(group: NewDomainRecycleGroup): boolean {
    return this.#insertGroupForDomain.run({
      id: group.id,
      ownerDomainId: group.ownerDomainId,
      createdByAccountId: group.createdByAccountId,
      rootKind: group.rootKind,
      rootId: group.rootId,
      folderCount: group.folderCount,
      fileCount: group.fileCount,
      createdAt: toDatabaseTimestamp(group.createdAt)!,
    }).changes === 1;
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

  recycleFileForDomain(
    ownerDomainId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    deletedAt: Date,
  ): boolean {
    const timestamp = toDatabaseTimestamp(deletedAt)!;
    return this.#recycleFileForDomain.run(
      timestamp,
      timestamp,
      groupId,
      ownerDomainId,
      fileId,
      expectedRevision,
    ).changes === 1;
  }

  findGroupByRootForDomain(
    ownerDomainId: string,
    rootKind: RecycleRootKind,
    rootId: string,
  ): DomainRecycleGroup | null {
    const row = this.#findGroupByRootForDomain.get(ownerDomainId, rootKind, rootId);
    return row ? toDomainRecycleGroup(row) : null;
  }

  listFolderIdsForDomain(ownerDomainId: string, groupId: string): string[] {
    return this.#listFolderIdsForDomain.all(ownerDomainId, groupId).map((row) => row.id);
  }

  listFileIdsForDomain(ownerDomainId: string, groupId: string): string[] {
    return this.#listFileIdsForDomain.all(ownerDomainId, groupId).map((row) => row.id);
  }

  restoreFileForDomain(
    ownerDomainId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    restoredAt: Date,
  ): boolean {
    return this.#restoreFileForDomain.run(
      toDatabaseTimestamp(restoredAt)!,
      ownerDomainId,
      fileId,
      expectedRevision,
      groupId,
    ).changes === 1;
  }

  deleteGroupForDomain(ownerDomainId: string, groupId: string): boolean {
    return this.#deleteGroupForDomain.run(ownerDomainId, groupId).changes === 1;
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

  markFilePurgedForDomain(
    ownerDomainId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    purgedAt: Date,
  ): boolean {
    const timestamp = toDatabaseTimestamp(purgedAt)!;
    return this.#markFilePurgedForDomain.run(
      timestamp,
      timestamp,
      ownerDomainId,
      fileId,
      expectedRevision,
      groupId,
    ).changes === 1;
  }

  deleteGroup(ownerId: string, groupId: string): boolean {
    return this.#deleteGroup.run(ownerId, groupId).changes === 1;
  }
}
