import OSS from "ali-oss";

import type { AliyunOssConfig } from "./config.js";

export interface AliyunHeadResult {
  status: number;
  res: {
    headers: object;
  };
}

export interface AliyunDownloadSignRequest {
  queries?: Record<string, string>;
}

export interface AliyunOssClientPort {
  signatureUrlV4(
    method: "GET",
    expires: number,
    request: AliyunDownloadSignRequest,
    objectKey: string,
  ): Promise<string>;
  head(objectKey: string): Promise<AliyunHeadResult>;
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
  });
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
  });
}
