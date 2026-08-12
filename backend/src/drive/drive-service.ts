import { randomUUID } from "node:crypto";

import type { Persistence } from "../persistence/contracts.js";
import { assertBase64Md5, assertContentLength, assertMediaType } from "../storage/authorization.js";
import { createObjectKey } from "../storage/object-key.js";
import type {
  BrowserDownloadAuthorization,
  BrowserUploadAuthorization,
  StorageAdapter,
  StorageObjectMetadata,
} from "../storage/storage-adapter.js";
import type { StoredFile, StoredFileState } from "./file.js";
import type { Folder } from "./folder.js";

export type DriveErrorCode =
  | "not_found"
  | "name_conflict"
  | "folder_not_empty"
  | "invalid_move"
  | "invalid_state"
  | "upload_incomplete"
  | "upload_metadata_mismatch"
  | "storage_unavailable";

export class DriveError extends Error {
  constructor(readonly code: DriveErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "DriveError";
  }
}

export interface CreateUploadInput {
  folderId: string | null;
  displayName: string;
  mediaType: string;
  sizeBytes: number;
  checksum: { algorithm: "md5"; value: string };
}

export interface DriveEntries {
  folder: Folder | null;
  folders: Folder[];
  files: StoredFile[];
}

function normalizeName(value: string): string {
  const name = value.normalize("NFC").trim();

  if (
    !name ||
    name.length > 255 ||
    name === "." ||
    name === ".." ||
    /[\x00-\x1f\x7f\\/]/.test(name)
  ) {
    throw new TypeError("name must be a safe name of 1 to 255 characters");
  }

  return name;
}

function isConstraintConflict(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/.test(error.message);
}

function mapConstraint(error: unknown, fallback: DriveErrorCode = "invalid_move"): never {
  if (error instanceof DriveError) {
    throw error;
  }

  if (isConstraintConflict(error)) {
    throw new DriveError("name_conflict", { cause: error });
  }

  throw new DriveError(fallback, { cause: error });
}

function requireActiveFolder(
  persistence: Persistence,
  ownerId: string,
  folderId: string | null,
): Folder | null {
  if (folderId === null) {
    return null;
  }

  const folder = persistence.repositories.folders.findById(ownerId, folderId);

  if (!folder || folder.state !== "active") {
    throw new DriveError("not_found");
  }

  return folder;
}

export function storageMetadataMatches(file: StoredFile, metadata: StorageObjectMetadata): boolean {
  return (
    metadata.objectKey === file.objectKey &&
    metadata.sizeBytes === file.sizeBytes &&
    metadata.mediaType?.toLowerCase() === file.mediaType?.toLowerCase() &&
    metadata.checksumAlgorithm === file.checksumAlgorithm &&
    metadata.checksum === file.checksum
  );
}

export class DriveService {
  private readonly purgeOperations = new Map<string, Promise<void>>();

  constructor(
    private readonly persistence: Persistence,
    private readonly storage: StorageAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  createFolder(ownerId: string, nameValue: string, parentId: string | null): Folder {
    const name = normalizeName(nameValue);

    try {
      return this.persistence.runInTransaction((repositories) => {
        requireActiveFolder(this.persistence, ownerId, parentId);
        const now = this.now();
        return repositories.folders.create({
          id: randomUUID(),
          ownerId,
          parentId,
          name,
          state: "active",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      });
    } catch (error: unknown) {
      mapConstraint(error);
    }
  }

  listEntries(ownerId: string, folderId: string | null): DriveEntries {
    const folder = requireActiveFolder(this.persistence, ownerId, folderId);

    return {
      folder,
      folders: this.persistence.repositories.folders.listByParent(ownerId, folderId, "active"),
      files: this.persistence.repositories.files.listByFolder(ownerId, folderId, "active"),
    };
  }

  updateFolder(
    ownerId: string,
    folderId: string,
    changes: { name?: string; parentId?: string | null },
  ): Folder {
    return this.persistence.runInTransaction((repositories) => {
      const folder = repositories.folders.findById(ownerId, folderId);

      if (!folder || folder.state !== "active") {
        throw new DriveError("not_found");
      }

      const parentId = changes.parentId === undefined ? folder.parentId : changes.parentId;

      if (parentId === folder.id) {
        throw new DriveError("invalid_move");
      }

      requireActiveFolder(this.persistence, ownerId, parentId);

      try {
        return repositories.folders.update({
          ...folder,
          parentId,
          name: changes.name === undefined ? folder.name : normalizeName(changes.name),
          updatedAt: this.now(),
        });
      } catch (error: unknown) {
        mapConstraint(error);
      }
    });
  }

  deleteFolder(ownerId: string, folderId: string): void {
    this.persistence.runInTransaction((repositories) => {
      const folder = repositories.folders.findById(ownerId, folderId);

      if (!folder || folder.state !== "active") {
        throw new DriveError("not_found");
      }

      const hasChildren = repositories.folders.listByParent(ownerId, folderId, "active").length > 0;
      const hasFiles = ["pending_upload", "active"].some(
        (state) => repositories.files.listByFolder(ownerId, folderId, state as StoredFileState).length > 0,
      );

      if (hasChildren || hasFiles) {
        throw new DriveError("folder_not_empty");
      }

      const now = this.now();
      repositories.folders.update({ ...folder, state: "deleted", updatedAt: now, deletedAt: now });
    });
  }

  restoreFolder(ownerId: string, folderId: string): Folder {
    return this.persistence.runInTransaction((repositories) => {
      const folder = repositories.folders.findById(ownerId, folderId);

      if (!folder || folder.state !== "deleted") {
        throw new DriveError("not_found");
      }

      requireActiveFolder(this.persistence, ownerId, folder.parentId);

      try {
        return repositories.folders.update({
          ...folder,
          state: "active",
          updatedAt: this.now(),
          deletedAt: null,
        });
      } catch (error: unknown) {
        mapConstraint(error);
      }
    });
  }

  async createUpload(
    ownerId: string,
    input: CreateUploadInput,
  ): Promise<{ file: StoredFile; upload: BrowserUploadAuthorization }> {
    const displayName = normalizeName(input.displayName);
    const mediaType = input.mediaType.toLowerCase();
    assertMediaType(mediaType);
    assertContentLength(input.sizeBytes);

    if (input.checksum.algorithm !== "md5") {
      throw new TypeError("checksum algorithm must be md5");
    }

    if (input.sizeBytes > 5 * 1024 * 1024 * 1024) {
      throw new RangeError("sizeBytes exceeds the 5 GiB POST upload limit");
    }

    assertBase64Md5(input.checksum.value);
    const now = this.now();
    let file: StoredFile;

    try {
      file = this.persistence.runInTransaction((repositories) => {
        requireActiveFolder(this.persistence, ownerId, input.folderId);
        return repositories.files.create({
          id: randomUUID(),
          ownerId,
          folderId: input.folderId,
          displayName,
          storageProvider: this.storage.provider,
          objectKey: createObjectKey(),
          mediaType,
          sizeBytes: input.sizeBytes,
          checksumAlgorithm: "md5",
          checksum: input.checksum.value,
          state: "pending_upload",
          revision: 0,
          createdAt: now,
          updatedAt: now,
          activatedAt: null,
          deletedAt: null,
          purgedAt: null,
        });
      });
    } catch (error: unknown) {
      mapConstraint(error);
    }

    try {
      const upload = await this.authorizePendingFile(file);
      return { file, upload };
    } catch (error: unknown) {
      this.persistence.repositories.files.deletePending(ownerId, file.id, file.revision);
      throw new DriveError("storage_unavailable", { cause: error });
    }
  }

  async renewUploadAuthorization(ownerId: string, fileId: string): Promise<BrowserUploadAuthorization> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);

    if (!file || file.state !== "pending_upload") {
      throw new DriveError("not_found");
    }

    const touched = this.persistence.repositories.files.update(
      { ...file, updatedAt: this.now() },
      "pending_upload",
      file.revision,
    );

    if (!touched) {
      throw new DriveError("invalid_state");
    }

    try {
      return await this.authorizePendingFile(touched);
    } catch (error: unknown) {
      throw new DriveError("storage_unavailable", { cause: error });
    }
  }

  listPendingUploads(ownerId: string, folderId: string | null): StoredFile[] {
    requireActiveFolder(this.persistence, ownerId, folderId);
    return this.persistence.repositories.files.listByFolder(ownerId, folderId, "pending_upload");
  }

  async completeUpload(ownerId: string, fileId: string): Promise<StoredFile> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);

    if (!file) {
      throw new DriveError("not_found");
    }

    if (file.state === "active") {
      return file;
    }

    if (file.state !== "pending_upload") {
      throw new DriveError("invalid_state");
    }

    this.assertCurrentStorageProvider(file);

    let metadata: StorageObjectMetadata | null;

    try {
      metadata = await this.storage.statObject(file.objectKey);
    } catch (error: unknown) {
      throw new DriveError("storage_unavailable", { cause: error });
    }

    if (!metadata) {
      throw new DriveError("upload_incomplete");
    }

    if (!storageMetadataMatches(file, metadata)) {
      throw new DriveError("upload_metadata_mismatch");
    }

    const activated = this.persistence.repositories.files.update(
      { ...file, state: "active", activatedAt: this.now(), updatedAt: this.now() },
      "pending_upload",
      file.revision,
    );

    if (!activated) {
      throw new DriveError("invalid_state");
    }

    return activated;
  }

  async createDownload(
    ownerId: string,
    fileId: string,
    disposition: "attachment" | "inline" = "attachment",
  ): Promise<BrowserDownloadAuthorization> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);

    if (!file || file.state !== "active" || file.storageProvider !== this.storage.provider) {
      throw new DriveError("not_found");
    }

    if (disposition === "inline" && !isSafeInlineMediaType(file.mediaType)) {
      throw new DriveError("invalid_state");
    }

    try {
      return await this.storage.createDownloadAuthorization({
        objectKey: file.objectKey,
        downloadFilename: file.displayName,
        disposition,
      });
    } catch (error: unknown) {
      throw new DriveError("storage_unavailable", { cause: error });
    }
  }

  updateFile(
    ownerId: string,
    fileId: string,
    changes: { displayName?: string; folderId?: string | null },
  ): StoredFile {
    return this.persistence.runInTransaction((repositories) => {
      const file = repositories.files.findById(ownerId, fileId);

      if (!file || file.state !== "active") {
        throw new DriveError("not_found");
      }

      const folderId = changes.folderId === undefined ? file.folderId : changes.folderId;
      requireActiveFolder(this.persistence, ownerId, folderId);

      try {
        const updated = repositories.files.update(
          {
            ...file,
            folderId,
            displayName: changes.displayName === undefined ? file.displayName : normalizeName(changes.displayName),
            updatedAt: this.now(),
          },
          "active",
          file.revision,
        );

        if (!updated) {
          throw new DriveError("invalid_state");
        }

        return updated;
      } catch (error: unknown) {
        if (error instanceof DriveError) throw error;
        mapConstraint(error);
      }
    });
  }

  deleteFile(ownerId: string, fileId: string): void {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);

    if (!file || file.state !== "active") {
      throw new DriveError("not_found");
    }

    const now = this.now();
    const deleted = this.persistence.repositories.files.update(
      { ...file, state: "deleted", deletedAt: now, updatedAt: now },
      "active",
      file.revision,
    );

    if (!deleted) {
      throw new DriveError("invalid_state");
    }
  }

  async restoreFile(ownerId: string, fileId: string): Promise<StoredFile> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);

    if (!file || file.state !== "deleted") {
      throw new DriveError("not_found");
    }

    this.assertCurrentStorageProvider(file);
    requireActiveFolder(this.persistence, ownerId, file.folderId);
    let metadata: StorageObjectMetadata | null;

    try {
      metadata = await this.storage.statObject(file.objectKey);
    } catch (error: unknown) {
      throw new DriveError("storage_unavailable", { cause: error });
    }

    if (!metadata || !storageMetadataMatches(file, metadata)) {
      throw new DriveError("upload_metadata_mismatch");
    }

    try {
      const restored = this.persistence.repositories.files.update(
        { ...file, state: "active", deletedAt: null, updatedAt: this.now() },
        "deleted",
        file.revision,
      );

      if (!restored) throw new DriveError("invalid_state");
      return restored;
    } catch (error: unknown) {
      if (error instanceof DriveError) throw error;
      mapConstraint(error);
    }
  }

  listRecycle(ownerId: string): { folders: Folder[]; files: StoredFile[] } {
    return {
      folders: this.persistence.repositories.folders.listDeleted(ownerId),
      files: this.persistence.repositories.files.listDeleted(ownerId),
    };
  }

  async permanentlyDeleteFile(ownerId: string, fileId: string): Promise<void> {
    const operationKey = `${ownerId}\0${fileId}`;
    const currentOperation = this.purgeOperations.get(operationKey);

    if (currentOperation) {
      return currentOperation;
    }

    const operation = this.performPermanentDelete(ownerId, fileId).finally(() => {
      if (this.purgeOperations.get(operationKey) === operation) {
        this.purgeOperations.delete(operationKey);
      }
    });
    this.purgeOperations.set(operationKey, operation);

    return operation;
  }

  private async performPermanentDelete(ownerId: string, fileId: string): Promise<void> {
    const current = this.persistence.repositories.files.findById(ownerId, fileId);

    if (!current || (current.state !== "deleted" && current.state !== "purging")) {
      throw new DriveError("not_found");
    }

    this.assertCurrentStorageProvider(current);

    const purging = current.state === "purging"
      ? current
      : this.persistence.repositories.files.update(
          { ...current, state: "purging", updatedAt: this.now() },
          "deleted",
          current.revision,
        );

    if (!purging) {
      throw new DriveError("invalid_state");
    }

    let metadata: StorageObjectMetadata | null;

    try {
      metadata = await this.storage.statObject(purging.objectKey);
    } catch (error: unknown) {
      throw new DriveError("storage_unavailable", { cause: error });
    }

    if (metadata && !storageMetadataMatches(purging, metadata)) {
      throw new DriveError("upload_metadata_mismatch");
    }

    if (metadata) {
      try {
        await this.storage.deleteObject(purging.objectKey);
      } catch (error: unknown) {
        throw new DriveError("storage_unavailable", { cause: error });
      }
    }

    const now = this.now();
    const purged = this.persistence.repositories.files.update(
      { ...purging, state: "purged", purgedAt: now, updatedAt: now },
      "purging",
      purging.revision,
    );

    if (!purged) {
      if (this.persistence.repositories.files.findById(ownerId, fileId)?.state === "purged") {
        return;
      }
      throw new DriveError("invalid_state");
    }
  }

  private authorizePendingFile(file: StoredFile): Promise<BrowserUploadAuthorization> {
    if (
      file.mediaType === null ||
      file.sizeBytes === null ||
      file.checksumAlgorithm !== "md5" ||
      file.checksum === null
    ) {
      throw new DriveError("invalid_state");
    }

    return this.storage.createUploadAuthorization({
      objectKey: file.objectKey,
      contentLength: file.sizeBytes,
      mediaType: file.mediaType,
      expectedChecksum: { algorithm: "md5", value: file.checksum },
    });
  }

  private assertCurrentStorageProvider(file: StoredFile): void {
    if (file.storageProvider !== this.storage.provider) {
      throw new DriveError("storage_unavailable");
    }
  }
}

function isSafeInlineMediaType(mediaType: string | null): boolean {
  return mediaType === "application/pdf" ||
    mediaType === "text/plain" ||
    mediaType === "image/png" ||
    mediaType === "image/jpeg" ||
    mediaType === "image/gif" ||
    mediaType === "image/webp";
}
