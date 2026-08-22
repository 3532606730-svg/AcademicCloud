import type { Folder } from "../drive/folder.js";
import type { StoredFile } from "../drive/file.js";
import type { Persistence } from "../persistence/contracts.js";
import { FavoriteError, type FavoriteFolderWithAncestors, type FavoritesSnapshot } from "./favorite.js";
import { isLegacyProd03c2FixtureFolder } from "../drive/synthetic-fixtures.js";

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

    const favoriteFiles: StoredFile[] = [];
    const libraryHoldings: FavoritesSnapshot["libraryHoldings"] = [];
    for (const id of fileIds) {
      const scoped = this.#findAccessibleFile(accountId, id);
      if (!scoped || scoped.file.state !== "active") continue;
      if (scoped.libraryHolding) libraryHoldings.push(scoped.libraryHolding);
      else favoriteFiles.push(scoped.file);
    }

    const favoriteFolders: FavoriteFolderWithAncestors[] = [];
    for (const id of folderIds) {
      const folder = folders.findById(accountId, id);
      if (!folder || folder.state !== "active" || isLegacyProd03c2FixtureFolder(folder)) continue;
      favoriteFolders.push({ folder, ancestors: this.#ancestorsOf(accountId, folder) });
    }

    return { files: favoriteFiles, libraryHoldings, folders: favoriteFolders };
  }

  setFileFavorite(accountId: string, fileId: string, favorite: boolean): void {
    const scoped = this.#findAccessibleFile(accountId, fileId);
    // A guessed inaccessible ID remains indistinguishable from a missing one.
    // The favorite relation stays account-private even for a shared holding.
    if (!scoped || scoped.file.state !== "active") throw new FavoriteError("not_found");
    if (favorite) this.#persistence.repositories.favorites.addFile(accountId, fileId, this.#now());
    else this.#persistence.repositories.favorites.removeFile(accountId, fileId);
  }

  #findAccessibleFile(accountId: string, fileId: string): {
    file: StoredFile;
    libraryHolding: FavoritesSnapshot["libraryHoldings"][number] | null;
  } | null {
    const repositories = this.#persistence.repositories;
    const account = repositories.accounts.findById(accountId);
    if (!account || account.state !== "active") return null;
    const privateFile = repositories.files.findById(accountId, fileId);
    if (privateFile) return { file: privateFile, libraryHolding: null };
    const library = repositories.libraries.findDefault();
    const membership = library ? repositories.libraries.findMembership(library.id, accountId) : null;
    if (!library || !membership) return null;
    const holding = repositories.libraries.findHoldingByFile(library.id, fileId);
    if (!holding) return null;
    const file = repositories.files.findByDomainId(library.ownerDomainId, fileId);
    if (!file) return null;
    const bibliography = repositories.bibliography.findProfile(library.ownerDomainId, holding.recordId);
    return { file, libraryHolding: { library, role: membership.role, holding, bibliography } };
  }

  setFolderFavorite(accountId: string, folderId: string, favorite: boolean): void {
    const folder = this.#persistence.repositories.folders.findById(accountId, folderId);
    if (!folder || folder.state !== "active" || isLegacyProd03c2FixtureFolder(folder)) {
      throw new FavoriteError("not_found");
    }
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
