import type { AppEnvironment } from "../platform/config.js";
import { AliyunOssStorageAdapter } from "./aliyun/aliyun-oss-adapter.js";
import { loadAliyunOssConfig } from "./aliyun/config.js";
import { InMemoryStorageAdapter } from "./in-memory-storage-adapter.js";
import type { StorageAdapter } from "./storage-adapter.js";

export function loadStorageAdapter(
  environment: NodeJS.ProcessEnv,
  appEnvironment: AppEnvironment,
): StorageAdapter {
  const provider = environment.STORAGE_PROVIDER?.trim() || (appEnvironment === "production" ? "" : "memory");

  if (provider === "memory" && appEnvironment !== "production") {
    return new InMemoryStorageAdapter();
  }

  if (provider === "aliyun-oss") {
    return new AliyunOssStorageAdapter(loadAliyunOssConfig(environment, appEnvironment));
  }

  throw new Error(
    appEnvironment === "production"
      ? "STORAGE_PROVIDER=aliyun-oss is required in production"
      : "STORAGE_PROVIDER must be memory or aliyun-oss",
  );
}
