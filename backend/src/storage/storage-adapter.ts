export interface CreateUploadAuthorizationInput {
  objectKey: string;
  contentLength: number;
  mediaType: string;
  expectedChecksum: { algorithm: "md5"; value: string };
  expiresInSeconds?: number;
}

export interface BrowserUploadAuthorization {
  method: "POST";
  url: string;
  fields: Readonly<Record<string, string>>;
  expiresAt: Date;
}

export interface CreateDownloadAuthorizationInput {
  objectKey: string;
  downloadFilename: string;
  disposition?: "attachment" | "inline";
  expiresInSeconds?: number;
}

export interface BrowserDownloadAuthorization {
  method: "GET";
  url: string;
  expiresAt: Date;
}

export interface InitiateMultipartUploadInput {
  objectKey: string;
  mediaType: string;
  expectedChecksum: { algorithm: "md5"; value: string };
}

export interface MultipartUploadHandle {
  uploadId: string;
}

export interface CreateMultipartPartAuthorizationInput {
  objectKey: string;
  uploadId: string;
  partNumber: number;
  contentLength: number;
  contentMd5: string;
  expiresInSeconds?: number;
}

export interface BrowserMultipartPartAuthorization {
  method: "PUT";
  url: string;
  headers: Readonly<Record<string, string>>;
  expiresAt: Date;
}

export interface StorageMultipartPart {
  partNumber: number;
  sizeBytes: number;
  etag: string;
  modifiedAt: Date | null;
}

export interface ListMultipartPartsInput {
  objectKey: string;
  uploadId: string;
  partNumberMarker: number;
  limit: number;
}

export interface ListMultipartPartsResult {
  parts: readonly StorageMultipartPart[];
  nextPartNumberMarker: number | null;
}

export interface CompleteMultipartUploadInput {
  objectKey: string;
  uploadId: string;
  parts: ReadonlyArray<{ partNumber: number; etag: string }>;
}

export interface AbortMultipartUploadInput {
  objectKey: string;
  uploadId: string;
}

export interface StorageObjectMetadata {
  objectKey: string;
  sizeBytes: number;
  etag: string | null;
  checksumAlgorithm: "md5" | "crc64" | null;
  checksum: string | null;
  mediaType: string | null;
  modifiedAt: Date | null;
}

/**
 * The maximum amount of object data any application-level bounded read may
 * request.  Suggestion extraction is intentionally a small, front-matter
 * operation; this hard ceiling prevents a caller from turning the storage
 * abstraction into an unbounded download path.
 */
export const MAX_BOUNDED_READ_BYTES = 32 * 1024 * 1024;

/** Maximum size of one provider range request used by bounded PDF inspection. */
export const MAX_BOUNDED_RANGE_BYTES = 2 * 1024 * 1024;

export interface StorageObjectRange {
  /** Zero-based inclusive start, exclusive end. */
  begin: number;
  end: number;
  bytes: Uint8Array;
}

export class StorageObjectReadLimitError extends Error {
  readonly code = "storage_object_read_limit" as const;

  constructor(
    readonly objectKey: string,
    readonly sizeBytes: number,
    readonly maxBytes: number,
  ) {
    super(`Object ${objectKey} exceeds the bounded read limit (${sizeBytes} > ${maxBytes} bytes)`);
    this.name = "StorageObjectReadLimitError";
  }
}

export class StorageObjectContentUnavailableError extends Error {
  readonly code = "storage_object_content_unavailable" as const;

  constructor(readonly objectKey: string) {
    super(`Object content is unavailable for bounded read: ${objectKey}`);
    this.name = "StorageObjectContentUnavailableError";
  }
}

export function assertBoundedReadLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BOUNDED_READ_BYTES) {
    throw new RangeError(
      `Bounded object read limit must be an integer between 1 and ${MAX_BOUNDED_READ_BYTES} bytes`,
    );
  }
}

export function assertBoundedRange(begin: number, end: number, maxBytes = MAX_BOUNDED_RANGE_BYTES): void {
  if (!Number.isSafeInteger(begin) || begin < 0
    || !Number.isSafeInteger(end) || end < begin
    || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BOUNDED_RANGE_BYTES
    || end - begin > maxBytes) {
    throw new RangeError(`Bounded object range must be a safe half-open range no larger than ${MAX_BOUNDED_RANGE_BYTES} bytes`);
  }
}

export interface StorageAdapter {
  readonly provider: string;

  /** True when inline browser Preview can be safely authorized (a dedicated
   *  custom browser GET domain is configured). */
  readonly browserPreviewAvailable: boolean;

  createUploadAuthorization(
    input: CreateUploadAuthorizationInput,
  ): Promise<BrowserUploadAuthorization>;

  createDownloadAuthorization(
    input: CreateDownloadAuthorizationInput,
  ): Promise<BrowserDownloadAuthorization>;

  initiateMultipartUpload?(input: InitiateMultipartUploadInput): Promise<MultipartUploadHandle>;

  createMultipartPartAuthorization?(
    input: CreateMultipartPartAuthorizationInput,
  ): Promise<BrowserMultipartPartAuthorization>;

  listMultipartParts?(input: ListMultipartPartsInput): Promise<ListMultipartPartsResult>;

  completeMultipartUpload?(input: CompleteMultipartUploadInput): Promise<void>;

  abortMultipartUpload?(input: AbortMultipartUploadInput): Promise<void>;

  statObject(objectKey: string): Promise<StorageObjectMetadata | null>;

  /**
   * Read an object through the provider abstraction, subject to a caller
   * limit and the global {@link MAX_BOUNDED_READ_BYTES} ceiling.  A missing
   * object returns null; an oversized object fails closed with
   * StorageObjectReadLimitError.
   */
  readObject(objectKey: string, maxBytes: number): Promise<Uint8Array | null>;

  /**
   * Read one bounded half-open byte range without applying the whole-object
   * size gate. Implementations must enforce the per-request maximum and return
   * exactly the requested bytes, except at EOF. The method is optional for
   * legacy test/provider adapters; bounded PDF inspection falls back to the
   * whole-object path only when the object is within its 32 MiB ceiling.
   */
  readObjectRange?(
    objectKey: string,
    begin: number,
    end: number,
    maxBytes?: number,
  ): Promise<StorageObjectRange | null>;

  deleteObject(objectKey: string): Promise<void>;
}
