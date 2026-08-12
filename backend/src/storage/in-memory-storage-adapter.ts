import {
  assertAuthorizationDuration,
  assertContentLength,
  assertMediaType,
  createContentDisposition,
} from "./authorization.js";
import { assertValidObjectKey } from "./object-key.js";
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
  private readonly objects = new Map<string, StorageObjectMetadata>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createUploadAuthorization(
    input: CreateUploadAuthorizationInput,
  ): Promise<BrowserUploadAuthorization> {
    assertValidObjectKey(input.objectKey);
    assertContentLength(input.contentLength);
    assertMediaType(input.mediaType);
    const expiresInSeconds = input.expiresInSeconds ?? 300;
    assertAuthorizationDuration(expiresInSeconds);

    return {
      method: "POST",
      url: "memory://upload",
      fields: {
        key: input.objectKey,
        "Content-Type": input.mediaType,
        "content-length": String(input.contentLength),
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
    const disposition = createContentDisposition(input.downloadFilename);

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

  async deleteObject(objectKey: string): Promise<void> {
    assertValidObjectKey(objectKey);
    this.objects.delete(objectKey);
  }

  putObject(metadata: StorageObjectMetadata): void {
    assertValidObjectKey(metadata.objectKey);
    this.objects.set(metadata.objectKey, {
      ...metadata,
      modifiedAt: metadata.modifiedAt && new Date(metadata.modifiedAt),
    });
  }
}
