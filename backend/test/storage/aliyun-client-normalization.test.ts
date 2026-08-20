import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAliyunMultipartListResult } from "../../src/storage/aliyun/client.js";

test("normalizes the exact single-Part ali-oss 6.23.0 XML shape", () => {
  assert.deepEqual(
    normalizeAliyunMultipartListResult({
      parts: {
        PartNumber: "1",
        ETag: '"etag-1"',
        Size: "8388608",
        LastModified: "2026-08-20T10:00:00.000Z",
      },
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
      ],
      isTruncated: false,
      nextPartNumberMarker: 0,
    },
  );
});

test("normalizes multi-Part string scalars and truncated markers", () => {
  assert.deepEqual(
    normalizeAliyunMultipartListResult({
      parts: [
        { PartNumber: "1", ETag: '"etag-1"', Size: "8388608" },
        { PartNumber: "2", ETag: '"etag-2"', Size: "5" },
      ],
      isTruncated: "true",
      nextPartNumberMarker: "2",
    }),
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

test("allows an omitted marker only for a non-truncated response", () => {
  assert.deepEqual(
    normalizeAliyunMultipartListResult({ parts: [], isTruncated: "false" }),
    { parts: [], isTruncated: false, nextPartNumberMarker: 0 },
  );
  assert.throws(
    () => normalizeAliyunMultipartListResult({ parts: [], isTruncated: "true" }),
    /invalid multipart part marker/u,
  );
});

test("rejects malformed ListParts provider values instead of guessing", () => {
  assert.throws(
    () => normalizeAliyunMultipartListResult({ parts: [], isTruncated: "not-a-boolean", nextPartNumberMarker: "0" }),
    /invalid multipart truncation flag/u,
  );
  assert.throws(
    () => normalizeAliyunMultipartListResult({ parts: [], isTruncated: "false", nextPartNumberMarker: "0.5" }),
    /invalid multipart part marker/u,
  );
  assert.throws(
    () => normalizeAliyunMultipartListResult({ parts: "invalid", isTruncated: "false", nextPartNumberMarker: "0" }),
    /invalid multipart parts container/u,
  );
  assert.throws(
    () => normalizeAliyunMultipartListResult({
      parts: { PartNumber: "1.5", ETag: '"etag"', Size: "5" },
      isTruncated: "false",
      nextPartNumberMarker: "0",
    }),
    /invalid multipart part number/u,
  );
});
