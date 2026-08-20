import OSS from "ali-oss";

import type { AliyunOssConfig } from "./config.js";

export interface AliyunHeadResult {
  status: number;
  res: {
    headers: object;
  };
}

export interface AliyunGetObjectOptions {
  headers?: Record<string, string>;
}

export interface AliyunGetResult {
  content?: unknown;
  res: {
    status?: number;
    headers: object;
  };
}

export interface AliyunDownloadSignRequest {
  headers?: Record<string, string | number>;
  queries?: Record<string, string>;
}

export interface AliyunMultipartInitResult { uploadId: string; }
export interface AliyunMultipartPartRow {
  PartNumber: number;
  ETag: string;
  Size?: number;
  size?: number;
  LastModified?: string | Date;
}
export interface AliyunMultipartListResult {
  parts: AliyunMultipartPartRow[];
  isTruncated: boolean;
  nextPartNumberMarker: number;
}

export interface AliyunOssClientPort {
  signatureUrlV4(
    method: "GET" | "PUT",
    expires: number,
    request: AliyunDownloadSignRequest,
    objectKey: string,
    additionalHeaders?: string[],
  ): Promise<string>;
  initMultipartUpload?(objectKey: string, options?: object): Promise<AliyunMultipartInitResult>;
  listParts?(
    objectKey: string,
    uploadId: string,
    query?: Record<string, number | string>,
    options?: object,
  ): Promise<AliyunMultipartListResult>;
  completeMultipartUpload?(
    objectKey: string,
    uploadId: string,
    parts: Array<{ number: number; etag: string }>,
    options?: object,
  ): Promise<unknown>;
  abortMultipartUpload?(objectKey: string, uploadId: string, options?: object): Promise<unknown>;
  head(objectKey: string): Promise<AliyunHeadResult>;
  get(objectKey: string, file?: unknown, options?: AliyunGetObjectOptions): Promise<AliyunGetResult>;
  delete(objectKey: string): Promise<unknown>;
}

interface RawAliyunListPartsPort {
  listParts?(
    objectKey: string,
    uploadId: string,
    query?: Record<string, number | string>,
    options?: object,
  ): Promise<unknown>;
}

function parseProviderInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/u.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new Error(`OSS returned an invalid ${fieldName}`);
}

function parseProviderBoolean(value: unknown, fieldName: string): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  throw new Error(`OSS returned an invalid ${fieldName}`);
}

function asRawMultipartParts(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return [value];
  throw new Error("OSS returned an invalid multipart parts container");
}

function normalizeMultipartPart(value: unknown): AliyunMultipartPartRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("OSS returned invalid multipart part metadata");
  }
  const candidate = value as Record<string, unknown>;
  const partNumber = parseProviderInteger(candidate.PartNumber, "multipart part number");
  const size = parseProviderInteger(candidate.Size ?? candidate.size, "multipart part size");
  const etag = candidate.ETag;
  const lastModified = candidate.LastModified;

  if (
    typeof etag !== "string"
    || etag.length === 0
    || (lastModified !== undefined && typeof lastModified !== "string" && !(lastModified instanceof Date))
  ) {
    throw new Error("OSS returned invalid multipart part metadata");
  }

  return {
    PartNumber: partNumber,
    ETag: etag,
    Size: size,
    ...(lastModified === undefined ? {} : { LastModified: lastModified }),
  };
}

/**
 * ali-oss 6.23.0 returns ListParts XML values without normalizing them:
 * booleans/integers remain strings, and a single <Part> is an object rather
 * than an array. Normalize that exact SDK boundary before business/storage
 * code sees the response; AliyunOssStorageAdapter still owns range/count/order
 * validation for the canonical values.
 */
export function normalizeAliyunMultipartListResult(value: unknown): AliyunMultipartListResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("OSS returned an invalid multipart list response");
  }
  const candidate = value as Record<string, unknown>;
  const parts = asRawMultipartParts(candidate.parts).map(normalizeMultipartPart);
  const isTruncated = parseProviderBoolean(candidate.isTruncated, "multipart truncation flag");
  const nextPartNumberMarker = candidate.nextPartNumberMarker === undefined
    ? (isTruncated ? parseProviderInteger(undefined, "multipart part marker") : 0)
    : parseProviderInteger(candidate.nextPartNumberMarker, "multipart part marker");
  return { parts, isTruncated, nextPartNumberMarker };
}

function normalizeNativeListParts(client: OSS): AliyunOssClientPort {
  const canonical = client as unknown as AliyunOssClientPort;
  const raw = client as unknown as RawAliyunListPartsPort;
  const listParts = raw.listParts?.bind(client);

  if (listParts) {
    canonical.listParts = async (...args: Parameters<NonNullable<AliyunOssClientPort["listParts"]>>) =>
      normalizeAliyunMultipartListResult(await listParts(...args));
  }

  return canonical;
}

function baseOptions(config: AliyunOssConfig) {
  return {
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    ...(config.stsToken ? { stsToken: config.stsToken } : {}),
    authorizationV4: true,
    timeout: config.requestTimeoutMilliseconds,
  };
}

// Native OSS service client: HEAD/stat, DeleteObject, and every server-side
// OSS API call continue to use the native regional bucket endpoint. Only the
// runtime ListParts response shape is normalized before the client is exposed.
export function createAliyunOssClient(config: AliyunOssConfig): AliyunOssClientPort {
  return normalizeNativeListParts(new OSS({
    ...baseOptions(config),
    endpoint: config.endpoint,
    secure: new URL(config.endpoint).protocol === "https:",
  }));
}

// Browser GET signing client: a dedicated OSS custom domain mapped to the
// same private bucket. With cname=true the SDK does NOT prefix the bucket to
// the host, so signed URLs are https://<custom-domain>/<objectKey>. Used ONLY
// for generated browser GET URLs (download + inline preview); backend
// HEAD/Delete never pass through this path.
export function createAliyunBrowserClient(
  config: AliyunOssConfig,
  browserEndpoint: string,
): AliyunOssClientPort {
  return new OSS({
    ...baseOptions(config),
    endpoint: browserEndpoint,
    cname: true,
    secure: new URL(browserEndpoint).protocol === "https:",
  }) as unknown as AliyunOssClientPort;
}
