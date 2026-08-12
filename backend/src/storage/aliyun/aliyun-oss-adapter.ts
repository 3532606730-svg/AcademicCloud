import { createHmac } from "node:crypto";

import {
  assertAuthorizationDuration,
  assertContentLength,
  assertMediaType,
  createContentDisposition,
} from "../authorization.js";
import { assertValidObjectKey } from "../object-key.js";
import type {
  BrowserDownloadAuthorization,
  BrowserUploadAuthorization,
  CreateDownloadAuthorizationInput,
  CreateUploadAuthorizationInput,
  StorageAdapter,
  StorageObjectMetadata,
} from "../storage-adapter.js";
import type { AliyunOssClientPort } from "./client.js";
import { createAliyunOssClient } from "./client.js";
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

export class AliyunOssStorageAdapter implements StorageAdapter {
  readonly provider = "aliyun-oss";

  constructor(
    private readonly config: AliyunOssConfig,
    private readonly client: AliyunOssClientPort = createAliyunOssClient(config),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createUploadAuthorization(
    input: CreateUploadAuthorizationInput,
  ): Promise<BrowserUploadAuthorization> {
    assertValidObjectKey(input.objectKey);
    assertContentLength(input.contentLength);
    assertMediaType(input.mediaType);
    const expiresInSeconds = input.expiresInSeconds ?? this.config.uploadAuthorizationSeconds;
    assertAuthorizationDuration(expiresInSeconds);
    const expiresAt = new Date(this.now().getTime() + expiresInSeconds * 1_000);
    const policyDocument = {
      expiration: expiresAt.toISOString(),
      conditions: [
        ["eq", "$key", input.objectKey],
        ["content-length-range", input.contentLength, input.contentLength],
        ["eq", "$Content-Type", input.mediaType],
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
    const url = await this.client.signatureUrlV4(
      "GET",
      expiresInSeconds,
      {
        queries: {
          "response-content-disposition": createContentDisposition(input.downloadFilename),
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
