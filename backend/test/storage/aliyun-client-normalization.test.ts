import assert from "node:assert/strict";
import test from "node:test";

import { createAliyunOssClient, type AliyunOssClientPort } from "../../src/storage/aliyun/client.js";
import type { AliyunOssConfig } from "../../src/storage/aliyun/config.js";

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

const objectKey = "objects/aa/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const uploadId = "provider-upload-1";

type RuntimeClient = AliyunOssClientPort & {
  request: (params: unknown) => Promise<{
    data: Record<string, unknown>;
    res: { status: number; headers: object };
  }>;
};

function clientFor(rawData: Record<string, unknown>): AliyunOssClientPort {
  const client = createAliyunOssClient(config);
  const runtime = client as RuntimeClient;
  runtime.request = async () => ({ data: rawData, res: { status: 200, headers: {} } });
  return client;
}

function listParts(client: AliyunOssClientPort) {
  return client.listParts!(objectKey, uploadId, { "part-number-marker": 0, "max-parts": 1_000 });
}

test("real ali-oss ListParts normalizes the exact single-Part XML representation", async () => {
  assert.deepEqual(
    await listParts(clientFor({
      Bucket: config.bucket,
      Key: objectKey,
      UploadId: uploadId,
      PartNumberMarker: "0",
      NextPartNumberMarker: "0",
      MaxParts: "1000",
      IsTruncated: "false",
      Part: {
        PartNumber: "1",
        ETag: '"etag-1"',
        Size: "8388608",
        LastModified: "2026-08-20T10:00:00.000Z",
      },
    })),
    {
      parts: [
        {
          PartNumber: 1,
          ETag: '"etag-1"',
          Size: 8_388_608,
          LastModified: "2026-08-20T10:00:00.000Z",
        },
      ],
      isTruncated: false,
      nextPartNumberMarker: 0,
    },
  );
});

test("real ali-oss ListParts normalizes multi-Part strings and a truncated marker", async () => {
  assert.deepEqual(
    await listParts(clientFor({
      Bucket: config.bucket,
      Key: objectKey,
      UploadId: uploadId,
      PartNumberMarker: "0",
      NextPartNumberMarker: "2",
      MaxParts: "1000",
      IsTruncated: "true",
      Part: [
        { PartNumber: "1", ETag: '"etag-1"', Size: "8388608" },
        { PartNumber: "2", ETag: '"etag-2"', Size: "5" },
      ],
    })),
    {
      parts: [
        { PartNumber: 1, ETag: '"etag-1"', Size: 8_388_608 },
        { PartNumber: 2, ETag: '"etag-2"', Size: 5 },
      ],
      isTruncated: true,
      nextPartNumberMarker: 2,
    },
  );
});

test("real ali-oss ListParts allows an omitted marker only when not truncated", async () => {
  assert.deepEqual(
    await listParts(clientFor({
      Bucket: config.bucket,
      Key: objectKey,
      UploadId: uploadId,
      PartNumberMarker: "0",
      MaxParts: "1000",
      IsTruncated: "false",
    })),
    { parts: [], isTruncated: false, nextPartNumberMarker: 0 },
  );

  await assert.rejects(
    listParts(clientFor({
      Bucket: config.bucket,
      Key: objectKey,
      UploadId: uploadId,
      PartNumberMarker: "0",
      MaxParts: "1000",
      IsTruncated: "true",
    })),
    /invalid multipart part marker/u,
  );
});

test("real ali-oss ListParts rejects malformed provider values instead of guessing", async () => {
  await assert.rejects(
    listParts(clientFor({ IsTruncated: "not-a-boolean", NextPartNumberMarker: "0" })),
    /invalid multipart truncation flag/u,
  );
  await assert.rejects(
    listParts(clientFor({ IsTruncated: "false", NextPartNumberMarker: "0.5" })),
    /invalid multipart part marker/u,
  );
  await assert.rejects(
    listParts(clientFor({ IsTruncated: "false", NextPartNumberMarker: "0", Part: "invalid" })),
    /invalid multipart parts container/u,
  );
  await assert.rejects(
    listParts(clientFor({
      IsTruncated: "false",
      NextPartNumberMarker: "0",
      Part: { PartNumber: "1.5", ETag: '"etag"', Size: "5" },
    })),
    /invalid multipart part number/u,
  );
});
