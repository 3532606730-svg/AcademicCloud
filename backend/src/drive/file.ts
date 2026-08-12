export const STORED_FILE_STATES = ["pending_upload", "active", "deleted", "purged"] as const;

export type StoredFileState = (typeof STORED_FILE_STATES)[number];

export interface StoredFile {
  id: string;
  ownerId: string;
  folderId: string | null;
  displayName: string;
  storageProvider: string;
  objectKey: string;
  mediaType: string | null;
  sizeBytes: number | null;
  checksumAlgorithm: string | null;
  checksum: string | null;
  state: StoredFileState;
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
  deletedAt: Date | null;
  purgedAt: Date | null;
}

export type NewStoredFile = StoredFile;
