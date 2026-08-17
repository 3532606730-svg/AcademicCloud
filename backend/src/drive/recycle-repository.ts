import type { RecycleGroup, RecycleRootKind, NewRecycleGroup } from "./recycle.js";

export interface RecycleRepository {
  createGroup(group: NewRecycleGroup): RecycleGroup;
  findGroupById(ownerId: string, groupId: string): RecycleGroup | null;
  findGroupByRoot(ownerId: string, rootKind: RecycleRootKind, rootId: string): RecycleGroup | null;
  listFolderIds(ownerId: string, groupId: string): string[];
  listFileIds(ownerId: string, groupId: string): string[];
  recycleFolder(ownerId: string, folderId: string, groupId: string, deletedAt: Date): boolean;
  recycleFile(
    ownerId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    deletedAt: Date,
  ): boolean;
  restoreFolder(ownerId: string, folderId: string, groupId: string, restoredAt: Date): boolean;
  restoreFile(
    ownerId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    restoredAt: Date,
  ): boolean;
  markFilePurged(
    ownerId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    purgedAt: Date,
  ): boolean;
  deleteGroup(ownerId: string, groupId: string): boolean;
}
