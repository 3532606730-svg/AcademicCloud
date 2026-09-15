import type { NewFolder, Folder } from "./folder.js";
import type { NewStoredFile, StoredFile } from "./file.js";
import type { DocumentSource } from "./document-source.js";

export interface FolderRepository {
  create(folder: NewFolder): Folder;
  findById(ownerId: string, id: string): Folder | null;
  listByParent(ownerId: string, parentId: string | null, state: Folder["state"]): Folder[];
  listDeleted(ownerId: string): Folder[];
  update(folder: Folder): Folder;
  deleteDeleted(ownerId: string, folderId: string, groupId: string): boolean;
}

export interface StoredFileRepository {
  /** Internal lookup; caller must first authorize this active file. */
  findCurrentDocumentSource(fileId: string): DocumentSource | null;
  create(file: NewStoredFile): StoredFile;
  findById(ownerId: string, id: string): StoredFile | null;
  findByDomainId(ownerDomainId: string, id: string): StoredFile | null;
  findAvailableByDomainName(ownerDomainId: string, folderId: string | null, displayName: string): StoredFile | null;
  listByFolder(ownerId: string, folderId: string | null, state: StoredFile["state"]): StoredFile[];
  listDeleted(ownerId: string): StoredFile[];
  listStale(state: "pending_upload" | "purging", updatedBefore: Date, limit: number): StoredFile[];
  update(
    file: StoredFile,
    expectedState: StoredFile["state"],
    expectedRevision: number,
  ): StoredFile | null;
  updateForDomain(
    file: StoredFile,
    expectedState: StoredFile["state"],
    expectedRevision: number,
  ): StoredFile | null;
  deletePending(ownerId: string, id: string, expectedRevision: number): boolean;
}
