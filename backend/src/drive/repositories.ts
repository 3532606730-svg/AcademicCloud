import type { NewFolder, Folder } from "./folder.js";
import type { NewStoredFile, StoredFile } from "./file.js";

export interface FolderRepository {
  create(folder: NewFolder): Folder;
  findById(ownerId: string, id: string): Folder | null;
}

export interface StoredFileRepository {
  create(file: NewStoredFile): StoredFile;
  findById(ownerId: string, id: string): StoredFile | null;
}
