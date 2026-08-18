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
// OSS API call continue to use the native regional bucket endpoint.
export function createAliyunOssClient(config: AliyunOssConfig): AliyunOssClientPort {
  return new OSS({
    ...baseOptions(config),
    endpoint: config.endpoint,
    secure: new URL(config.endpoint).protocol === "https:",
  }) as unknown as AliyunOssClientPort;
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
