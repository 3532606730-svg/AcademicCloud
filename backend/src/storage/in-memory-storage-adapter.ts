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
  BrowserDownloadAuthorization,
  BrowserUploadAuthorization,
  CreateDownloadAuthorizationInput,
  CreateUploadAuthorizationInput,
  StorageAdapter,
  StorageObjectMetadata,
} from "./storage-adapter.js";

export class InMemoryStorageAdapter implements StorageAdapter {
  readonly provider = "memory";
  readonly browserPreviewAvailable = true;
  private readonly objects = new Map<string, StorageObjectMetadata>();
  private readonly objectBytes = new Map<string, Uint8Array>();

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
}
