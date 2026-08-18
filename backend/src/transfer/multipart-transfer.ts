import { createHash } from "node:crypto";

export const MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
export const MULTIPART_MAX_PARTS = 640;
export const MULTIPART_LIST_PAGE_SIZE = 1_000;
export const MULTIPART_SESSION_TTL_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;

export type MultipartUploadState = "uploading" | "paused" | "completing" | "abandoning";

export interface MultipartUpload {
  fileId: string;
  ownerId: string;
  storageProvider: string;
  providerUploadId: string;
  partSizeBytes: number;
  totalParts: number;
  state: MultipartUploadState;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export type NewMultipartUpload = MultipartUpload;

export interface MultipartUploadRepository {
  create(upload: NewMultipartUpload): MultipartUpload;
  findByFileId(ownerId: string, fileId: string): MultipartUpload | null;
  update(upload: MultipartUpload, expectedState: MultipartUploadState, expectedRevision: number): MultipartUpload | null;
  delete(ownerId: string, fileId: string, expectedRevision: number): boolean;
  listStale(expiresBefore: Date, limit: number): MultipartUpload[];
}

export function multipartUploadVersion(upload: MultipartUpload): string {
  return createHash("sha256").update(JSON.stringify([
    "multipart-upload",
    upload.fileId,
    upload.storageProvider,
    upload.partSizeBytes,
    upload.totalParts,
    upload.state,
    upload.revision,
    upload.updatedAt.toISOString(),
    upload.expiresAt.toISOString(),
  ])).digest("base64url");
}

export function expectedMultipartPartSize(
  totalSizeBytes: number,
  partSizeBytes: number,
  totalParts: number,
  partNumber: number,
): number {
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > totalParts) {
    throw new RangeError("invalid multipart part number");
  }
  const start = (partNumber - 1) * partSizeBytes;
  return Math.min(partSizeBytes, totalSizeBytes - start);
}
