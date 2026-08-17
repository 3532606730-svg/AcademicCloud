export const RECYCLE_ROOT_KINDS = ["folder", "file"] as const;

export type RecycleRootKind = (typeof RECYCLE_ROOT_KINDS)[number];

export interface RecycleGroup {
  id: string;
  ownerId: string;
  rootKind: RecycleRootKind;
  rootId: string;
  folderCount: number;
  fileCount: number;
  createdAt: Date;
}

export type NewRecycleGroup = RecycleGroup;
