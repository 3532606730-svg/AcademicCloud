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

interface RawAliyunOssClientPort {
  signatureUrlV4: AliyunOssClientPort["signatureUrlV4"];
  initMultipartUpload?: AliyunOssClientPort["initMultipartUpload"];
  listParts?(
    objectKey: string,
    uploadId: string,
    query?: Record<string, number | string>,
    options?: object,
  ): Promise<unknown>;
  completeMultipartUpload?: AliyunOssClientPort["completeMultipartUpload"];
  abortMultipartUpload?: AliyunOssClientPort["abortMultipartUpload"];
  head: AliyunOssClientPort["head"];
  get: AliyunOssClientPort["get"];
  delete: AliyunOssClientPort["delete"];
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

/**
 * Normalize only the production-observed XML scalar mismatch at the ali-oss
 * boundary. Multipart part rows remain validated by AliyunOssStorageAdapter,
 * so this incident repair does not introduce a second part-metadata parser.
 */
export function normalizeAliyunMultipartListResult(value: unknown): AliyunMultipartListResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("OSS returned an invalid multipart list response");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.parts !== undefined && !Array.isArray(candidate.parts)) {
    throw new Error("OSS returned an invalid multipart list response");
  }
  const parts = (candidate.parts ?? []) as AliyunMultipartPartRow[];
  const isTruncated = parseProviderBoolean(candidate.isTruncated, "multipart truncation flag");
  const nextPartNumberMarker = candidate.nextPartNumberMarker === undefined
    ? (isTruncated ? parseProviderInteger(undefined, "multipart part marker") : 0)
    : parseProviderInteger(candidate.nextPartNumberMarker, "multipart part marker");
  return { parts, isTruncated, nextPartNumberMarker };
}

function adaptAliyunOssClient(client: OSS): AliyunOssClientPort {
  const raw = client as unknown as RawAliyunOssClientPort;
  const initMultipartUpload = raw.initMultipartUpload?.bind(raw);
  const rawListParts = raw.listParts?.bind(raw);
  const completeMultipartUpload = raw.completeMultipartUpload?.bind(raw);
  const abortMultipartUpload = raw.abortMultipartUpload?.bind(raw);

  return {
    signatureUrlV4: raw.signatureUrlV4.bind(raw),
    ...(initMultipartUpload ? { initMultipartUpload } : {}),
    ...(rawListParts
      ? {
          listParts: async (...args: Parameters<NonNullable<AliyunOssClientPort["listParts"]>>) =>
            normalizeAliyunMultipartListResult(await rawListParts(...args)),
        }
      : {}),
    ...(completeMultipartUpload ? { completeMultipartUpload } : {}),
    ...(abortMultipartUpload ? { abortMultipartUpload } : {}),
    head: raw.head.bind(raw),
    get: raw.get.bind(raw),
    delete: raw.delete.bind(raw),
  };
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
// OSS API call continue to use the native regional bucket endpoint. Raw SDK
// ListParts scalars are normalized before they reach the storage adapter.
export function createAliyunOssClient(config: AliyunOssConfig): AliyunOssClientPort {
  return adaptAliyunOssClient(new OSS({
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
  return adaptAliyunOssClient(new OSS({
    ...baseOptions(config),
    endpoint: browserEndpoint,
    cname: true,
    secure: new URL(browserEndpoint).protocol === "https:",
  }));
}
