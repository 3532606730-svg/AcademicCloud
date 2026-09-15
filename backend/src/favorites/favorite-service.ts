import type { Folder } from "../drive/folder.js";
import type { StoredFile } from "../drive/file.js";
import type { Persistence } from "../persistence/contracts.js";
import { FavoriteError, type FavoriteFolderWithAncestors, type FavoritesSnapshot } from "./favorite.js";
import { isLegacyProd03c2FixtureFolder } from "../drive/synthetic-fixtures.js";
import { projectLibraryHoldings } from "../library/holding-projection.js";

type AccessibleFavoriteHolding = Omit<FavoritesSnapshot["libraryHoldings"][number], "bibliography" | "view">;

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
    const accessibleHoldings: AccessibleFavoriteHolding[] = [];
    for (const id of fileIds) {
      const scoped = this.#findAccessibleFile(accountId, id);
      if (!scoped || scoped.file.state !== "active") continue;
      if (scoped.libraryHolding) accessibleHoldings.push(scoped.libraryHolding);
      else favoriteFiles.push(scoped.file);
    }

    const holdingsByDomain = new Map<string, AccessibleFavoriteHolding[]>();
    for (const entry of accessibleHoldings) {
      const group = holdingsByDomain.get(entry.library.ownerDomainId) ?? [];
      group.push(entry);
      holdingsByDomain.set(entry.library.ownerDomainId, group);
    }
    const projectionByFile = new Map([...holdingsByDomain].flatMap(([domain, entries]) =>
      projectLibraryHoldings(domain, entries.map((entry) => entry.holding), this.#persistence.repositories)
        .map((entry) => [entry.holding.file.id, entry] as const)));
    const libraryHoldings = accessibleHoldings.map((entry) => {
      const projected = projectionByFile.get(entry.holding.file.id)!;
      return { ...entry, bibliography: projected.searchable.bibliography, view: projected.holding };
    });

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
    libraryHolding: AccessibleFavoriteHolding | null;
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
    return { file, libraryHolding: { library, role: membership.role, holding } };
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
