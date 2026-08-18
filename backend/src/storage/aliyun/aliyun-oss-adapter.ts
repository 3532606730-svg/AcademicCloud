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
  BrowserDownloadAuthorization,
  BrowserUploadAuthorization,
  CreateDownloadAuthorizationInput,
  CreateUploadAuthorizationInput,
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

  async statObject(objectKey: string): Promise<StorageObjectMetadata | null> {
    assertValidObjectKey(objectKey);

    try {
      const result = await this.client.head(objectKey);
      const headers = asHeaderMap(result.res.headers);
      const md5 = readHeader(headers, "content-md5");
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
