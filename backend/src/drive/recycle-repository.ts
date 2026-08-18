import type { RecycleGroup, RecycleRootKind, NewRecycleGroup } from "./recycle.js";

export interface NewDomainRecycleGroup {
  id: string;
  ownerDomainId: string;
  createdByAccountId: string;
  rootKind: RecycleRootKind;
  rootId: string;
  folderCount: number;
  fileCount: number;
  createdAt: Date;
}

export interface DomainRecycleGroup extends NewDomainRecycleGroup {}

export interface RecycleRepository {
  createGroup(group: NewRecycleGroup): RecycleGroup;
  createGroupForDomain(group: NewDomainRecycleGroup): boolean;
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
  recycleFileForDomain(
    ownerDomainId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    deletedAt: Date,
  ): boolean;
  findGroupByRootForDomain(
    ownerDomainId: string,
    rootKind: RecycleRootKind,
    rootId: string,
  ): DomainRecycleGroup | null;
  listFolderIdsForDomain(ownerDomainId: string, groupId: string): string[];
  listFileIdsForDomain(ownerDomainId: string, groupId: string): string[];
  restoreFileForDomain(
    ownerDomainId: string,
    fileId: string,
    groupId: string,
    expectedRevision: number,
    restoredAt: Date,
  ): boolean;
  deleteGroupForDomain(ownerDomainId: string, groupId: string): boolean;
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
