import type { Folder } from "../drive/folder.js";
import type { StoredFile } from "../drive/file.js";
import type { BibliographicProfile } from "../bibliography/bibliography.js";
import type { Library, LibraryHolding, LibraryRole } from "../library/library.js";
import type { LibraryHoldingView } from "../library/holding-view.js";

// Per-account favorite relations. accountId is ALWAYS the server-derived
// authenticated account — never accepted from request input.

export interface FavoriteFolderWithAncestors {
  folder: Folder;
  /** Root-first ancestor chain, so the UI can open the real folder in the
   *  Library without a virtual favorite tree. */
  ancestors: Folder[];
}

export interface FavoriteLibraryHolding {
  library: Library;
  role: LibraryRole;
  holding: LibraryHolding;
  bibliography: BibliographicProfile | null;
  view: LibraryHoldingView;
}

export interface FavoritesSnapshot {
  /** Account-domain files only. Library holdings retain their domain below. */
  files: StoredFile[];
  libraryHoldings: FavoriteLibraryHolding[];
  folders: FavoriteFolderWithAncestors[];
}

export class FavoriteError extends Error {
  constructor(readonly code: "not_found") {
    super(code);
    this.name = "FavoriteError";
  }
}
