export const FOLDER_STATES = ["active", "deleted"] as const;

export type FolderState = (typeof FOLDER_STATES)[number];

export interface Folder {
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  state: FolderState;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type NewFolder = Folder;
