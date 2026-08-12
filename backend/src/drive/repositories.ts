import type { NewFolder, Folder } from "./folder.js";
import type { NewStoredFile, StoredFile } from "./file.js";

export interface FolderRepository {
  create(folder: NewFolder): Folder;
  findById(ownerId: string, id: string): Folder | null;
  listByParent(ownerId: string, parentId: string | null, state: Folder["state"]): Folder[];
  listDeleted(ownerId: string): Folder[];
  update(folder: Folder): Folder;
}

export interface StoredFileRepository {
  create(file: NewStoredFile): StoredFile;
  findById(ownerId: string, id: string): StoredFile | null;
  listByFolder(ownerId: string, folderId: string | null, state: StoredFile["state"]): StoredFile[];
  listDeleted(ownerId: string): StoredFile[];
  update(file: StoredFile, expectedState: StoredFile["state"]): StoredFile | null;
  deletePending(ownerId: string, id: string): boolean;
}
