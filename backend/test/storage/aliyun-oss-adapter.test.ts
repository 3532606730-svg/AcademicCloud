import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { AliyunOssStorageAdapter } from "../../src/storage/aliyun/aliyun-oss-adapter.js";
import {
  createAliyunOssClient,
  type AliyunOssClientPort,
} from "../../src/storage/aliyun/client.js";
import type { AliyunOssConfig } from "../../src/storage/aliyun/config.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createObjectKey } from "../../src/storage/object-key.js";

const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

const config: AliyunOssConfig = {
  endpoint: "https://oss-cn-hangzhou.aliyuncs.com",
  region: "oss-cn-hangzhou",
  bucket: "academiccloud-private",
  accessKeyId: "test-access-key-id",
  accessKeySecret: "test-access-key-secret",
  uploadAuthorizationSeconds: 300,
  downloadAuthorizationSeconds: 120,
  requestTimeoutMilliseconds: 30_000,
};

class FakeAliyunClient implements AliyunOssClientPort {
  headResult: Awaited<ReturnType<AliyunOssClientPort["head"]>> = {
    status: 200,
    res: { headers: {} },
  };
  headError: unknown;
  deleteError: unknown;
  readonly signatureCalls: Array<{
    method: "GET";
    expires: number;
    request: { queries: Record<string, string> };
    objectKey: string;
  }> = [];
  readonly deleteCalls: string[] = [];

  async signatureUrlV4(
    method: "GET",
    expires: number,
    request: { queries: Record<string, string> },
    objectKey: string,
  ): Promise<string> {
    this.signatureCalls.push({ method, expires, request, objectKey });
    return `https://signed.invalid/${objectKey}`;
  }

  async head(): Promise<Awaited<ReturnType<AliyunOssClientPort["head"]>>> {
    if (this.headError) {
      throw this.headError;
    }

    return this.headResult;
  }

  async delete(objectKey: string): Promise<void> {
    this.deleteCalls.push(objectKey);

    if (this.deleteError) {
      throw this.deleteError;
    }
  }
}

function decodePolicy(policy: string): {
  expiration: string;
  conditions: unknown[];
} {
  return JSON.parse(Buffer.from(policy, "base64").toString("utf8")) as {
    expiration: string;
    conditions: unknown[];
  };
}

test("POST authorization is exact-key, exact-size, media-type restricted, and signed", async () => {
  const client = new FakeAliyunClient();
  const now = new Date("2026-08-12T08:00:00.000Z");
  const adapter = new AliyunOssStorageAdapter(config, client, () => now);
  const objectKey = createObjectKey();
  const authorization = await adapter.createUploadAuthorization({
    objectKey,
    contentLength: 12_345,
    mediaType: "application/pdf",
    expectedChecksum: { algorithm: "md5", value: MD5 },
  });
  const policy = decodePolicy(authorization.fields.policy!);

  assert.equal(authorization.method, "POST");
  assert.equal(authorization.url, "https://academiccloud-private.oss-cn-hangzhou.aliyuncs.com");
  assert.equal(authorization.expiresAt.toISOString(), "2026-08-12T08:05:00.000Z");
  assert.deepEqual(policy.conditions, [
    ["eq", "$key", objectKey],
    ["content-length-range", 12_345, 12_345],
    ["eq", "$Content-Type", "application/pdf"],
    ["eq", "$Content-MD5", MD5],
    ["eq", "$x-oss-forbid-overwrite", "true"],
    ["eq", "$success_action_status", "201"],
    { bucket: "academiccloud-private" },
  ]);
  assert.equal(authorization.fields.key, objectKey);
  assert.equal(authorization.fields["Content-Type"], "application/pdf");
  assert.equal(authorization.fields["Content-MD5"], MD5);
  assert.equal(authorization.fields["x-oss-forbid-overwrite"], "true");
  assert.equal(
    authorization.fields.Signature,
    createHmac("sha1", config.accessKeySecret).update(authorization.fields.policy!, "utf8").digest("base64"),
  );
});

test("temporary credentials are bound into the POST policy and fields", async () => {
  const adapter = new AliyunOssStorageAdapter(
    { ...config, stsToken: "temporary-token" },
    new FakeAliyunClient(),
  );
  const authorization = await adapter.createUploadAuthorization({
    objectKey: createObjectKey(),
    contentLength: 1,
    mediaType: "text/plain",
    expectedChecksum: { algorithm: "md5", value: MD5 },
  });

  assert.equal(authorization.fields["x-oss-security-token"], "temporary-token");
  assert.deepEqual(decodePolicy(authorization.fields.policy!).conditions.at(-1), [
    "eq",
    "$x-oss-security-token",
    "temporary-token",
  ]);
});

test("download authorization delegates only the exact key and a safe filename", async () => {
  const client = new FakeAliyunClient();
  const adapter = new AliyunOssStorageAdapter(config, client, () => new Date("2026-08-12T08:00:00Z"));
  const objectKey = createObjectKey();
  const authorization = await adapter.createDownloadAuthorization({
    objectKey,
    downloadFilename: "史料汇编.pdf",
  });

  assert.equal(authorization.url, `https://signed.invalid/${objectKey}`);
  assert.equal(authorization.expiresAt.toISOString(), "2026-08-12T08:02:00.000Z");
  assert.deepEqual(client.signatureCalls, [
    {
      method: "GET",
      expires: 120,
      objectKey,
      request: {
        queries: {
          "response-content-disposition": 'attachment; filename="____.pdf"; filename*=UTF-8\'\'%E5%8F%B2%E6%96%99%E6%B1%87%E7%BC%96.pdf',
        },
      },
    },
  ]);
});

test("real SDK client produces a V4 signed URL without performing network I/O", async () => {
  const objectKey = createObjectKey();
  const client = createAliyunOssClient(config);
  const signedUrl = new URL(
    await client.signatureUrlV4(
      "GET",
      120,
      { queries: { "response-content-disposition": "attachment" } },
      objectKey,
    ),
  );

  assert.equal(signedUrl.protocol, "https:");
  assert.equal(signedUrl.hostname, "academiccloud-private.oss-cn-hangzhou.aliyuncs.com");
  assert.equal(signedUrl.searchParams.get("x-oss-signature-version"), "OSS4-HMAC-SHA256");
  assert.equal(signedUrl.searchParams.get("x-oss-expires"), "120");
  assert.equal(signedUrl.searchParams.get("response-content-disposition"), "attachment");
  assert.equal(signedUrl.searchParams.has("OSSAccessKeyId"), false);
});

test("metadata lookup normalizes provider headers and treats missing objects as absent", async () => {
  const client = new FakeAliyunClient();
  const adapter = new AliyunOssStorageAdapter(config, client);
  const objectKey = createObjectKey();
  client.headResult = {
    status: 200,
    res: {
      headers: {
        "Content-Length": "4096",
        ETag: '"etag-value"',
        "Content-MD5": "base64-md5",
        "Content-Type": "application/pdf",
        "Last-Modified": "Wed, 12 Aug 2026 08:00:00 GMT",
      },
    },
  };

  assert.deepEqual(await adapter.statObject(objectKey), {
    objectKey,
    sizeBytes: 4096,
    etag: "etag-value",
    checksumAlgorithm: "md5",
    checksum: "base64-md5",
    mediaType: "application/pdf",
    modifiedAt: new Date("2026-08-12T08:00:00.000Z"),
  });

  client.headError = { status: 404, code: "NoSuchKey" };
  assert.equal(await adapter.statObject(objectKey), null);
});

test("delete is exact-key and idempotent while other provider failures propagate", async () => {
  const client = new FakeAliyunClient();
  const adapter = new AliyunOssStorageAdapter(config, client);
  const objectKey = createObjectKey();

  await adapter.deleteObject(objectKey);
  client.deleteError = { statusCode: 404 };
  await adapter.deleteObject(objectKey);
  assert.deepEqual(client.deleteCalls, [objectKey, objectKey]);

  client.deleteError = new Error("provider unavailable");
  await assert.rejects(adapter.deleteObject(objectKey), /provider unavailable/);
});

test("in-memory adapter supplies deterministic contract behavior without network access", async () => {
  const objectKey = createObjectKey();
  const adapter = new InMemoryStorageAdapter(() => new Date("2026-08-12T08:00:00Z"));
  const metadata = {
    objectKey,
    sizeBytes: 5,
    etag: "etag",
    checksumAlgorithm: "md5" as const,
    checksum: "checksum",
    mediaType: "text/plain",
    modifiedAt: new Date("2026-08-12T07:59:00Z"),
  };

  adapter.putObject(metadata);
  assert.deepEqual(await adapter.statObject(objectKey), metadata);
  await adapter.deleteObject(objectKey);
  await adapter.deleteObject(objectKey);
  assert.equal(await adapter.statObject(objectKey), null);
});
