export interface CreateUploadAuthorizationInput {
  objectKey: string;
  contentLength: number;
  mediaType: string;
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
  expiresInSeconds?: number;
}

export interface BrowserDownloadAuthorization {
  method: "GET";
  url: string;
  expiresAt: Date;
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

export interface StorageAdapter {
  readonly provider: string;

  createUploadAuthorization(
    input: CreateUploadAuthorizationInput,
  ): Promise<BrowserUploadAuthorization>;

  createDownloadAuthorization(
    input: CreateDownloadAuthorizationInput,
  ): Promise<BrowserDownloadAuthorization>;

  statObject(objectKey: string): Promise<StorageObjectMetadata | null>;

  deleteObject(objectKey: string): Promise<void>;
}
