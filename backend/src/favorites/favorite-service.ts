import type { Folder } from "../drive/folder.js";
import type { Persistence } from "../persistence/contracts.js";
import { FavoriteError, type FavoriteFolderWithAncestors, type FavoritesSnapshot } from "./favorite.js";

// Bound on the ancestor walk: the database enforces acyclicity, this cap is a
// defensive guard against any pathological hierarchy.
const MAX_ANCESTOR_DEPTH = 64;

export class FavoriteService {
  readonly #persistence: Persistence;
  readonly #now: () => Date;

  constructor(persistence: Persistence, now: () => Date = () => new Date()) {
    this.#persistence = persistence;
    this.#now = now;
  }

  listFavorites(accountId: string): FavoritesSnapshot {
    const { favorites, files, folders } = this.#persistence.repositories;
    const fileIds = favorites.listFileIds(accountId);
    const folderIds = favorites.listFolderIds(accountId);

    const favoriteFiles = fileIds
      .map((id) => files.findById(accountId, id))
      .filter((file): file is NonNullable<typeof file> => file !== null && file.state === "active");

    const favoriteFolders: FavoriteFolderWithAncestors[] = [];
    for (const id of folderIds) {
      const folder = folders.findById(accountId, id);
      if (!folder || folder.state !== "active") continue;
      favoriteFolders.push({ folder, ancestors: this.#ancestorsOf(accountId, folder) });
    }

    return { files: favoriteFiles, folders: favoriteFolders };
  }

  setFileFavorite(accountId: string, fileId: string, favorite: boolean): void {
    const file = this.#persistence.repositories.files.findById(accountId, fileId);
    // Owner-scoped lookup: a guessed foreign id is indistinguishable from a
    // missing one, and only ACTIVE resources may be favorited.
    if (!file || file.state !== "active") throw new FavoriteError("not_found");
    if (favorite) this.#persistence.repositories.favorites.addFile(accountId, fileId, this.#now());
    else this.#persistence.repositories.favorites.removeFile(accountId, fileId);
  }

  setFolderFavorite(accountId: string, folderId: string, favorite: boolean): void {
    const folder = this.#persistence.repositories.folders.findById(accountId, folderId);
    if (!folder || folder.state !== "active") throw new FavoriteError("not_found");
    if (favorite) this.#persistence.repositories.favorites.addFolder(accountId, folderId, this.#now());
    else this.#persistence.repositories.favorites.removeFolder(accountId, folderId);
  }

  #ancestorsOf(accountId: string, folder: Folder): Folder[] {
    const { folders } = this.#persistence.repositories;
    const chain: Folder[] = [];
    let parentId = folder.parentId;
    let depth = 0;
    while (parentId !== null && depth < MAX_ANCESTOR_DEPTH) {
      const parent = folders.findById(accountId, parentId);
      if (!parent) break;
      chain.unshift(parent);
      parentId = parent.parentId;
      depth += 1;
    }
    return chain;
  }
}
