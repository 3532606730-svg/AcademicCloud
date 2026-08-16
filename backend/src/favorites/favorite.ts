import type { Folder } from "../drive/folder.js";
import type { StoredFile } from "../drive/file.js";

// Per-account favorite relations. accountId is ALWAYS the server-derived
// authenticated account — never accepted from request input.

export interface FavoriteFolderWithAncestors {
  folder: Folder;
  /** Root-first ancestor chain, so the UI can open the real folder in the
   *  Library without a virtual favorite tree. */
  ancestors: Folder[];
}

export interface FavoritesSnapshot {
  files: StoredFile[];
  folders: FavoriteFolderWithAncestors[];
}

export class FavoriteError extends Error {
  constructor(readonly code: "not_found") {
    super(code);
    this.name = "FavoriteError";
  }
}
