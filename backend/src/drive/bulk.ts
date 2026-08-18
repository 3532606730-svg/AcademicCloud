import { createHash } from "node:crypto";

import type { StoredFile } from "./file.js";
import type { Folder } from "./folder.js";

export const MAX_BULK_ITEMS = 100;

export type BulkResourceKind = "folder" | "file";
export type BulkAction = "move" | "recycle" | "restore" | "favorite_add" | "favorite_remove";

export interface BulkItemInput {
  kind: BulkResourceKind;
  id: string;
  version: string;
}

export interface BulkOperationInput {
  action: BulkAction;
  items: BulkItemInput[];
  destinationFolderId?: string | null;
}

export interface BulkItemResult {
  kind: BulkResourceKind;
  id: string;
  outcome: "succeeded";
  version: string;
}

export interface BulkOperationResult {
  action: BulkAction;
  atomic: true;
  items: BulkItemResult[];
}

type FolderVersionSource = Pick<Folder, "id" | "parentId" | "name" | "state" | "updatedAt" | "deletedAt">;
type FileVersionSource = Pick<
  StoredFile,
  "id" | "folderId" | "displayName" | "state" | "revision" | "updatedAt" | "deletedAt" | "purgedAt"
>;

export function driveEntryVersion(entry: FolderVersionSource | FileVersionSource): string {
  const mutableIdentity = "displayName" in entry
    ? [
        "file",
        entry.id,
        entry.folderId,
        entry.displayName,
        entry.state,
        entry.revision,
        entry.updatedAt.toISOString(),
        entry.deletedAt?.toISOString() ?? null,
        entry.purgedAt?.toISOString() ?? null,
      ]
    : [
        "folder",
        entry.id,
        entry.parentId,
        entry.name,
        entry.state,
        entry.updatedAt.toISOString(),
        entry.deletedAt?.toISOString() ?? null,
      ];

  return createHash("sha256").update(JSON.stringify(mutableIdentity)).digest("base64url");
}
