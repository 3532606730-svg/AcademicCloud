import type { AppEnvironment } from "../../platform/config.js";
import { assertAuthorizationDuration } from "../authorization.js";

const BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const REGION_PATTERN = /^oss-[a-z0-9-]+$/;

export interface AliyunOssConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  stsToken?: string;
  uploadAuthorizationSeconds: number;
  downloadAuthorizationSeconds: number;
  requestTimeoutMilliseconds: number;
}

function readRequired(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for Alibaba Cloud OSS storage`);
  }

  return value;
}

function readDuration(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = environment[name]?.trim();
  const value = raw === undefined || raw === "" ? fallback : Number(raw);

  assertAuthorizationDuration(value);

  return value;
}

function readRequestTimeout(environment: NodeJS.ProcessEnv): number {
  const raw = environment.OSS_REQUEST_TIMEOUT_MILLISECONDS?.trim();
  const value = raw === undefined || raw === "" ? 30_000 : Number(raw);

  if (!Number.isSafeInteger(value) || value < 1_000 || value > 120_000) {
    throw new Error("OSS_REQUEST_TIMEOUT_MILLISECONDS must be an integer from 1000 to 120000");
  }

  return value;
}

function readEndpoint(value: string, appEnvironment: AppEnvironment): string {
  let endpoint: URL;

  try {
    endpoint = new URL(value);
  } catch {
    throw new Error("OSS_ENDPOINT must be an exact HTTP(S) origin");
  }

  if (
    (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") ||
    endpoint.origin !== value ||
    endpoint.username ||
    endpoint.password
  ) {
    throw new Error("OSS_ENDPOINT must be an exact HTTP(S) origin without credentials, path, query, or fragment");
  }

  if (appEnvironment === "production" && endpoint.protocol !== "https:") {
    throw new Error("OSS_ENDPOINT must use HTTPS in production");
  }

  return endpoint.origin;
}

export function loadAliyunOssConfig(
  environment: NodeJS.ProcessEnv,
  appEnvironment: AppEnvironment,
): AliyunOssConfig {
  const endpoint = readEndpoint(readRequired(environment, "OSS_ENDPOINT"), appEnvironment);
  const region = readRequired(environment, "OSS_REGION");
  const bucket = readRequired(environment, "OSS_BUCKET");

  if (!REGION_PATTERN.test(region)) {
    throw new Error("OSS_REGION must be an Alibaba Cloud OSS region such as oss-cn-hangzhou");
  }

  if (!BUCKET_PATTERN.test(bucket)) {
    throw new Error("OSS_BUCKET must be a valid DNS-compatible OSS bucket name");
  }

  const stsToken = environment.OSS_STS_TOKEN?.trim();

  return {
    endpoint,
    region,
    bucket,
    accessKeyId: readRequired(environment, "OSS_ACCESS_KEY_ID"),
    accessKeySecret: readRequired(environment, "OSS_ACCESS_KEY_SECRET"),
    ...(stsToken ? { stsToken } : {}),
    uploadAuthorizationSeconds: readDuration(environment, "OSS_UPLOAD_AUTHORIZATION_SECONDS", 300),
    downloadAuthorizationSeconds: readDuration(environment, "OSS_DOWNLOAD_AUTHORIZATION_SECONDS", 300),
    requestTimeoutMilliseconds: readRequestTimeout(environment),
  };
}
