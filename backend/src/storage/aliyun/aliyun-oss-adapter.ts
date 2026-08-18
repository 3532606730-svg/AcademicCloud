import { createHmac } from "node:crypto";

import {
  assertAuthorizationDuration,
  assertBase64Md5,
  assertContentLength,
  assertMediaType,
  createContentDisposition,
} from "../authorization.js";
import { assertValidObjectKey } from "../object-key.js";
import {
  assertBoundedReadLimit,
  StorageObjectContentUnavailableError,
  StorageObjectReadLimitError,
} from "../storage-adapter.js";
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
  StorageObjectMetadata,
} from "../storage-adapter.js";
import type { AliyunGetResult, AliyunOssClientPort } from "./client.js";
import { createAliyunBrowserClient, createAliyunOssClient } from "./client.js";
import type { AliyunOssConfig } from "./config.js";

type HeaderMap = Record<string, string | number | string[] | undefined>;

function asHeaderMap(headers: object): HeaderMap {
  return headers as HeaderMap;
}

function readHeader(headers: HeaderMap, name: string): string | null {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value === undefined ? null : String(value);
}

function parseNonNegativeInteger(value: string | null, name: string): number {
  if (value === null || !/^\d+$/.test(value)) {
    throw new Error(`OSS returned an invalid ${name} header`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`OSS returned an invalid ${name} header`);
  }

  return parsed;
}

function parseOptionalDate(value: string | null): Date | null {
  if (value === null) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stripEtagQuotes(value: string | null): string | null {
  return value?.replace(/^"|"$/g, "") ?? null;
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown };

  return (
    candidate.status === 404 ||
    candidate.statusCode === 404 ||
    candidate.code === "NoSuchKey" ||
    candidate.code === "NoSuchObject"
  );
}

function isNoSuchUpload(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  return candidate.status === 404 || candidate.statusCode === 404 || candidate.code === "NoSuchUpload";
}

function assertMultipartUploadId(uploadId: string): void {
  if (!uploadId || uploadId.length > 512 || uploadId !== uploadId.trim() || uploadId.includes("\0")) {
    throw new TypeError("invalid OSS multipart upload ID");
  }
}

function toUint8Array(content: unknown): Uint8Array | null {
  if (content instanceof Uint8Array) {
    return new Uint8Array(content);
  }

  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content.slice(0));
  }

  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }

  return null;
}

function parseContentRangeTotal(headers: HeaderMap): number | null {
  const value = readHeader(headers, "content-range");

  if (value === null) {
    return null;
  }

  const match = /^bytes\s+\d+-\d+\/(\d+|\*)$/i.exec(value.trim());

  if (!match || match[1] === "*") {
    return null;
  }

  const parsed = Number(match[1]);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

export class AliyunOssStorageAdapter implements StorageAdapter {
  readonly provider = "aliyun-oss";

  // Inline Preview is only available when a dedicated browser GET domain
  // (OSS custom domain) is configured. Without it the native bucket domain
  // would force a download, so inline authorization must fail safely.
  readonly browserPreviewAvailable: boolean;

  constructor(
    private readonly config: AliyunOssConfig,
    private readonly client: AliyunOssClientPort = createAliyunOssClient(config),
    private readonly browserClient: AliyunOssClientPort | null = config.browserEndpoint
      ? createAliyunBrowserClient(config, config.browserEndpoint)
      : null,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.browserPreviewAvailable = this.browserClient !== null;
  }

  async createUploadAuthorization(
    input: CreateUploadAuthorizationInput,
  ): Promise<BrowserUploadAuthorization> {
    assertValidObjectKey(input.objectKey);
    assertContentLength(input.contentLength);
    assertMediaType(input.mediaType);
    assertBase64Md5(input.expectedChecksum.value);
    const expiresInSeconds = input.expiresInSeconds ?? this.config.uploadAuthorizationSeconds;
    assertAuthorizationDuration(expiresInSeconds);
    const expiresAt = new Date(this.now().getTime() + expiresInSeconds * 1_000);
    const policyDocument = {
      expiration: expiresAt.toISOString(),
      conditions: [
        ["eq", "$key", input.objectKey],
        ["content-length-range", input.contentLength, input.contentLength],
        ["eq", "$Content-Type", input.mediaType],
        ["eq", "$Content-MD5", input.expectedChecksum.value],
        ["eq", "$x-oss-forbid-overwrite", "true"],
        ["eq", "$success_action_status", "201"],
        { bucket: this.config.bucket },
        ...(this.config.stsToken ? [["eq", "$x-oss-security-token", this.config.stsToken]] : []),
      ],
    };
    const policy = Buffer.from(JSON.stringify(policyDocument), "utf8").toString("base64");
    const signature = createHmac("sha1", this.config.accessKeySecret)
      .update(policy, "utf8")
      .digest("base64");

    return {
      method: "POST",
      url: this.createBucketUrl(),
      fields: {
        key: input.objectKey,
        policy,
        OSSAccessKeyId: this.config.accessKeyId,
        Signature: signature,
        success_action_status: "201",
        "Content-Type": input.mediaType,
        "Content-MD5": input.expectedChecksum.value,
        "x-oss-forbid-overwrite": "true",
        ...(this.config.stsToken ? { "x-oss-security-token": this.config.stsToken } : {}),
      },
      expiresAt,
    };
  }

  async createDownloadAuthorization(
    input: CreateDownloadAuthorizationInput,
  ): Promise<BrowserDownloadAuthorization> {
    assertValidObjectKey(input.objectKey);
    const expiresInSeconds = input.expiresInSeconds ?? this.config.downloadAuthorizationSeconds;
    assertAuthorizationDuration(expiresInSeconds);
    // Browser GET URLs are signed by the dedicated custom-domain client when
    // configured (cname semantics, no forced-download behavior). The native
    // service client remains the fallback for attachment downloads only; the
    // caller refuses inline authorization when browserPreviewAvailable is
    // false, so this fallback never serves Preview.
    const signingClient = this.browserClient ?? this.client;
    const url = await signingClient.signatureUrlV4(
      "GET",
      expiresInSeconds,
      {
        queries: {
          "response-content-disposition": createContentDisposition(
            input.downloadFilename,
            input.disposition,
          ),
        },
      },
      input.objectKey,
    );

    return {
      method: "GET",
      url,
      expiresAt: new Date(this.now().getTime() + expiresInSeconds * 1_000),
    };
  }

  async initiateMultipartUpload(input: InitiateMultipartUploadInput): Promise<MultipartUploadHandle> {
    assertValidObjectKey(input.objectKey);
    assertMediaType(input.mediaType);
    assertBase64Md5(input.expectedChecksum.value);
    if (!this.client.initMultipartUpload) throw new Error("OSS multipart initialization is unavailable");
    const result = await this.client.initMultipartUpload(input.objectKey, {
      mime: input.mediaType,
      meta: { "ac-checksum-md5": input.expectedChecksum.value },
      headers: { "x-oss-forbid-overwrite": "true" },
    });
    try {
      assertMultipartUploadId(result.uploadId);
    } catch (error: unknown) {
      throw new Error("OSS returned an invalid multipart upload ID", { cause: error });
    }
    return { uploadId: result.uploadId };
  }

  async createMultipartPartAuthorization(
    input: CreateMultipartPartAuthorizationInput,
  ): Promise<BrowserMultipartPartAuthorization> {
    assertValidObjectKey(input.objectKey);
    assertMultipartUploadId(input.uploadId);
    assertContentLength(input.contentLength);
    assertBase64Md5(input.contentMd5);
    if (!Number.isSafeInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > 10_000) {
      throw new RangeError("invalid OSS multipart part number");
    }
    const expiresInSeconds = input.expiresInSeconds ?? this.config.uploadAuthorizationSeconds;
    assertAuthorizationDuration(expiresInSeconds);
    const headers = {
      "Content-Length": String(input.contentLength),
      "Content-MD5": input.contentMd5,
    };
    const url = await this.client.signatureUrlV4(
      "PUT",
      expiresInSeconds,
      {
        headers: { "Content-Length": input.contentLength, "Content-MD5": input.contentMd5 },
        queries: { partNumber: String(input.partNumber), uploadId: input.uploadId },
      },
      input.objectKey,
      ["Content-Length"],
    );
    return {
      method: "PUT",
      url,
      headers,
      expiresAt: new Date(this.now().getTime() + expiresInSeconds * 1_000),
    };
  }

  async listMultipartParts(input: ListMultipartPartsInput): Promise<ListMultipartPartsResult> {
    assertValidObjectKey(input.objectKey);
    assertMultipartUploadId(input.uploadId);
    if (!Number.isSafeInteger(input.partNumberMarker) || input.partNumberMarker < 0 || input.partNumberMarker > 10_000) {
      throw new RangeError("invalid OSS multipart part marker");
    }
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1_000) {
      throw new RangeError("invalid OSS multipart page size");
    }
    if (!this.client.listParts) throw new Error("OSS ListParts is unavailable");
    const result = await this.client.listParts(input.objectKey, input.uploadId, {
      "part-number-marker": input.partNumberMarker,
      "max-parts": input.limit,
    });
    const parts = (result.parts ?? []).map((part) => {
      const size = part.Size ?? part.size;
      if (!Number.isSafeInteger(part.PartNumber) || part.PartNumber < 1 || part.PartNumber > 10_000
        || !Number.isSafeInteger(size) || size! < 1 || typeof part.ETag !== "string" || !part.ETag) {
        throw new Error("OSS returned invalid multipart part metadata");
      }
      const modified = part.LastModified === undefined ? null : new Date(part.LastModified);
      return {
        partNumber: part.PartNumber,
        sizeBytes: size!,
        etag: part.ETag,
        modifiedAt: modified && !Number.isNaN(modified.getTime()) ? modified : null,
      };
    });
    if (parts.length > input.limit || new Set(parts.map((part) => part.partNumber)).size !== parts.length) {
      throw new Error("OSS returned invalid multipart part metadata");
    }
    const nextPartNumberMarker = result.isTruncated ? result.nextPartNumberMarker : null;
    if (nextPartNumberMarker !== null
      && (!Number.isSafeInteger(nextPartNumberMarker) || nextPartNumberMarker <= input.partNumberMarker
        || nextPartNumberMarker > 10_000)) {
      throw new Error("OSS returned an invalid multipart part marker");
    }
    return {
      parts,
      nextPartNumberMarker,
    };
  }

  async completeMultipartUpload(input: CompleteMultipartUploadInput): Promise<void> {
    assertValidObjectKey(input.objectKey);
    assertMultipartUploadId(input.uploadId);
    const parts = [...input.parts].sort((left, right) => left.partNumber - right.partNumber);
    if (parts.length < 1 || parts.length > 10_000
      || parts.some((part) => !Number.isSafeInteger(part.partNumber) || part.partNumber < 1
        || part.partNumber > 10_000 || !part.etag)
      || new Set(parts.map((part) => part.partNumber)).size !== parts.length) {
      throw new TypeError("invalid OSS multipart completion parts");
    }
    if (!this.client.completeMultipartUpload) throw new Error("OSS multipart completion is unavailable");
    await this.client.completeMultipartUpload(
      input.objectKey,
      input.uploadId,
      parts.map((part) => ({ number: part.partNumber, etag: part.etag })),
      { headers: { "x-oss-forbid-overwrite": "true" } },
    );
  }

  async abortMultipartUpload(input: AbortMultipartUploadInput): Promise<void> {
    assertValidObjectKey(input.objectKey);
    assertMultipartUploadId(input.uploadId);
    if (!this.client.abortMultipartUpload) throw new Error("OSS multipart abort is unavailable");
    try {
      await this.client.abortMultipartUpload(input.objectKey, input.uploadId);
    } catch (error: unknown) {
      if (!isNoSuchUpload(error)) throw error;
    }
  }

  async statObject(objectKey: string): Promise<StorageObjectMetadata | null> {
    assertValidObjectKey(objectKey);

    try {
      const result = await this.client.head(objectKey);
      const headers = asHeaderMap(result.res.headers);
      const md5 = readHeader(headers, "x-oss-meta-ac-checksum-md5") ?? readHeader(headers, "content-md5");
      const crc64 = readHeader(headers, "x-oss-hash-crc64ecma");

      return {
        objectKey,
        sizeBytes: parseNonNegativeInteger(readHeader(headers, "content-length"), "content-length"),
        etag: stripEtagQuotes(readHeader(headers, "etag")),
        checksumAlgorithm: md5 ? "md5" : crc64 ? "crc64" : null,
        checksum: md5 ?? crc64,
        mediaType: readHeader(headers, "content-type"),
        modifiedAt: parseOptionalDate(readHeader(headers, "last-modified")),
      };
    } catch (error: unknown) {
      if (isNotFound(error)) {
        return null;
      }

      throw error;
    }
  }

  async readObject(objectKey: string, maxBytes: number): Promise<Uint8Array | null> {
    assertValidObjectKey(objectKey);
    assertBoundedReadLimit(maxBytes);

    const metadata = await this.statObject(objectKey);

    if (!metadata) {
      return null;
    }

    if (metadata.sizeBytes > maxBytes) {
      throw new StorageObjectReadLimitError(objectKey, metadata.sizeBytes, maxBytes);
    }

    if (metadata.sizeBytes === 0) {
      return new Uint8Array();
    }

    let result: AliyunGetResult;

    try {
      // Ask OSS for only the bounded prefix even after HEAD.  The HEAD check
      // prevents ordinary oversized objects from being fetched, while the
      // range protects against a concurrent size change between HEAD and GET.
      result = await this.client.get(objectKey, undefined, {
        headers: { Range: `bytes=0-${maxBytes - 1}` },
      });
    } catch (error: unknown) {
      if (isNotFound(error)) {
        return null;
      }

      throw error;
    }

    const responseHeaders = asHeaderMap(result.res.headers);
    const rangeTotal = parseContentRangeTotal(responseHeaders);

    if (rangeTotal !== null && rangeTotal > maxBytes) {
      throw new StorageObjectReadLimitError(objectKey, rangeTotal, maxBytes);
    }

    const bytes = toUint8Array(result.content);

    if (!bytes) {
      throw new StorageObjectContentUnavailableError(objectKey);
    }

    if (bytes.byteLength > maxBytes) {
      throw new StorageObjectReadLimitError(objectKey, bytes.byteLength, maxBytes);
    }

    if (rangeTotal !== null && (rangeTotal !== metadata.sizeBytes || bytes.byteLength !== rangeTotal)) {
      throw new Error(`OSS object content changed or was truncated while reading: ${objectKey}`);
    }

    if (bytes.byteLength !== metadata.sizeBytes && rangeTotal === null) {
      throw new Error(`OSS object size changed while reading: ${objectKey}`);
    }

    return bytes;
  }

  async deleteObject(objectKey: string): Promise<void> {
    assertValidObjectKey(objectKey);

    try {
      await this.client.delete(objectKey);
    } catch (error: unknown) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  private createBucketUrl(): string {
    const endpoint = new URL(this.config.endpoint);

    endpoint.hostname = `${this.config.bucket}.${endpoint.hostname}`;

    return endpoint.origin;
  }
}
