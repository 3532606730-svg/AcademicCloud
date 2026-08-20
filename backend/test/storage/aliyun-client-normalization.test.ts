import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAliyunMultipartListResult } from "../../src/storage/aliyun/client.js";

test("normalizes production-observed ali-oss ListParts scalar strings", () => {
  const parts = [
    {
      PartNumber: 1,
      ETag: '"etag-1"',
      Size: 8_388_608,
      LastModified: "2026-08-20T10:00:00.000Z",
    },
  ];

  assert.deepEqual(
    normalizeAliyunMultipartListResult({
      parts,
      isTruncated: "false",
      nextPartNumberMarker: "0",
    }),
    {
      parts,
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

test("rejects malformed ListParts provider scalars instead of guessing", () => {
  assert.throws(
    () => normalizeAliyunMultipartListResult({ parts: [], isTruncated: "not-a-boolean", nextPartNumberMarker: "0" }),
    /invalid multipart truncation flag/u,
  );
  assert.throws(
    () => normalizeAliyunMultipartListResult({ parts: [], isTruncated: "false", nextPartNumberMarker: "0.5" }),
    /invalid multipart part marker/u,
  );
  assert.throws(
    () => normalizeAliyunMultipartListResult({ parts: {}, isTruncated: "false", nextPartNumberMarker: "0" }),
    /invalid multipart list response/u,
  );
});
