import OSS from "ali-oss";

import type { AliyunOssConfig } from "./config.js";

export interface AliyunHeadResult {
  status: number;
  res: {
    headers: object;
  };
}

export interface AliyunOssClientPort {
  signatureUrlV4(
    method: "GET",
    expires: number,
    request: { queries: Record<string, string> },
    objectKey: string,
  ): Promise<string>;
  head(objectKey: string): Promise<AliyunHeadResult>;
  delete(objectKey: string): Promise<unknown>;
}

export function createAliyunOssClient(config: AliyunOssConfig): AliyunOssClientPort {
  return new OSS({
    region: config.region,
    endpoint: config.endpoint,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    ...(config.stsToken ? { stsToken: config.stsToken } : {}),
    secure: new URL(config.endpoint).protocol === "https:",
    authorizationV4: true,
    timeout: config.requestTimeoutMilliseconds,
  });
}
