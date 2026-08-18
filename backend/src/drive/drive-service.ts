import { randomUUID } from "node:crypto";

import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import { assertBase64Md5, assertContentLength, assertMediaType } from "../storage/authorization.js";
import { createObjectKey } from "../storage/object-key.js";
import type {
  BrowserMultipartPartAuthorization,
  BrowserDownloadAuthorization,
  BrowserUploadAuthorization,
  ListMultipartPartsResult,
  StorageAdapter,
  StorageMultipartPart,
  StorageObjectMetadata,
} from "../storage/storage-adapter.js";
import {
  expectedMultipartPartSize,
  MULTIPART_LIST_PAGE_SIZE,
  MULTIPART_MAX_PARTS,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_SESSION_TTL_MILLISECONDS,
  multipartUploadVersion,
  type MultipartUpload,
  type MultipartUploadRepository,
} from "../transfer/multipart-transfer.js";
import type { StoredFile } from "./file.js";
import type { Folder } from "./folder.js";
import { recordAuditEvent, tryRecordAuditAttempt } from "../audit/audit-service.js";
import type { AuditEventKind, AuditOutcome, AuditReasonCode } from "../audit/audit-event.js";
import {
  driveEntryVersion,
  MAX_BULK_ITEMS,
  type BulkItemInput,
  type BulkOperationInput,
  type BulkOperationResult,
} from "./bulk.js";
import { isLegacyProd03c2FixtureFolder } from "./synthetic-fixtures.js";

export type DriveErrorCode =
  | "not_found"
  | "name_conflict"
  | "folder_not_empty"
  | "invalid_move"
  | "invalid_state"
  | "concurrent_change"
  | "upload_incomplete"
  | "upload_metadata_mismatch"
  | "upload_identity_mismatch"
  | "preview_unavailable"
  | "preview_too_large"
  | "storage_unavailable";

export type UploadActivationWork = (
  repositories: RepositorySet,
  activated: StoredFile,
  activatedAt: Date,
) => void;

// Product/browser safety limits for INLINE PREVIEW only. These are NOT
// storage limits: uploads and downloads keep their existing 5 GiB contract.
const INLINE_PREVIEW_SIZE_LIMITS: Readonly<Record<string, number>> = {
  "application/pdf": 512 * 1024 * 1024,
  "image/png": 128 * 1024 * 1024,
  "image/jpeg": 128 * 1024 * 1024,
  "image/gif": 128 * 1024 * 1024,
  "image/webp": 128 * 1024 * 1024,
  "text/plain": 16 * 1024 * 1024,
};

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

export interface MultipartUploadStatus {
  kind: "multipart";
  file: StoredFile;
  state: "uploading" | "paused" | "completing";
  version: string;
  partSizeBytes: number;
  totalParts: number;
  completedParts: Array<{ partNumber: number; sizeBytes: number; etag: string }>;
  completedBytes: number;
  expiresAt: Date;
}

export interface LegacyUploadStatus {
  kind: "legacy";
  file: StoredFile;
}

export interface CompleteUploadStatus {
  kind: "complete";
  file: StoredFile;
}

export type UploadStatus = MultipartUploadStatus | LegacyUploadStatus | CompleteUploadStatus;

export interface ResumableDownloadAuthorization extends BrowserDownloadAuthorization {
  sizeBytes: number;
  etag: string;
  acceptRanges: "bytes";
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
  repositories: RepositorySet,
  ownerId: string,
  folderId: string | null,
): Folder | null {
  if (folderId === null) {
    return null;
  }

  const folder = repositories.folders.findById(ownerId, folderId);

  if (!folder || folder.state !== "active" || isLegacyProd03c2FixtureFolder(folder)) {
    throw new DriveError("not_found");
  }

  return folder;
}

type StorageAuditActor = "account" | "system";

export type PermanentDeletePreparation = (
  repositories: RepositorySet,
  file: StoredFile,
  now: Date,
) => void;

type ResolvedBulkItem =
  | { input: BulkItemInput; kind: "folder"; resource: Folder }
  | { input: BulkItemInput; kind: "file"; resource: StoredFile };

interface FolderRestorePlan {
  root: Folder;
  groupId: string;
  folders: Folder[];
  files: StoredFile[];
}

interface FileRestorePlan {
  file: StoredFile;
  groupId: string;
}

const MAX_BULK_ANCESTOR_DEPTH = 256;
const MAX_BULK_EXPANDED_ITEMS = 10_000;
const BULK_VERSION_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function recordDriveAudit(
  repositories: RepositorySet,
  eventKind: AuditEventKind,
  actorKind: StorageAuditActor,
  ownerId: string,
  targetId: string,
  createdAt: Date,
  actorAccountId: string | null = actorKind === "account" ? ownerId : null,
): void {
  recordAuditEvent(repositories, {
    action: eventKind,
    actorKind,
    actorAccountId,
    targetId,
    outcome: "succeeded",
    reason: null,
    occurredAt: createdAt,
  });
}

function driveAuditReason(error: unknown): AuditReasonCode {
  if (error instanceof DriveError) {
    switch (error.code) {
      case "not_found": return "not_found";
      case "name_conflict": return "name_conflict";
      case "concurrent_change": return "concurrent_change";
      case "invalid_state":
      case "folder_not_empty": return "invalid_state";
      case "upload_incomplete": return "upload_incomplete";
      case "upload_metadata_mismatch": return "upload_metadata_mismatch";
      case "storage_unavailable": return "storage_unavailable";
      case "invalid_move": return "invalid_target";
      default: return "invalid_input";
    }
  }
  if (error instanceof TypeError || error instanceof RangeError) return "invalid_input";
  return "storage_unavailable";
}

function collectActiveFolderSubtree(
  repositories: RepositorySet,
  ownerId: string,
  root: Folder,
  maximumMembers = Number.MAX_SAFE_INTEGER,
): { folders: Folder[]; files: StoredFile[] } {
  const folders: Folder[] = [root];
  const files: StoredFile[] = [];
  const seen = new Set([root.id]);

  for (let index = 0; index < folders.length; index += 1) {
    const folder = folders[index]!;
    if (repositories.files.listByFolder(ownerId, folder.id, "pending_upload").length > 0) {
      throw new DriveError("invalid_state");
    }
    files.push(...repositories.files.listByFolder(ownerId, folder.id, "active"));
    if (folders.length + files.length > maximumMembers) {
      throw new RangeError("bulk expanded selection exceeds 10000 resources");
    }
    for (const child of repositories.folders.listByParent(ownerId, folder.id, "active")) {
      if (seen.has(child.id)) {
        throw new DriveError("invalid_state");
      }
      seen.add(child.id);
      folders.push(child);
      if (folders.length + files.length > maximumMembers) {
        throw new RangeError("bulk expanded selection exceeds 10000 resources");
      }
    }
  }

  return { folders, files };
}

function validateBulkInput(input: BulkOperationInput): void {
  const validActions = new Set(["move", "recycle", "restore", "favorite_add", "favorite_remove"]);
  if (!validActions.has(input.action)) throw new TypeError("invalid bulk action");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > MAX_BULK_ITEMS) {
    throw new RangeError(`bulk selection must contain 1 to ${MAX_BULK_ITEMS} items`);
  }

  const seenIds = new Set<string>();
  for (const item of input.items) {
    if (
      (item.kind !== "folder" && item.kind !== "file")
      || typeof item.id !== "string"
      || item.id.length < 1
      || item.id.length > 128
      || item.id !== item.id.trim()
      || !/^[A-Za-z0-9_-]+$/.test(item.id)
      || typeof item.version !== "string"
      || !BULK_VERSION_PATTERN.test(item.version)
    ) {
      throw new TypeError("invalid bulk item");
    }
    if (seenIds.has(item.id)) throw new TypeError("duplicate bulk item id");
    seenIds.add(item.id);
  }

  const hasDestination = Object.prototype.hasOwnProperty.call(input, "destinationFolderId");
  if (input.action === "move") {
    if (!hasDestination) throw new TypeError("bulk move destination is required");
    if (
      input.destinationFolderId !== null
      && (
        typeof input.destinationFolderId !== "string"
        || input.destinationFolderId.length < 1
        || input.destinationFolderId.length > 128
        || input.destinationFolderId !== input.destinationFolderId.trim()
        || !/^[A-Za-z0-9_-]+$/.test(input.destinationFolderId)
      )
    ) {
      throw new TypeError("invalid bulk move destination");
    }
  } else if (hasDestination) {
    throw new TypeError("bulk destination is only valid for move");
  }
}

function selectedAncestorExists(
  repositories: RepositorySet,
  ownerId: string,
  parentId: string | null,
  selectedFolderIds: ReadonlySet<string>,
): boolean {
  let currentId = parentId;
  for (let depth = 0; currentId !== null; depth += 1) {
    if (depth >= MAX_BULK_ANCESTOR_DEPTH) throw new DriveError("invalid_state");
    if (selectedFolderIds.has(currentId)) return true;
    const current = repositories.folders.findById(ownerId, currentId);
    if (!current) throw new DriveError("invalid_state");
    currentId = current.parentId;
  }
  return false;
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
  private readonly multipartCompletionOperations = new Map<string, Promise<StoredFile>>();

  constructor(
    private readonly persistence: Persistence,
    private readonly storage: StorageAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  recordAuditAttempt(
    ownerId: string,
    action: Extract<AuditEventKind, "drive.upload_activate" | "drive.upload_abandon" | "drive.folder_recycle" | "drive.folder_restore" | "drive.file_recycle" | "drive.file_restore" | "drive.file_purge_request" | "drive.file_purge_complete">,
    error: unknown,
    actorKind: StorageAuditActor = "account",
  ): boolean {
    const reason = driveAuditReason(error);
    const outcome: AuditOutcome = reason === "storage_unavailable" ? "failed" : "denied";
    return tryRecordAuditAttempt(this.persistence, {
      action,
      actorKind,
      actorAccountId: actorKind === "account" ? ownerId : null,
      targetId: null,
      outcome,
      reason,
      occurredAt: this.now(),
    });
  }

  createFolder(ownerId: string, nameValue: string, parentId: string | null): Folder {
    const name = normalizeName(nameValue);

    try {
      return this.persistence.runInTransaction((repositories) => {
        requireActiveFolder(repositories, ownerId, parentId);
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
    const folder = requireActiveFolder(this.persistence.repositories, ownerId, folderId);

    return {
      folder,
      folders: this.persistence.repositories.folders
        .listByParent(ownerId, folderId, "active")
        .filter((entry) => !isLegacyProd03c2FixtureFolder(entry)),
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

      if (!folder || folder.state !== "active" || isLegacyProd03c2FixtureFolder(folder)) {
        throw new DriveError("not_found");
      }

      const parentId = changes.parentId === undefined ? folder.parentId : changes.parentId;

      if (parentId === folder.id) {
        throw new DriveError("invalid_move");
      }

      requireActiveFolder(repositories, ownerId, parentId);

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

      if (!folder || folder.state !== "active" || isLegacyProd03c2FixtureFolder(folder)) {
        throw new DriveError("not_found");
      }

      const subtree = collectActiveFolderSubtree(repositories, ownerId, folder);
      const now = this.now();
      const groupId = randomUUID();
      repositories.recycle.createGroup({
        id: groupId,
        ownerId,
        rootKind: "folder",
        rootId: folder.id,
        folderCount: subtree.folders.length,
        fileCount: subtree.files.length,
        createdAt: now,
      });

      for (const subtreeFolder of subtree.folders) {
        if (!repositories.recycle.recycleFolder(ownerId, subtreeFolder.id, groupId, now)) {
          throw new DriveError("invalid_state");
        }
      }
      for (const file of subtree.files) {
        if (!repositories.recycle.recycleFile(ownerId, file.id, groupId, file.revision, now)) {
          throw new DriveError("invalid_state");
        }
      }
      recordDriveAudit(repositories, "drive.folder_recycle", "account", ownerId, folder.id, now);
    });
  }

  restoreFolder(ownerId: string, folderId: string): Folder {
    try {
      return this.persistence.runInTransaction((repositories) => {
        const root = repositories.folders.findById(ownerId, folderId);
        const group = repositories.recycle.findGroupByRoot(ownerId, "folder", folderId);

        if (!root || root.state !== "deleted" || !group) {
          throw new DriveError("not_found");
        }

        requireActiveFolder(repositories, ownerId, root.parentId);
        const folderIds = repositories.recycle.listFolderIds(ownerId, group.id);
        const fileIds = repositories.recycle.listFileIds(ownerId, group.id);
        if (folderIds.length !== group.folderCount || fileIds.length !== group.fileCount) {
          throw new DriveError("invalid_state");
        }

        const pendingFolders = new Map<string, Folder>();
        for (const memberId of folderIds) {
          const member = repositories.folders.findById(ownerId, memberId);
          if (!member || member.state !== "deleted") throw new DriveError("invalid_state");
          pendingFolders.set(member.id, member);
        }
        if (!pendingFolders.has(root.id)) throw new DriveError("invalid_state");

        const now = this.now();
        const restoredFolderIds = new Set<string>();
        while (pendingFolders.size > 0) {
          let progressed = false;
          for (const member of [...pendingFolders.values()]) {
            const parentReady = member.id === root.id
              ? true
              : member.parentId !== null && restoredFolderIds.has(member.parentId);
            if (!parentReady) continue;
            if (!repositories.recycle.restoreFolder(ownerId, member.id, group.id, now)) {
              throw new DriveError("invalid_state");
            }
            pendingFolders.delete(member.id);
            restoredFolderIds.add(member.id);
            progressed = true;
          }
          if (!progressed) throw new DriveError("invalid_state");
        }

        for (const memberId of fileIds) {
          const member = repositories.files.findById(ownerId, memberId);
          if (
            !member ||
            member.state !== "deleted" ||
            member.folderId === null ||
            !restoredFolderIds.has(member.folderId) ||
            !repositories.recycle.restoreFile(ownerId, member.id, group.id, member.revision, now)
          ) {
            throw new DriveError("invalid_state");
          }
        }

        if (!repositories.recycle.deleteGroup(ownerId, group.id)) {
          throw new DriveError("invalid_state");
        }
        recordDriveAudit(repositories, "drive.folder_restore", "account", ownerId, root.id, now);
        return repositories.folders.findById(ownerId, root.id)!;
      });
    } catch (error: unknown) {
      if (error instanceof DriveError) throw error;
      if (isConstraintConflict(error)) throw new DriveError("name_conflict", { cause: error });
      throw error;
    }
  }

  async createUpload(
    ownerId: string,
    input: CreateUploadInput,
  ): Promise<{ file: StoredFile; upload: BrowserUploadAuthorization }> {
    const file = this.reservePendingFile(ownerId, input);

    try {
      const upload = await this.authorizePendingFile(file);
      return { file, upload };
    } catch (error: unknown) {
      this.persistence.repositories.files.deletePending(ownerId, file.id, file.revision);
      throw new DriveError("storage_unavailable", { cause: error });
    }
  }

  async createMultipartUpload(
    ownerId: string,
    input: CreateUploadInput,
  ): Promise<{ file: StoredFile; transfer: MultipartUploadStatus }> {
    const storage = this.requireMultipartStorage();
    const file = this.reservePendingFile(ownerId, input);
    let uploadId: string | null = null;
    try {
      const handle = await storage.initiateMultipartUpload({
        objectKey: file.objectKey,
        mediaType: file.mediaType!,
        expectedChecksum: { algorithm: "md5", value: file.checksum! },
      });
      uploadId = handle.uploadId;
      const now = this.now();
      const totalParts = Math.ceil(file.sizeBytes! / MULTIPART_PART_SIZE_BYTES);
      if (totalParts < 1 || totalParts > MULTIPART_MAX_PARTS) throw new DriveError("invalid_state");
      const upload = this.multipartRepository().create({
        fileId: file.id,
        ownerId,
        storageProvider: file.storageProvider,
        providerUploadId: uploadId,
        partSizeBytes: MULTIPART_PART_SIZE_BYTES,
        totalParts,
        state: "uploading",
        revision: 0,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + MULTIPART_SESSION_TTL_MILLISECONDS),
      });
      return { file, transfer: this.toMultipartStatus(file, upload, []) };
    } catch (error: unknown) {
      if (uploadId !== null) {
        try {
          await storage.abortMultipartUpload({ objectKey: file.objectKey, uploadId });
        } catch {
          // The reservation is still removed; provider lifecycle rules remain
          // the final fail-safe for an init that could not be durably recorded.
        }
      }
      this.persistence.repositories.files.deletePending(ownerId, file.id, file.revision);
      if (error instanceof DriveError || error instanceof TypeError || error instanceof RangeError) throw error;
      throw new DriveError("storage_unavailable", { cause: error });
    }
  }

  async getUploadStatus(
    ownerId: string,
    fileId: string,
    auditActor: StorageAuditActor = "account",
    afterActivation?: UploadActivationWork,
  ): Promise<UploadStatus> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);
    if (!file) throw new DriveError("not_found");
    if (file.state === "active") return { kind: "complete", file };
    if (file.state !== "pending_upload") throw new DriveError("not_found");
    const upload = this.multipartRepository().findByFileId(ownerId, fileId);
    if (!upload) return { kind: "legacy", file };
    this.assertMultipartIdentity(file, upload);
    if (upload.state === "abandoning") throw new DriveError("concurrent_change");

    const metadata = await this.safeStat(file);
    if (metadata && storageMetadataMatches(file, metadata)) {
      return {
        kind: "complete",
        file: await this.finalizeMultipartLogicalUpload(file, upload, auditActor, afterActivation),
      };
    }
    if (metadata) throw new DriveError("upload_metadata_mismatch");
    this.assertMultipartNotExpired(upload);

    const parts = await this.listAllMultipartParts(file, upload);
    return this.toMultipartStatus(file, upload, parts);
  }

  async createMultipartPartAuthorization(
    ownerId: string,
    fileId: string,
    input: { version: string; partNumber: number; sizeBytes: number; contentMd5: string },
  ): Promise<BrowserMultipartPartAuthorization> {
    assertBase64Md5(input.contentMd5);
    const { file, upload } = this.requireMultipartUpload(ownerId, fileId, input.version);
    if (upload.state !== "uploading") throw new DriveError("invalid_state");
    const expectedSize = expectedMultipartPartSize(file.sizeBytes!, upload.partSizeBytes, upload.totalParts, input.partNumber);
    if (input.sizeBytes !== expectedSize) throw new DriveError("upload_identity_mismatch");
    try {
      return await this.requireMultipartStorage().createMultipartPartAuthorization({
        objectKey: file.objectKey,
        uploadId: upload.providerUploadId,
        partNumber: input.partNumber,
        contentLength: input.sizeBytes,
        contentMd5: input.contentMd5,
      });
    } catch (error: unknown) {
      if (error instanceof DriveError || error instanceof TypeError || error instanceof RangeError) throw error;
      throw new DriveError("storage_unavailable", { cause: error });
    }
  }

  pauseMultipartUpload(ownerId: string, fileId: string, version: string): MultipartUploadStatus {
    const { file, upload } = this.requireMultipartUpload(ownerId, fileId, version);
    if (upload.state === "paused") return this.toMultipartStatus(file, upload, []);
    if (upload.state !== "uploading") throw new DriveError("invalid_state");
    const now = this.now();
    const paused = this.multipartRepository().update(
      { ...upload, state: "paused", updatedAt: now, expiresAt: new Date(now.getTime() + MULTIPART_SESSION_TTL_MILLISECONDS) },
      "uploading",
      upload.revision,
    );
    if (!paused) throw new DriveError("concurrent_change");
    return this.toMultipartStatus(file, paused, []);
  }

  resumeMultipartUpload(ownerId: string, fileId: string, version: string): MultipartUploadStatus {
    const { file, upload } = this.requireMultipartUpload(ownerId, fileId, version);
    if (upload.state === "uploading") return this.toMultipartStatus(file, upload, []);
    if (upload.state !== "paused") throw new DriveError("invalid_state");
    const now = this.now();
    const resumed = this.multipartRepository().update(
      { ...upload, state: "uploading", updatedAt: now, expiresAt: new Date(now.getTime() + MULTIPART_SESSION_TTL_MILLISECONDS) },
      "paused",
      upload.revision,
    );
    if (!resumed) throw new DriveError("concurrent_change");
    return this.toMultipartStatus(file, resumed, []);
  }

  async completeMultipartUpload(
    ownerId: string,
    fileId: string,
    version: string,
    auditActor: StorageAuditActor = "account",
    afterActivation?: UploadActivationWork,
  ): Promise<StoredFile> {
    const key = `${ownerId}\0${fileId}\0${version}`;
    const existing = this.multipartCompletionOperations.get(key);
    if (existing) return existing;
    const operation = this.performMultipartCompletion(
      ownerId,
      fileId,
      version,
      auditActor,
      afterActivation,
    ).finally(() => {
      if (this.multipartCompletionOperations.get(key) === operation) this.multipartCompletionOperations.delete(key);
    });
    this.multipartCompletionOperations.set(key, operation);
    return operation;
  }

  async abandonUpload(
    ownerId: string,
    fileId: string,
    version?: string,
    auditActor: StorageAuditActor = "account",
  ): Promise<void> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);
    if (!file || file.state !== "pending_upload") throw new DriveError("not_found");
    let upload = this.multipartRepository().findByFileId(ownerId, fileId);
    if (!upload && version !== undefined) throw new DriveError("invalid_state");
    if (upload) {
      if (version === undefined || multipartUploadVersion(upload) !== version) throw new DriveError("concurrent_change");
      this.assertMultipartIdentity(file, upload);
      const originalState = upload.state;
      const locked = originalState === "abandoning"
        ? upload
        : this.multipartRepository().update(
            { ...upload, state: "abandoning", updatedAt: this.now() },
            originalState,
            upload.revision,
          );
      if (!locked) throw new DriveError("concurrent_change");
      try {
        await this.requireMultipartStorage().abortMultipartUpload({
          objectKey: file.objectKey,
          uploadId: locked.providerUploadId,
        });
      } catch (error: unknown) {
        if (originalState !== "abandoning") {
          this.multipartRepository().update(
            { ...locked, state: originalState, updatedAt: this.now() },
            "abandoning",
            locked.revision,
          );
        }
        throw new DriveError("storage_unavailable", { cause: error });
      }
      upload = locked;
    }
    this.persistence.runInTransaction((repositories) => {
      const current = repositories.files.findById(ownerId, fileId);
      const currentUpload = repositories.multipartUploads?.findByFileId(ownerId, fileId) ?? null;
      if (!current || current.state !== "pending_upload" || current.revision !== file.revision) {
        throw new DriveError("concurrent_change");
      }
      if (upload && (!currentUpload || currentUpload.revision !== upload.revision
        || !repositories.multipartUploads!.delete(ownerId, fileId, currentUpload.revision))) {
        throw new DriveError("concurrent_change");
      }
      if (!repositories.files.deletePending(ownerId, fileId, current.revision)) throw new DriveError("concurrent_change");
      recordDriveAudit(repositories, "drive.upload_abandon", auditActor, ownerId, fileId, this.now());
    });
  }

  async renewUploadAuthorization(ownerId: string, fileId: string): Promise<BrowserUploadAuthorization> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);

    if (!file || file.state !== "pending_upload") {
      throw new DriveError("not_found");
    }
    if (this.persistence.repositories.multipartUploads?.findByFileId(ownerId, fileId)) {
      throw new DriveError("invalid_state");
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
    requireActiveFolder(this.persistence.repositories, ownerId, folderId);
    return this.persistence.repositories.files.listByFolder(ownerId, folderId, "pending_upload");
  }

  pendingUploadKind(ownerId: string, fileId: string): "multipart" | "legacy" {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);
    if (!file || file.state !== "pending_upload") throw new DriveError("not_found");
    return this.persistence.repositories.multipartUploads?.findByFileId(ownerId, fileId)
      ? "multipart"
      : "legacy";
  }

  async completeUpload(
    ownerId: string,
    fileId: string,
    auditActor: StorageAuditActor = "account",
    afterActivation?: UploadActivationWork,
  ): Promise<StoredFile> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);

    if (!file) {
      throw new DriveError("not_found");
    }

    if (file.state === "active") {
      if (!afterActivation) return file;
      return this.persistence.runInTransaction((repositories) => {
        const current = repositories.files.findById(ownerId, fileId);
        if (!current || current.state !== "active") throw new DriveError("invalid_state");
        afterActivation(repositories, current, this.now());
        return current;
      });
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

    return this.persistence.runInTransaction((repositories) => {
      const current = repositories.files.findById(ownerId, fileId);
      if (!current || current.state !== "pending_upload" || current.revision !== file.revision) {
        throw new DriveError("invalid_state");
      }
      const now = this.now();
      const activated = repositories.files.update(
        { ...current, state: "active", activatedAt: now, updatedAt: now },
        "pending_upload",
        current.revision,
      );

      if (!activated) throw new DriveError("invalid_state");
      recordDriveAudit(repositories, "drive.upload_activate", auditActor, ownerId, fileId, now);
      afterActivation?.(repositories, activated, now);
      return activated;
    });
  }

  async createDownload(
    ownerId: string,
    fileId: string,
    disposition: "attachment" | "inline" = "attachment",
  ): Promise<ResumableDownloadAuthorization> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);

    if (!file || file.state !== "active" || file.storageProvider !== this.storage.provider) {
      throw new DriveError("not_found");
    }

    return this.createDownloadForAuthorizedFile(file, disposition);
  }

  async createDownloadForAuthorizedFile(
    file: StoredFile,
    disposition: "attachment" | "inline" = "attachment",
  ): Promise<ResumableDownloadAuthorization> {
    if (file.state !== "active" || file.storageProvider !== this.storage.provider) {
      throw new DriveError("not_found");
    }

    // Inline Preview requires a dedicated browser GET domain; the native
    // bucket domain forces downloads, so failing safely here is the contract.
    if (disposition === "inline" && !this.storage.browserPreviewAvailable) {
      throw new DriveError("preview_unavailable");
    }

    if (disposition === "inline" && !isSafeInlineMediaType(file.mediaType)) {
      throw new DriveError("invalid_state");
    }

    // Backend-authoritative inline-preview size policy: pathological
    // multi-gigabyte documents must not reach the browser preview surface.
    // Download remains available at any size under the upload contract.
    if (disposition === "inline") {
      const limit = file.mediaType ? INLINE_PREVIEW_SIZE_LIMITS[file.mediaType] : undefined;
      if (limit !== undefined && (file.sizeBytes ?? 0) > limit) {
        throw new DriveError("preview_too_large");
      }
    }

    try {
      const metadata = await this.storage.statObject(file.objectKey);
      if (!metadata || !storageMetadataMatches(file, metadata) || !metadata.etag) {
        throw new DriveError(metadata ? "upload_metadata_mismatch" : "not_found");
      }
      const authorization = await this.storage.createDownloadAuthorization({
        objectKey: file.objectKey,
        downloadFilename: file.displayName,
        disposition,
      });
      return {
        ...authorization,
        sizeBytes: metadata.sizeBytes,
        etag: metadata.etag,
        acceptRanges: "bytes",
      };
    } catch (error: unknown) {
      if (error instanceof DriveError) throw error;
      throw new DriveError("storage_unavailable", { cause: error });
    }
  }

  /**
   * Verify a server-authorized deleted file against the configured storage
   * provider before a domain-specific service restores its metadata. The
   * caller remains responsible for authority and ownership-domain checks.
   */
  async verifyAuthorizedFileForRestore(file: StoredFile): Promise<void> {
    if (file.state !== "deleted") throw new DriveError("not_found");
    this.assertCurrentStorageProvider(file);

    let metadata: StorageObjectMetadata | null;
    try {
      metadata = await this.storage.statObject(file.objectKey);
    } catch (error: unknown) {
      throw new DriveError("storage_unavailable", { cause: error });
    }

    if (!metadata || !storageMetadataMatches(file, metadata)) {
      throw new DriveError("upload_metadata_mismatch");
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
      requireActiveFolder(repositories, ownerId, folderId);

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
    this.persistence.runInTransaction((repositories) => {
      const file = repositories.files.findById(ownerId, fileId);
      if (!file || file.state !== "active") throw new DriveError("not_found");

      const now = this.now();
      const groupId = randomUUID();
      repositories.recycle.createGroup({
        id: groupId,
        ownerId,
        rootKind: "file",
        rootId: file.id,
        folderCount: 0,
        fileCount: 1,
        createdAt: now,
      });
      if (!repositories.recycle.recycleFile(ownerId, file.id, groupId, file.revision, now)) {
        throw new DriveError("invalid_state");
      }
      recordDriveAudit(repositories, "drive.file_recycle", "account", ownerId, file.id, now);
    });
  }

  async restoreFile(ownerId: string, fileId: string): Promise<StoredFile> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);
    const group = this.persistence.repositories.recycle.findGroupByRoot(ownerId, "file", fileId);

    if (!file || file.state !== "deleted" || !group) {
      throw new DriveError("not_found");
    }

    this.assertCurrentStorageProvider(file);
    requireActiveFolder(this.persistence.repositories, ownerId, file.folderId);
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
      return this.persistence.runInTransaction((repositories) => {
        const current = repositories.files.findById(ownerId, fileId);
        const currentGroup = repositories.recycle.findGroupByRoot(ownerId, "file", fileId);
        const groupFileIds = repositories.recycle.listFileIds(ownerId, group.id);
        if (
          !current ||
          current.state !== "deleted" ||
          !currentGroup ||
          currentGroup.id !== group.id ||
          currentGroup.folderCount !== 0 ||
          currentGroup.fileCount !== 1 ||
          repositories.recycle.listFolderIds(ownerId, group.id).length !== 0 ||
          groupFileIds.length !== 1 ||
          groupFileIds[0] !== fileId
        ) {
          throw new DriveError("invalid_state");
        }
        requireActiveFolder(repositories, ownerId, current.folderId);
        const now = this.now();
        if (!repositories.recycle.restoreFile(ownerId, current.id, group.id, current.revision, now)) {
          throw new DriveError("invalid_state");
        }
        if (!repositories.recycle.deleteGroup(ownerId, group.id)) {
          throw new DriveError("invalid_state");
        }
        recordDriveAudit(repositories, "drive.file_restore", "account", ownerId, current.id, now);
        return repositories.files.findById(ownerId, current.id)!;
      });
    } catch (error: unknown) {
      if (error instanceof DriveError) throw error;
      mapConstraint(error);
    }
  }

  async bulkOperation(ownerId: string, input: BulkOperationInput): Promise<BulkOperationResult> {
    validateBulkInput(input);

    // Standalone file restore retains the single-item contract: every object
    // must still exist with exact metadata. All provider reads finish before
    // the one metadata transaction begins, so any failed member writes nothing.
    if (input.action === "restore") {
      for (const item of input.items) {
        if (item.kind !== "file") continue;
        const file = this.persistence.repositories.files.findById(ownerId, item.id);
        const group = this.persistence.repositories.recycle.findGroupByRoot(ownerId, "file", item.id);
        if (!file || !group) throw new DriveError("not_found");
        if (driveEntryVersion(file) !== item.version) throw new DriveError("concurrent_change");
        if (file.state !== "deleted") throw new DriveError("invalid_state");
        this.assertCurrentStorageProvider(file);
        requireActiveFolder(this.persistence.repositories, ownerId, file.folderId);
        let metadata: StorageObjectMetadata | null;
        try {
          metadata = await this.storage.statObject(file.objectKey);
        } catch (error: unknown) {
          throw new DriveError("storage_unavailable", { cause: error });
        }
        if (!metadata || !storageMetadataMatches(file, metadata)) {
          throw new DriveError("upload_metadata_mismatch");
        }
      }
    }

    try {
      return this.persistence.runInTransaction((repositories) => {
        const resolved = this.resolveBulkItems(repositories, ownerId, input.items);
        switch (input.action) {
          case "move":
            this.bulkMove(repositories, ownerId, resolved, input.destinationFolderId!);
            break;
          case "recycle":
            this.bulkRecycle(repositories, ownerId, resolved);
            break;
          case "restore":
            this.bulkRestore(repositories, ownerId, resolved);
            break;
          case "favorite_add":
          case "favorite_remove":
            this.bulkFavorite(repositories, ownerId, resolved, input.action === "favorite_add");
            break;
        }

        return {
          action: input.action,
          atomic: true,
          items: input.items.map((item) => {
            const current = item.kind === "folder"
              ? repositories.folders.findById(ownerId, item.id)
              : repositories.files.findById(ownerId, item.id);
            if (!current) throw new DriveError("invalid_state");
            return {
              kind: item.kind,
              id: item.id,
              outcome: "succeeded" as const,
              version: driveEntryVersion(current),
            };
          }),
        };
      });
    } catch (error: unknown) {
      if (error instanceof DriveError || error instanceof TypeError || error instanceof RangeError) throw error;
      if (isConstraintConflict(error)) throw new DriveError("name_conflict", { cause: error });
      throw error;
    }
  }

  private resolveBulkItems(
    repositories: RepositorySet,
    ownerId: string,
    inputs: readonly BulkItemInput[],
  ): ResolvedBulkItem[] {
    return inputs.map((input): ResolvedBulkItem => {
      if (input.kind === "folder") {
        const resource = repositories.folders.findById(ownerId, input.id);
        if (!resource) throw new DriveError("not_found");
        if (driveEntryVersion(resource) !== input.version) throw new DriveError("concurrent_change");
        return { input, kind: "folder", resource };
      }
      const resource = repositories.files.findById(ownerId, input.id);
      if (!resource) throw new DriveError("not_found");
      if (driveEntryVersion(resource) !== input.version) throw new DriveError("concurrent_change");
      return { input, kind: "file", resource };
    });
  }

  private bulkMove(
    repositories: RepositorySet,
    ownerId: string,
    items: readonly ResolvedBulkItem[],
    destinationFolderId: string | null,
  ): void {
    requireActiveFolder(repositories, ownerId, destinationFolderId);
    const selectedFolderIds = new Set(
      items.filter((item): item is Extract<ResolvedBulkItem, { kind: "folder" }> => item.kind === "folder")
        .map((item) => item.resource.id),
    );

    if (selectedAncestorExists(repositories, ownerId, destinationFolderId, selectedFolderIds)) {
      throw new DriveError("invalid_move");
    }

    for (const item of items) {
      if (item.resource.state !== "active") throw new DriveError("invalid_state");
      const parentId = item.kind === "folder" ? item.resource.parentId : item.resource.folderId;
      if (selectedAncestorExists(repositories, ownerId, parentId, selectedFolderIds)) {
        throw new DriveError("invalid_move");
      }
    }

    const now = this.now();
    for (const item of items) {
      if (item.kind === "folder") {
        if (item.resource.parentId === destinationFolderId) continue;
        repositories.folders.update({ ...item.resource, parentId: destinationFolderId, updatedAt: now });
      } else {
        if (item.resource.folderId === destinationFolderId) continue;
        const updated = repositories.files.update(
          { ...item.resource, folderId: destinationFolderId, updatedAt: now },
          "active",
          item.resource.revision,
        );
        if (!updated) throw new DriveError("concurrent_change");
      }
    }
  }

  private bulkRecycle(
    repositories: RepositorySet,
    ownerId: string,
    items: readonly ResolvedBulkItem[],
  ): void {
    const folderPlans = new Map<string, { folders: Folder[]; files: StoredFile[] }>();
    const claimed = new Set<string>();

    for (const item of items) {
      if (item.resource.state !== "active") throw new DriveError("invalid_state");
      if (item.kind !== "folder") continue;
      const subtree = collectActiveFolderSubtree(
        repositories,
        ownerId,
        item.resource,
        MAX_BULK_EXPANDED_ITEMS - claimed.size,
      );
      folderPlans.set(item.resource.id, subtree);
      for (const folder of subtree.folders) {
        const key = `folder:${folder.id}`;
        if (claimed.has(key)) throw new DriveError("invalid_state");
        claimed.add(key);
      }
      for (const file of subtree.files) {
        const key = `file:${file.id}`;
        if (claimed.has(key)) throw new DriveError("invalid_state");
        claimed.add(key);
      }
    }
    for (const item of items) {
      if (item.kind === "file" && claimed.has(`file:${item.resource.id}`)) {
        throw new DriveError("invalid_state");
      }
    }

    const now = this.now();
    for (const item of items) {
      const groupId = randomUUID();
      if (item.kind === "folder") {
        const subtree = folderPlans.get(item.resource.id)!;
        repositories.recycle.createGroup({
          id: groupId,
          ownerId,
          rootKind: "folder",
          rootId: item.resource.id,
          folderCount: subtree.folders.length,
          fileCount: subtree.files.length,
          createdAt: now,
        });
        for (const folder of subtree.folders) {
          if (!repositories.recycle.recycleFolder(ownerId, folder.id, groupId, now)) {
            throw new DriveError("concurrent_change");
          }
        }
        for (const file of subtree.files) {
          if (!repositories.recycle.recycleFile(ownerId, file.id, groupId, file.revision, now)) {
            throw new DriveError("concurrent_change");
          }
        }
        recordDriveAudit(repositories, "drive.folder_recycle", "account", ownerId, item.resource.id, now);
      } else {
        repositories.recycle.createGroup({
          id: groupId,
          ownerId,
          rootKind: "file",
          rootId: item.resource.id,
          folderCount: 0,
          fileCount: 1,
          createdAt: now,
        });
        if (!repositories.recycle.recycleFile(
          ownerId,
          item.resource.id,
          groupId,
          item.resource.revision,
          now,
        )) {
          throw new DriveError("concurrent_change");
        }
        recordDriveAudit(repositories, "drive.file_recycle", "account", ownerId, item.resource.id, now);
      }
    }
  }

  private bulkRestore(
    repositories: RepositorySet,
    ownerId: string,
    items: readonly ResolvedBulkItem[],
  ): void {
    const folderPlans = new Map<string, FolderRestorePlan>();
    const filePlans = new Map<string, FileRestorePlan>();
    const groupIds = new Set<string>();
    let expandedItems = 0;

    // Complete preflight before mutating any selected group. In particular,
    // one selected parent restore cannot make another selected child valid.
    for (const item of items) {
      if (item.resource.state !== "deleted") throw new DriveError("invalid_state");
      const group = repositories.recycle.findGroupByRoot(ownerId, item.kind, item.resource.id);
      if (!group) throw new DriveError("not_found");
      if (groupIds.has(group.id)) throw new DriveError("invalid_state");
      groupIds.add(group.id);
      requireActiveFolder(
        repositories,
        ownerId,
        item.kind === "folder" ? item.resource.parentId : item.resource.folderId,
      );

      const folderIds = repositories.recycle.listFolderIds(ownerId, group.id);
      const fileIds = repositories.recycle.listFileIds(ownerId, group.id);
      expandedItems += folderIds.length + fileIds.length;
      if (expandedItems > MAX_BULK_EXPANDED_ITEMS) {
        throw new RangeError("bulk expanded selection exceeds 10000 resources");
      }
      if (folderIds.length !== group.folderCount || fileIds.length !== group.fileCount) {
        throw new DriveError("invalid_state");
      }

      if (item.kind === "folder") {
        const folders = folderIds.map((id) => repositories.folders.findById(ownerId, id));
        const files = fileIds.map((id) => repositories.files.findById(ownerId, id));
        if (
          group.rootKind !== "folder"
          || !folders.some((folder) => folder?.id === item.resource.id)
          || folders.some((folder) => !folder || folder.state !== "deleted")
          || files.some((file) => !file || file.state !== "deleted")
        ) {
          throw new DriveError("invalid_state");
        }
        folderPlans.set(item.resource.id, {
          root: item.resource,
          groupId: group.id,
          folders: folders as Folder[],
          files: files as StoredFile[],
        });
      } else {
        if (
          group.rootKind !== "file"
          || group.folderCount !== 0
          || group.fileCount !== 1
          || folderIds.length !== 0
          || fileIds.length !== 1
          || fileIds[0] !== item.resource.id
        ) {
          throw new DriveError("invalid_state");
        }
        filePlans.set(item.resource.id, { file: item.resource, groupId: group.id });
      }
    }

    const now = this.now();
    for (const item of items) {
      if (item.kind === "folder") {
        const plan = folderPlans.get(item.resource.id)!;
        const pending = new Map(plan.folders.map((folder) => [folder.id, folder]));
        const restoredFolderIds = new Set<string>();
        while (pending.size > 0) {
          let progressed = false;
          for (const folder of [...pending.values()]) {
            const parentReady = folder.id === plan.root.id
              || (folder.parentId !== null && restoredFolderIds.has(folder.parentId));
            if (!parentReady) continue;
            if (!repositories.recycle.restoreFolder(ownerId, folder.id, plan.groupId, now)) {
              throw new DriveError("concurrent_change");
            }
            pending.delete(folder.id);
            restoredFolderIds.add(folder.id);
            progressed = true;
          }
          if (!progressed) throw new DriveError("invalid_state");
        }
        for (const file of plan.files) {
          if (
            file.folderId === null
            || !restoredFolderIds.has(file.folderId)
            || !repositories.recycle.restoreFile(ownerId, file.id, plan.groupId, file.revision, now)
          ) {
            throw new DriveError("concurrent_change");
          }
        }
        if (!repositories.recycle.deleteGroup(ownerId, plan.groupId)) throw new DriveError("invalid_state");
        recordDriveAudit(repositories, "drive.folder_restore", "account", ownerId, item.resource.id, now);
      } else {
        const plan = filePlans.get(item.resource.id)!;
        if (!repositories.recycle.restoreFile(
          ownerId,
          plan.file.id,
          plan.groupId,
          plan.file.revision,
          now,
        )) {
          throw new DriveError("concurrent_change");
        }
        if (!repositories.recycle.deleteGroup(ownerId, plan.groupId)) throw new DriveError("invalid_state");
        recordDriveAudit(repositories, "drive.file_restore", "account", ownerId, item.resource.id, now);
      }
    }
  }

  private bulkFavorite(
    repositories: RepositorySet,
    ownerId: string,
    items: readonly ResolvedBulkItem[],
    favorite: boolean,
  ): void {
    const now = this.now();
    for (const item of items) {
      if (item.resource.state !== "active") throw new DriveError("invalid_state");
      if (item.kind === "folder") {
        if (favorite) repositories.favorites.addFolder(ownerId, item.resource.id, now);
        else repositories.favorites.removeFolder(ownerId, item.resource.id);
      } else if (favorite) {
        repositories.favorites.addFile(ownerId, item.resource.id, now);
      } else {
        repositories.favorites.removeFile(ownerId, item.resource.id);
      }
    }
  }

  listRecycle(ownerId: string): { folders: Folder[]; files: StoredFile[] } {
    return {
      folders: this.persistence.repositories.folders
        .listDeleted(ownerId)
        .filter((folder) => !isLegacyProd03c2FixtureFolder(folder)),
      files: this.persistence.repositories.files.listDeleted(ownerId),
    };
  }

  async permanentlyDeleteFolder(
    ownerId: string,
    folderId: string,
    expectedVersion?: string,
    auditActor: StorageAuditActor = "account",
  ): Promise<void> {
    const root = this.persistence.repositories.folders.findById(ownerId, folderId);
    const group = this.persistence.repositories.recycle.findGroupByRoot(ownerId, "folder", folderId);
    if (!root || root.state !== "deleted" || !group || group.rootKind !== "folder") {
      throw new DriveError("not_found");
    }
    if (expectedVersion !== undefined && driveEntryVersion(root) !== expectedVersion) {
      throw new DriveError("concurrent_change");
    }

    const folderIds = this.persistence.repositories.recycle.listFolderIds(ownerId, group.id);
    const fileIds = this.persistence.repositories.recycle.listFileIds(ownerId, group.id);
    if (
      folderIds.length !== group.folderCount
      || fileIds.length !== group.fileCount
      || !folderIds.includes(folderId)
    ) {
      throw new DriveError("invalid_state");
    }

    const folders = folderIds.map((id) => this.persistence.repositories.folders.findById(ownerId, id));
    const files = fileIds.map((id) => this.persistence.repositories.files.findById(ownerId, id));
    if (
      folders.some((folder) => !folder || folder.state !== "deleted")
      || files.some((file) => !file || (file.state !== "deleted" && file.state !== "purging"))
    ) {
      throw new DriveError("invalid_state");
    }

    for (const file of files as StoredFile[]) {
      if (this.persistence.repositories.research?.isFileAttached(ownerId, file.id)) {
        throw new DriveError("invalid_state");
      }
      this.assertCurrentStorageProvider(file);
    }

    // Preserve the existing per-file purge state machine while the folder
    // recycle group remains the authoritative recursive deletion boundary.
    const purgingFiles = this.persistence.runInTransaction((repositories) => {
      const latestRoot = repositories.folders.findById(ownerId, folderId);
      const latestGroup = repositories.recycle.findGroupByRoot(ownerId, "folder", folderId);
      if (
        !latestRoot
        || latestRoot.state !== "deleted"
        || !latestGroup
        || latestGroup.id !== group.id
        || (expectedVersion !== undefined && driveEntryVersion(latestRoot) !== expectedVersion)
      ) {
        throw new DriveError("concurrent_change");
      }
      const prepared: StoredFile[] = [];
      for (const fileId of fileIds) {
        const latest = repositories.files.findById(ownerId, fileId);
        if (!latest || (latest.state !== "deleted" && latest.state !== "purging")) {
          throw new DriveError("concurrent_change");
        }
        if (latest.state === "purging") {
          prepared.push(latest);
          continue;
        }
        if (repositories.research?.isFileAttached(ownerId, fileId)) {
          throw new DriveError("invalid_state");
        }
        const now = this.now();
        const updated = repositories.files.update(
          { ...latest, state: "purging", updatedAt: now },
          "deleted",
          latest.revision,
        );
        if (!updated) throw new DriveError("concurrent_change");
        recordDriveAudit(repositories, "drive.file_purge_request", auditActor, ownerId, fileId, now);
        prepared.push(updated);
      }
      if (fileIds.length === 0) {
        recordDriveAudit(repositories, "drive.file_purge_request", auditActor, ownerId, folderId, this.now());
      }
      return prepared;
    });

    for (const file of purgingFiles) {
      let metadata: StorageObjectMetadata | null;
      try {
        metadata = await this.storage.statObject(file.objectKey);
      } catch (error: unknown) {
        throw new DriveError("storage_unavailable", { cause: error });
      }
      if (metadata && !storageMetadataMatches(file, metadata)) {
        throw new DriveError("upload_metadata_mismatch");
      }
      if (metadata) {
        try {
          await this.storage.deleteObject(file.objectKey);
        } catch (error: unknown) {
          throw new DriveError("storage_unavailable", { cause: error });
        }
      }
    }

    this.persistence.runInTransaction((repositories) => {
      const latestRoot = repositories.folders.findById(ownerId, folderId);
      const latestGroup = repositories.recycle.findGroupByRoot(ownerId, "folder", folderId);
      const latestFolderIds = latestGroup ? repositories.recycle.listFolderIds(ownerId, latestGroup.id) : [];
      const latestFileIds = latestGroup ? repositories.recycle.listFileIds(ownerId, latestGroup.id) : [];
      if (
        !latestRoot
        || latestRoot.state !== "deleted"
        || !latestGroup
        || latestGroup.id !== group.id
        || (expectedVersion !== undefined && driveEntryVersion(latestRoot) !== expectedVersion)
        || latestFolderIds.length !== folderIds.length
        || latestFileIds.length !== fileIds.length
        || latestFolderIds.some((id) => !folderIds.includes(id))
        || latestFileIds.some((id) => !fileIds.includes(id))
      ) {
        throw new DriveError("concurrent_change");
      }

      const now = this.now();
      for (const fileId of fileIds) {
        const current = repositories.files.findById(ownerId, fileId);
        if (
          !current
          || current.state !== "purging"
          || !repositories.recycle.markFilePurged(ownerId, fileId, group.id, current.revision, now)
        ) {
          throw new DriveError("concurrent_change");
        }
        const purged = repositories.files.findById(ownerId, fileId);
        if (!purged || purged.state !== "purged") throw new DriveError("invalid_state");
        if (purged.folderId !== null && !repositories.files.update(
          { ...purged, folderId: null, updatedAt: now },
          "purged",
          purged.revision,
        )) {
          throw new DriveError("concurrent_change");
        }
      }

      const folderById = new Map(
        folderIds.map((id) => [id, repositories.folders.findById(ownerId, id)] as const),
      );
      const depth = (folder: Folder): number => {
        let currentId = folder.parentId;
        let result = 0;
        while (currentId !== null && folderById.has(currentId)) {
          result += 1;
          currentId = folderById.get(currentId)?.parentId ?? null;
        }
        return result;
      };
      const deletionOrder = folders
        .map((folder) => folder!)
        .sort((left, right) => depth(right) - depth(left) || right.id.localeCompare(left.id));
      for (const folder of deletionOrder) {
        if (!repositories.folders.deleteDeleted(ownerId, folder.id, group.id)) {
          throw new DriveError("concurrent_change");
        }
      }
      if (!repositories.recycle.deleteGroup(ownerId, group.id)) {
        throw new DriveError("invalid_state");
      }
      for (const fileId of fileIds) {
        recordDriveAudit(repositories, "drive.file_purge_complete", auditActor, ownerId, fileId, now);
      }
      if (fileIds.length === 0) {
        recordDriveAudit(repositories, "drive.file_purge_complete", auditActor, ownerId, folderId, now);
      }
    });
  }

  async permanentlyDeleteFile(
    ownerId: string,
    fileId: string,
    auditActor: StorageAuditActor = "account",
  ): Promise<void> {
    const operationKey = `${ownerId}\0${fileId}`;
    const currentOperation = this.purgeOperations.get(operationKey);

    if (currentOperation) {
      return currentOperation;
    }

    const operation = this.performPermanentDelete(ownerId, fileId, auditActor).finally(() => {
      if (this.purgeOperations.get(operationKey) === operation) {
        this.purgeOperations.delete(operationKey);
      }
    });
    this.purgeOperations.set(operationKey, operation);

    return operation;
  }

  async permanentlyDeleteFileForDomain(
    ownerDomainId: string,
    fileId: string,
    expectedVersion: string,
    auditActorAccountId: string,
    beforePurge?: PermanentDeletePreparation,
  ): Promise<void> {
    const operationKey = `${ownerDomainId}\0${fileId}`;
    const currentOperation = this.purgeOperations.get(operationKey);
    if (currentOperation) return currentOperation;

    const operation = this.performPermanentDeleteForDomain(
      ownerDomainId,
      fileId,
      expectedVersion,
      auditActorAccountId,
      beforePurge,
    ).finally(() => {
      if (this.purgeOperations.get(operationKey) === operation) this.purgeOperations.delete(operationKey);
    });
    this.purgeOperations.set(operationKey, operation);
    return operation;
  }

  private async performPermanentDeleteForDomain(
    ownerDomainId: string,
    fileId: string,
    expectedVersion: string,
    auditActorAccountId: string,
    beforePurge?: PermanentDeletePreparation,
  ): Promise<void> {
    const current = this.persistence.repositories.files.findByDomainId(ownerDomainId, fileId);
    const group = this.persistence.repositories.recycle.findGroupByRootForDomain(ownerDomainId, "file", fileId);
    if (
      !current
      || current.state !== "deleted"
      || !group
      || group.rootKind !== "file"
      || group.folderCount !== 0
      || group.fileCount !== 1
      || this.persistence.repositories.recycle.listFolderIdsForDomain(ownerDomainId, group.id).length !== 0
      || this.persistence.repositories.recycle.listFileIdsForDomain(ownerDomainId, group.id).join() !== fileId
      || driveEntryVersion(current) !== expectedVersion
    ) {
      throw new DriveError(!current || !group ? "not_found" : "concurrent_change");
    }
    this.assertCurrentStorageProvider(current);

    const purging = this.persistence.runInTransaction((repositories) => {
      const latest = repositories.files.findByDomainId(ownerDomainId, fileId);
      const latestGroup = repositories.recycle.findGroupByRootForDomain(ownerDomainId, "file", fileId);
      if (
        !latest
        || latest.state !== "deleted"
        || !latestGroup
        || latestGroup.id !== group.id
        || latestGroup.folderCount !== 0
        || latestGroup.fileCount !== 1
        || repositories.recycle.listFolderIdsForDomain(ownerDomainId, latestGroup.id).length !== 0
        || repositories.recycle.listFileIdsForDomain(ownerDomainId, latestGroup.id).join() !== fileId
        || driveEntryVersion(latest) !== expectedVersion
      ) {
        throw new DriveError("concurrent_change");
      }
      const now = this.now();
      beforePurge?.(repositories, latest, now);
      const updated = repositories.files.updateForDomain(
        { ...latest, state: "purging", updatedAt: now },
        "deleted",
        latest.revision,
      );
      if (!updated) throw new DriveError("concurrent_change");
      recordDriveAudit(
        repositories,
        "drive.file_purge_request",
        "account",
        ownerDomainId,
        fileId,
        now,
        auditActorAccountId,
      );
      return updated;
    });

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

    this.persistence.runInTransaction((repositories) => {
      const latest = repositories.files.findByDomainId(ownerDomainId, fileId);
      const latestGroup = repositories.recycle.findGroupByRootForDomain(ownerDomainId, "file", fileId);
      if (
        !latest
        || latest.state !== "purging"
        || !latestGroup
        || latestGroup.id !== group.id
        || latestGroup.folderCount !== 0
        || latestGroup.fileCount !== 1
        || repositories.recycle.listFolderIdsForDomain(ownerDomainId, latestGroup.id).length !== 0
        || repositories.recycle.listFileIdsForDomain(ownerDomainId, latestGroup.id).join() !== fileId
        || latest.revision !== purging.revision
        || latest.storageProvider !== purging.storageProvider
        || latest.objectKey !== purging.objectKey
        || latest.sizeBytes !== purging.sizeBytes
        || latest.mediaType !== purging.mediaType
        || latest.checksumAlgorithm !== purging.checksumAlgorithm
        || latest.checksum !== purging.checksum
      ) {
        throw new DriveError("concurrent_change");
      }
      const now = this.now();
      beforePurge?.(repositories, latest, now);
      if (!repositories.recycle.markFilePurgedForDomain(
        ownerDomainId,
        fileId,
        group.id,
        latest.revision,
        now,
      )) {
        throw new DriveError("concurrent_change");
      }
      if (!repositories.recycle.deleteGroupForDomain(ownerDomainId, group.id)) {
        throw new DriveError("invalid_state");
      }
      recordDriveAudit(
        repositories,
        "drive.file_purge_complete",
        "account",
        ownerDomainId,
        fileId,
        now,
        auditActorAccountId,
      );
    });
  }

  private async performPermanentDelete(
    ownerId: string,
    fileId: string,
    auditActor: StorageAuditActor,
  ): Promise<void> {
    const current = this.persistence.repositories.files.findById(ownerId, fileId);
    const group = this.persistence.repositories.recycle.findGroupByRoot(ownerId, "file", fileId);

    if (!current || !group || (current.state !== "deleted" && current.state !== "purging")) {
      throw new DriveError("not_found");
    }

    if (this.persistence.repositories.research?.isFileAttached(ownerId, fileId)) {
      throw new DriveError("invalid_state");
    }

    this.assertCurrentStorageProvider(current);

    const purging = current.state === "purging"
      ? current
      : this.persistence.runInTransaction((repositories) => {
          const latest = repositories.files.findById(ownerId, fileId);
          if (!latest || latest.state !== "deleted" || latest.revision !== current.revision) {
            throw new DriveError("invalid_state");
          }
          if (repositories.research?.isFileAttached(ownerId, fileId)) {
            throw new DriveError("invalid_state");
          }
          const now = this.now();
          const updated = repositories.files.update(
            { ...latest, state: "purging", updatedAt: now },
            "deleted",
            latest.revision,
          );
          if (!updated) throw new DriveError("invalid_state");
          recordDriveAudit(
            repositories,
            "drive.file_purge_request",
            auditActor,
            ownerId,
            fileId,
            now,
          );
          return updated;
        });

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
    this.persistence.runInTransaction((repositories) => {
      const latest = repositories.files.findById(ownerId, fileId);
      const latestGroup = repositories.recycle.findGroupByRoot(ownerId, "file", fileId);
      if (
        !latest ||
        latest.state !== "purging" ||
        !latestGroup ||
        latestGroup.id !== group.id ||
        !repositories.recycle.markFilePurged(ownerId, fileId, group.id, latest.revision, now) ||
        !repositories.recycle.deleteGroup(ownerId, group.id)
      ) {
        throw new DriveError("invalid_state");
      }
      recordDriveAudit(
        repositories,
        "drive.file_purge_complete",
        auditActor,
        ownerId,
        fileId,
        now,
      );
    });
  }

  private reservePendingFile(ownerId: string, input: CreateUploadInput): StoredFile {
    const displayName = normalizeName(input.displayName);
    const mediaType = input.mediaType.toLowerCase();
    assertMediaType(mediaType);
    assertContentLength(input.sizeBytes);
    if (input.checksum.algorithm !== "md5") throw new TypeError("checksum algorithm must be md5");
    if (input.sizeBytes > 5 * 1024 * 1024 * 1024) {
      throw new RangeError("sizeBytes exceeds the 5 GiB upload limit");
    }
    assertBase64Md5(input.checksum.value);
    const now = this.now();
    try {
      return this.persistence.runInTransaction((repositories) => {
        requireActiveFolder(repositories, ownerId, input.folderId);
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
  }

  private multipartRepository(): MultipartUploadRepository {
    const repository = this.persistence.repositories.multipartUploads;
    if (!repository) throw new DriveError("storage_unavailable");
    return repository;
  }

  private requireMultipartStorage(): Required<Pick<
    StorageAdapter,
    "initiateMultipartUpload" | "createMultipartPartAuthorization" | "listMultipartParts"
      | "completeMultipartUpload" | "abortMultipartUpload"
  >> {
    const storage = this.storage;
    if (!storage.initiateMultipartUpload || !storage.createMultipartPartAuthorization
      || !storage.listMultipartParts || !storage.completeMultipartUpload || !storage.abortMultipartUpload) {
      throw new DriveError("storage_unavailable");
    }
    return {
      initiateMultipartUpload: storage.initiateMultipartUpload.bind(storage),
      createMultipartPartAuthorization: storage.createMultipartPartAuthorization.bind(storage),
      listMultipartParts: storage.listMultipartParts.bind(storage),
      completeMultipartUpload: storage.completeMultipartUpload.bind(storage),
      abortMultipartUpload: storage.abortMultipartUpload.bind(storage),
    };
  }

  private assertMultipartIdentity(file: StoredFile, upload: MultipartUpload): void {
    if (file.state !== "pending_upload" || file.storageProvider !== this.storage.provider
      || upload.fileId !== file.id || upload.ownerId !== file.ownerId
      || upload.storageProvider !== file.storageProvider || file.sizeBytes === null
      || file.mediaType === null || file.checksumAlgorithm !== "md5" || file.checksum === null
      || upload.partSizeBytes !== MULTIPART_PART_SIZE_BYTES
      || upload.totalParts !== Math.ceil(file.sizeBytes / upload.partSizeBytes)
      || upload.totalParts < 1 || upload.totalParts > MULTIPART_MAX_PARTS) {
      throw new DriveError("invalid_state");
    }
  }

  private requireMultipartUpload(
    ownerId: string,
    fileId: string,
    version: string,
  ): { file: StoredFile; upload: MultipartUpload } {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);
    const upload = this.multipartRepository().findByFileId(ownerId, fileId);
    if (!file || !upload) throw new DriveError("not_found");
    this.assertMultipartIdentity(file, upload);
    if (multipartUploadVersion(upload) !== version) throw new DriveError("concurrent_change");
    this.assertMultipartNotExpired(upload);
    return { file, upload };
  }

  private assertMultipartNotExpired(upload: MultipartUpload): void {
    if (upload.expiresAt.getTime() <= this.now().getTime()) {
      throw new DriveError("invalid_state");
    }
  }

  private async safeStat(file: StoredFile): Promise<StorageObjectMetadata | null> {
    this.assertCurrentStorageProvider(file);
    try {
      return await this.storage.statObject(file.objectKey);
    } catch (error: unknown) {
      throw new DriveError("storage_unavailable", { cause: error });
    }
  }

  private async listAllMultipartParts(file: StoredFile, upload: MultipartUpload): Promise<StorageMultipartPart[]> {
    const storage = this.requireMultipartStorage();
    let result: ListMultipartPartsResult;
    try {
      result = await storage.listMultipartParts({
        objectKey: file.objectKey,
        uploadId: upload.providerUploadId,
        partNumberMarker: 0,
        limit: MULTIPART_LIST_PAGE_SIZE,
      });
    } catch (error: unknown) {
      throw new DriveError("storage_unavailable", { cause: error });
    }
    const parts = [...result.parts];
    if (result.nextPartNumberMarker !== null || parts.length > upload.totalParts
      || parts.length > MULTIPART_LIST_PAGE_SIZE) throw new DriveError("upload_metadata_mismatch");
    if (new Set(parts.map((part) => part.partNumber)).size !== parts.length) {
      throw new DriveError("upload_metadata_mismatch");
    }
    return parts.sort((left, right) => left.partNumber - right.partNumber);
  }

  private toMultipartStatus(
    file: StoredFile,
    upload: MultipartUpload,
    parts: readonly StorageMultipartPart[],
  ): MultipartUploadStatus {
    this.assertMultipartIdentity(file, upload);
    if (upload.state === "abandoning") throw new DriveError("concurrent_change");
    let completedBytes = 0;
    const completedParts = parts.map((part) => {
      if (!Number.isSafeInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > upload.totalParts) {
        throw new DriveError("upload_metadata_mismatch");
      }
      const expectedSize = expectedMultipartPartSize(
        file.sizeBytes!,
        upload.partSizeBytes,
        upload.totalParts,
        part.partNumber,
      );
      if (part.sizeBytes !== expectedSize || !part.etag) throw new DriveError("upload_metadata_mismatch");
      completedBytes += part.sizeBytes;
      return { partNumber: part.partNumber, sizeBytes: part.sizeBytes, etag: part.etag };
    });
    return {
      kind: "multipart",
      file,
      state: upload.state,
      version: multipartUploadVersion(upload),
      partSizeBytes: upload.partSizeBytes,
      totalParts: upload.totalParts,
      completedParts,
      completedBytes,
      expiresAt: upload.expiresAt,
    };
  }

  private async performMultipartCompletion(
    ownerId: string,
    fileId: string,
    version: string,
    auditActor: StorageAuditActor,
    afterActivation?: UploadActivationWork,
  ): Promise<StoredFile> {
    const file = this.persistence.repositories.files.findById(ownerId, fileId);
    if (file?.state === "active") return file;
    const required = this.requireMultipartUpload(ownerId, fileId, version);
    let upload = required.upload;
    if (upload.state === "abandoning") throw new DriveError("concurrent_change");
    const metadata = await this.safeStat(required.file);
    if (metadata) {
      if (!storageMetadataMatches(required.file, metadata)) throw new DriveError("upload_metadata_mismatch");
      return this.finalizeMultipartLogicalUpload(required.file, upload, auditActor, afterActivation);
    }

    if (upload.state !== "completing") {
      const completing = this.multipartRepository().update(
        { ...upload, state: "completing", updatedAt: this.now() },
        upload.state,
        upload.revision,
      );
      if (!completing) throw new DriveError("concurrent_change");
      upload = completing;
    }

    const parts = await this.listAllMultipartParts(required.file, upload);
    let exact = false;
    try {
      const status = this.toMultipartStatus(required.file, upload, parts);
      exact = status.completedParts.length === upload.totalParts
        && status.completedParts.every((part, index) => part.partNumber === index + 1)
        && status.completedBytes === required.file.sizeBytes;
    } catch (error: unknown) {
      if (error instanceof DriveError) throw error;
      throw new DriveError("upload_metadata_mismatch", { cause: error });
    }
    if (!exact) {
      const restored = this.multipartRepository().update(
        { ...upload, state: "uploading", updatedAt: this.now() },
        "completing",
        upload.revision,
      );
      if (!restored) throw new DriveError("concurrent_change");
      throw new DriveError("upload_incomplete");
    }

    try {
      await this.requireMultipartStorage().completeMultipartUpload({
        objectKey: required.file.objectKey,
        uploadId: upload.providerUploadId,
        parts: parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag })),
      });
    } catch (error: unknown) {
      const afterFailure = await this.safeStat(required.file);
      if (!afterFailure || !storageMetadataMatches(required.file, afterFailure)) {
        throw new DriveError("storage_unavailable", { cause: error });
      }
    }

    const completedMetadata = await this.safeStat(required.file);
    if (!completedMetadata) throw new DriveError("upload_incomplete");
    if (!storageMetadataMatches(required.file, completedMetadata)) throw new DriveError("upload_metadata_mismatch");
    return this.finalizeMultipartLogicalUpload(required.file, upload, auditActor, afterActivation);
  }

  private async finalizeMultipartLogicalUpload(
    file: StoredFile,
    upload: MultipartUpload,
    auditActor: StorageAuditActor,
    afterActivation?: UploadActivationWork,
  ): Promise<StoredFile> {
    return this.persistence.runInTransaction((repositories) => {
      const current = repositories.files.findById(file.ownerId, file.id);
      const currentUpload = repositories.multipartUploads?.findByFileId(file.ownerId, file.id) ?? null;
      if (!current || current.state !== "pending_upload" || current.revision !== file.revision
        || !currentUpload || currentUpload.revision !== upload.revision) {
        throw new DriveError("concurrent_change");
      }
      const now = this.now();
      const activated = repositories.files.update(
        { ...current, state: "active", activatedAt: now, updatedAt: now },
        "pending_upload",
        current.revision,
      );
      if (!activated || !repositories.multipartUploads!.delete(file.ownerId, file.id, currentUpload.revision)) {
        throw new DriveError("concurrent_change");
      }
      recordDriveAudit(repositories, "drive.upload_activate", auditActor, file.ownerId, file.id, now);
      afterActivation?.(repositories, activated, now);
      return repositories.files.findById(file.ownerId, file.id) ?? activated;
    });
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
