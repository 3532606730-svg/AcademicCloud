import {
  assertAuthorizationDuration,
  assertBase64Md5,
  assertContentLength,
  assertMediaType,
  createContentDisposition,
} from "./authorization.js";
import { assertValidObjectKey } from "./object-key.js";
import {
  assertBoundedReadLimit,
  StorageObjectContentUnavailableError,
  StorageObjectReadLimitError,
} from "./storage-adapter.js";
import type {
  AbortMultipartUploadInput,
  BrowserMultipartPartAuthorization,
  BrowserDownloadAuthorization,
  BrowserUploadAuthorization,
  CompleteMultipartUploadInput,
  CreateMultipartPartAuthorizationInput,
  CreateDownloadAuthorizationInput,
  CreateUploadAuthorizationInput,
  InitiateMultipartUploadInput,
  ListMultipartPartsInput,
  ListMultipartPartsResult,
  MultipartUploadHandle,
  StorageAdapter,
  StorageMultipartPart,
  StorageObjectMetadata,
} from "./storage-adapter.js";

export class InMemoryStorageAdapter implements StorageAdapter {
  readonly provider = "memory";
  readonly browserPreviewAvailable = true;
  private readonly objects = new Map<string, StorageObjectMetadata>();
  private readonly objectBytes = new Map<string, Uint8Array>();
  private readonly multipartUploads = new Map<string, {
    objectKey: string;
    mediaType: string;
    checksum: string;
    parts: Map<number, StorageMultipartPart & { bytes?: Uint8Array }>;
  }>();
  private nextMultipartId = 1;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createUploadAuthorization(
    input: CreateUploadAuthorizationInput,
  ): Promise<BrowserUploadAuthorization> {
    assertValidObjectKey(input.objectKey);
    assertContentLength(input.contentLength);
    assertMediaType(input.mediaType);
    assertBase64Md5(input.expectedChecksum.value);
    const expiresInSeconds = input.expiresInSeconds ?? 300;
    assertAuthorizationDuration(expiresInSeconds);

    return {
      method: "POST",
      url: "memory://upload",
      fields: {
        key: input.objectKey,
        "Content-Type": input.mediaType,
        "content-length": String(input.contentLength),
        "Content-MD5": input.expectedChecksum.value,
        "x-oss-forbid-overwrite": "true",
      },
      expiresAt: new Date(this.now().getTime() + expiresInSeconds * 1_000),
    };
  }

  async createDownloadAuthorization(
    input: CreateDownloadAuthorizationInput,
  ): Promise<BrowserDownloadAuthorization> {
    assertValidObjectKey(input.objectKey);
    const expiresInSeconds = input.expiresInSeconds ?? 300;
    assertAuthorizationDuration(expiresInSeconds);
    const disposition = createContentDisposition(input.downloadFilename, input.disposition);

    return {
      method: "GET",
      url: `memory://download/${encodeURIComponent(input.objectKey)}?response-content-disposition=${encodeURIComponent(disposition)}`,
      expiresAt: new Date(this.now().getTime() + expiresInSeconds * 1_000),
    };
  }

  async initiateMultipartUpload(input: InitiateMultipartUploadInput): Promise<MultipartUploadHandle> {
    assertValidObjectKey(input.objectKey);
    assertMediaType(input.mediaType);
    assertBase64Md5(input.expectedChecksum.value);
    if (this.objects.has(input.objectKey)) throw new Error("object already exists");
    const uploadId = `memory-multipart-${this.nextMultipartId++}`;
    this.multipartUploads.set(uploadId, {
      objectKey: input.objectKey,
      mediaType: input.mediaType,
      checksum: input.expectedChecksum.value,
      parts: new Map(),
    });
    return { uploadId };
  }

  async createMultipartPartAuthorization(
    input: CreateMultipartPartAuthorizationInput,
  ): Promise<BrowserMultipartPartAuthorization> {
    assertValidObjectKey(input.objectKey);
    assertContentLength(input.contentLength);
    assertBase64Md5(input.contentMd5);
    const upload = this.multipartUploads.get(input.uploadId);
    if (!upload || upload.objectKey !== input.objectKey) throw new Error("multipart upload unavailable");
    const expiresInSeconds = input.expiresInSeconds ?? 300;
    assertAuthorizationDuration(expiresInSeconds);
    return {
      method: "PUT",
      url: `memory://multipart/${encodeURIComponent(input.uploadId)}/${input.partNumber}`,
      headers: {
        "Content-Length": String(input.contentLength),
        "Content-MD5": input.contentMd5,
      },
      expiresAt: new Date(this.now().getTime() + expiresInSeconds * 1_000),
    };
  }

  async listMultipartParts(input: ListMultipartPartsInput): Promise<ListMultipartPartsResult> {
    assertValidObjectKey(input.objectKey);
    const upload = this.multipartUploads.get(input.uploadId);
    if (!upload || upload.objectKey !== input.objectKey) throw new Error("multipart upload unavailable");
    const all = [...upload.parts.values()]
      .filter((part) => part.partNumber > input.partNumberMarker)
      .sort((left, right) => left.partNumber - right.partNumber);
    const parts = all.slice(0, input.limit).map(({ bytes: _bytes, ...part }) => ({ ...part }));
    return {
      parts,
      nextPartNumberMarker: all.length > parts.length ? parts.at(-1)!.partNumber : null,
    };
  }

  async completeMultipartUpload(input: CompleteMultipartUploadInput): Promise<void> {
    assertValidObjectKey(input.objectKey);
    const upload = this.multipartUploads.get(input.uploadId);
    if (!upload || upload.objectKey !== input.objectKey) throw new Error("multipart upload unavailable");
    const ordered = [...input.parts].sort((left, right) => left.partNumber - right.partNumber);
    const parts = ordered.map((part) => {
      const stored = upload.parts.get(part.partNumber);
      if (!stored || stored.etag !== part.etag) throw new Error("multipart part unavailable");
      return stored;
    });
    const sizeBytes = parts.reduce((total, part) => total + part.sizeBytes, 0);
    const allHaveBytes = parts.every((part) => part.bytes !== undefined);
    const bytes = allHaveBytes
      ? new Uint8Array(Buffer.concat(parts.map((part) => Buffer.from(part.bytes!))))
      : undefined;
    this.putObject({
      objectKey: upload.objectKey,
      sizeBytes,
      etag: `multipart-${input.uploadId}`,
      checksumAlgorithm: "md5",
      checksum: upload.checksum,
      mediaType: upload.mediaType,
      modifiedAt: this.now(),
    }, bytes);
    this.multipartUploads.delete(input.uploadId);
  }

  async abortMultipartUpload(input: AbortMultipartUploadInput): Promise<void> {
    assertValidObjectKey(input.objectKey);
    const upload = this.multipartUploads.get(input.uploadId);
    if (!upload) return;
    if (upload.objectKey !== input.objectKey) throw new Error("multipart upload mismatch");
    this.multipartUploads.delete(input.uploadId);
  }

  async statObject(objectKey: string): Promise<StorageObjectMetadata | null> {
    assertValidObjectKey(objectKey);

    const metadata = this.objects.get(objectKey);

    return metadata ? { ...metadata, modifiedAt: metadata.modifiedAt && new Date(metadata.modifiedAt) } : null;
  }

  async readObject(objectKey: string, maxBytes: number): Promise<Uint8Array | null> {
    assertValidObjectKey(objectKey);
    assertBoundedReadLimit(maxBytes);

    const metadata = this.objects.get(objectKey);

    if (!metadata) {
      return null;
    }

    if (metadata.sizeBytes > maxBytes) {
      throw new StorageObjectReadLimitError(objectKey, metadata.sizeBytes, maxBytes);
    }

    if (metadata.sizeBytes === 0) {
      return new Uint8Array();
    }

    const bytes = this.objectBytes.get(objectKey);

    if (!bytes) {
      throw new StorageObjectContentUnavailableError(objectKey);
    }

    if (bytes.byteLength > maxBytes) {
      throw new StorageObjectReadLimitError(objectKey, bytes.byteLength, maxBytes);
    }

    if (bytes.byteLength !== metadata.sizeBytes) {
      throw new Error(`In-memory object size changed while reading: ${objectKey}`);
    }

    return new Uint8Array(bytes);
  }

  async deleteObject(objectKey: string): Promise<void> {
    assertValidObjectKey(objectKey);
    this.objects.delete(objectKey);
    this.objectBytes.delete(objectKey);
  }

  putObject(metadata: StorageObjectMetadata, bytes?: Uint8Array): void {
    assertValidObjectKey(metadata.objectKey);

    if (bytes !== undefined && bytes.byteLength !== metadata.sizeBytes) {
      throw new RangeError(
        `In-memory object bytes do not match metadata size (${bytes.byteLength} !== ${metadata.sizeBytes})`,
      );
    }

    this.objects.set(metadata.objectKey, {
      ...metadata,
      modifiedAt: metadata.modifiedAt && new Date(metadata.modifiedAt),
    });

    if (bytes === undefined) {
      this.objectBytes.delete(metadata.objectKey);
    } else {
      this.objectBytes.set(metadata.objectKey, new Uint8Array(bytes));
    }
  }

  putObjectBytes(objectKey: string, bytes: Uint8Array): void {
    assertValidObjectKey(objectKey);
    const metadata = this.objects.get(objectKey);

    if (!metadata) {
      throw new Error(`Cannot attach bytes to an unknown in-memory object: ${objectKey}`);
    }

    if (bytes.byteLength !== metadata.sizeBytes) {
      throw new RangeError(
        `In-memory object bytes do not match metadata size (${bytes.byteLength} !== ${metadata.sizeBytes})`,
      );
    }

    this.objectBytes.set(objectKey, new Uint8Array(bytes));
  }

  putMultipartPart(
    uploadId: string,
    partNumber: number,
    bytesOrSize: Uint8Array | number,
    etag = `etag-${partNumber}`,
  ): void {
    const upload = this.multipartUploads.get(uploadId);
    if (!upload) throw new Error("unknown in-memory multipart upload");
    const bytes = typeof bytesOrSize === "number" ? undefined : new Uint8Array(bytesOrSize);
    const sizeBytes = typeof bytesOrSize === "number" ? bytesOrSize : bytesOrSize.byteLength;
    upload.parts.set(partNumber, {
      partNumber,
      sizeBytes,
      etag,
      modifiedAt: this.now(),
      ...(bytes === undefined ? {} : { bytes }),
    });
  }

  hasMultipartUpload(uploadId: string): boolean {
    return this.multipartUploads.has(uploadId);
  }
}
