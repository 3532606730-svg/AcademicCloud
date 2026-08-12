import assert from "node:assert/strict";
import test from "node:test";

import { loadAliyunOssConfig } from "../../src/storage/aliyun/config.js";
import { loadStorageAdapter } from "../../src/storage/config.js";

const validEnvironment = {
  OSS_ENDPOINT: "https://oss-cn-hangzhou.aliyuncs.com",
  OSS_REGION: "oss-cn-hangzhou",
  OSS_BUCKET: "academiccloud-private",
  OSS_ACCESS_KEY_ID: "test-access-key-id",
  OSS_ACCESS_KEY_SECRET: "test-access-key-secret",
};

test("loads validated Alibaba OSS configuration with short-lived defaults", () => {
  const config = loadAliyunOssConfig(validEnvironment, "production");

  assert.deepEqual(config, {
    endpoint: "https://oss-cn-hangzhou.aliyuncs.com",
    region: "oss-cn-hangzhou",
    bucket: "academiccloud-private",
    accessKeyId: "test-access-key-id",
    accessKeySecret: "test-access-key-secret",
    uploadAuthorizationSeconds: 300,
    downloadAuthorizationSeconds: 300,
  });
});

test("requires credentials and valid endpoint, bucket, region, and durations", () => {
  assert.throws(
    () => loadAliyunOssConfig({ ...validEnvironment, OSS_ACCESS_KEY_SECRET: "" }, "test"),
    /OSS_ACCESS_KEY_SECRET is required/,
  );
  assert.throws(
    () => loadAliyunOssConfig({ ...validEnvironment, OSS_ENDPOINT: "https://example.com/path" }, "test"),
    /exact HTTP\(S\) origin/,
  );
  assert.throws(
    () => loadAliyunOssConfig({ ...validEnvironment, OSS_BUCKET: "Invalid_Bucket" }, "test"),
    /valid DNS-compatible/,
  );
  assert.throws(
    () => loadAliyunOssConfig({ ...validEnvironment, OSS_REGION: "hangzhou" }, "test"),
    /OSS region/,
  );
  assert.throws(
    () =>
      loadAliyunOssConfig(
        { ...validEnvironment, OSS_DOWNLOAD_AUTHORIZATION_SECONDS: "901" },
        "test",
      ),
    /authorization duration/,
  );
});

test("rejects insecure production endpoints but permits explicit HTTP in tests", () => {
  const insecure = { ...validEnvironment, OSS_ENDPOINT: "http://127.0.0.1:9000" };

  assert.throws(() => loadAliyunOssConfig(insecure, "production"), /HTTPS in production/);
  assert.equal(loadAliyunOssConfig(insecure, "test").endpoint, "http://127.0.0.1:9000");
});

test("storage composition defaults to memory only outside production", () => {
  assert.equal(loadStorageAdapter({}, "test").provider, "memory");
  assert.throws(() => loadStorageAdapter({}, "production"), /aliyun-oss is required/);
  assert.equal(
    loadStorageAdapter({ ...validEnvironment, STORAGE_PROVIDER: "aliyun-oss" }, "production").provider,
    "aliyun-oss",
  );
  assert.throws(
    () => loadStorageAdapter({ STORAGE_PROVIDER: "unknown" }, "development"),
    /must be memory or aliyun-oss/,
  );
});
