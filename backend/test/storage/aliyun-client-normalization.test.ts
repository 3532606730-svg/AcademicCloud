import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAliyunMultipartListResult } from "../../src/storage/aliyun/client.js";

test("normalizes ali-oss XML scalar strings in ListParts responses", () => {
  assert.deepEqual(
    normalizeAliyunMultipartListResult({
      parts: [
        {
          PartNumber: "1",
          ETag: '"etag-1"',
          Size: "8388608",
          LastModified: "2026-08-20T10:00:00.000Z",
        },
        {
          PartNumber: 2,
          ETag: '"etag-2"',
          size: "5",
        },
      ],
      isTruncated: "false",
      nextPartNumberMarker: "0",
    }),
    {
      parts: [
        {
          PartNumber: 1,
          ETag: '"etag-1"',
          Size: 8_388_608,
          LastModified: "2026-08-20T10:00:00.000Z",
        },
        {
          PartNumber: 2,
          ETag: '"etag-2"',
          Size: 5,
        },
      ],
      isTruncated: false,
      nextPartNumberMarker: 0,
    },
  );
});

test("normalizes truncated ListParts markers without relying on string truthiness", () => {
  assert.deepEqual(
    normalizeAliyunMultipartListResult({
      parts: [],
      isTruncated: "true",
      nextPartNumberMarker: "640",
    }),
    {
      parts: [],
      isTruncated: true,
      nextPartNumberMarker: 640,
    },
  );
});

test("rejects malformed ListParts provider scalars instead of guessing", () => {
  assert.throws(
    () => normalizeAliyunMultipartListResult({ parts: [], isTruncated: "not-a-boolean", nextPartNumberMarker: "0" }),
    /invalid multipart truncation flag/u,
  );
  assert.throws(
    () => normalizeAliyunMultipartListResult({ parts: [], isTruncated: "true" }),
    /invalid multipart part marker/u,
  );
  assert.throws(
    () => normalizeAliyunMultipartListResult({
      parts: [{ PartNumber: "1.5", ETag: '"etag"', Size: "5" }],
      isTruncated: "false",
      nextPartNumberMarker: "0",
    }),
    /invalid multipart part number/u,
  );
});
