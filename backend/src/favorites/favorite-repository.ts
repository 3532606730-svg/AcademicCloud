export interface FavoriteRepository {
  listFileIds(accountId: string): string[];
  listFolderIds(accountId: string): string[];
  addFile(accountId: string, fileId: string, createdAt: Date): void;
  removeFile(accountId: string, fileId: string): void;
  addFolder(accountId: string, folderId: string, createdAt: Date): void;
  removeFolder(accountId: string, folderId: string): void;
}
