import assert from "node:assert/strict";
import { test } from "node:test";

import { loadAliyunOssConfig } from "../../src/storage/aliyun/config.js";

const BASE = {
  OSS_ENDPOINT: "https://oss-ap-southeast-3.aliyuncs.com",
  OSS_REGION: "oss-ap-southeast-3",
  OSS_BUCKET: "academiccloud-private",
  OSS_ACCESS_KEY_ID: "key-id",
  OSS_ACCESS_KEY_SECRET: "key-secret",
};

test("OSS_BROWSER_ENDPOINT is optional and omitted when absent", () => {
  const config = loadAliyunOssConfig(BASE, "production");

  assert.equal(config.browserEndpoint, undefined);
});

test("OSS_BROWSER_ENDPOINT is parsed as an exact HTTPS origin", () => {
  const config = loadAliyunOssConfig(
    { ...BASE, OSS_BROWSER_ENDPOINT: "https://files.ajtlab.top" },
    "production",
  );

  assert.equal(config.browserEndpoint, "https://files.ajtlab.top");
});

test("OSS_BROWSER_ENDPOINT rejects non-origin shapes and insecure production schemes", () => {
  assert.throws(
    () => loadAliyunOssConfig({ ...BASE, OSS_BROWSER_ENDPOINT: "files.ajtlab.top" }, "production"),
    /exact HTTP\(S\) origin/,
  );
  assert.throws(
    () => loadAliyunOssConfig({ ...BASE, OSS_BROWSER_ENDPOINT: "https://files.ajtlab.top/path" }, "production"),
    /exact HTTP\(S\) origin/,
  );
  assert.throws(
    () => loadAliyunOssConfig({ ...BASE, OSS_BROWSER_ENDPOINT: "https://user:pass@files.ajtlab.top" }, "production"),
    /exact HTTP\(S\) origin/,
  );
  assert.throws(
    () => loadAliyunOssConfig({ ...BASE, OSS_BROWSER_ENDPOINT: "http://files.ajtlab.top" }, "production"),
    /must use HTTPS in production/,
  );
});
