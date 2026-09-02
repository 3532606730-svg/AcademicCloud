import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";

import { canonicalCatalogJson, type CatalogExportRequest } from "@academiccloud/compute-contracts";

import {
  CatalogExportError,
  createCatalogEvidencePackage,
  parseCatalogExportRequest,
  stagedPdfFallbackPolicy,
} from "../src/catalog-batch-export.js";
import { PdfTextInspectionError } from "../src/pdf-text.js";
import { SUGGESTION_LIMITS, type BoundedPdfTextSource, type PdfRangeSource, type SuggestionLimits } from "../src/suggestion.js";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function request(): CatalogExportRequest {
  const manifest = {
    schemaVersion: "academiccloud.catalog-batch.v1" as const,
    batchId: "batch-fixture",
    createdAt: "2026-09-01T00:00:00.000Z",
    namingPolicyVersion: "academiccloud.filename.v1" as const,
    evidencePolicy: { firstPages: 15, lastPages: 5, maxPages: 20, maxCharactersPerPage: 16384, maxCharactersPerResource: 262144, selectiveOcr: true as const, includesSourceBytes: false as const },
    resources: [{
      resourceId: "resource-fixture",
      sourceIdentity: { sourceFingerprint: "a".repeat(43), fileRevision: 0, checksumAlgorithm: "md5", checksum: "YWNhZGVtaWNjbG91ZA==" },
      currentFilename: "fixture.pdf", mediaType: "application/pdf" as const, sizeBytes: 100, pageCount: null,
      evidenceFile: "resources/resource-fixture.json",
    }],
  };
  return {
    schemaVersion: "academiccloud.catalog-export-request.v1",
    manifest,
    sourceManifestSha256: sha256(canonicalCatalogJson(manifest)),
    sourceAccess: { coreBaseUrl: "https://academiccloud.example", capabilityToken: "x".repeat(43), expiresAt: "2099-01-01T00:00:00.000Z" },
  };
}

function requestForSource(bytes: Uint8Array, checksum?: string): CatalogExportRequest {
  const value = request();
  value.manifest.resources[0]!.sizeBytes = bytes.byteLength;
  value.manifest.resources[0]!.sourceIdentity.checksumAlgorithm = "md5";
  value.manifest.resources[0]!.sourceIdentity.checksum = checksum ?? createHash("md5").update(bytes).digest("base64");
  value.sourceManifestSha256 = sha256(canonicalCatalogJson(value.manifest));
  return value;
}

function inspectionFixture() {
  return {
    pageCount: 120,
    pageIndices: [1, 2],
    pages: [
      { pageIndex: 1, text: "学术书名\n作者", evidenceOrigin: "native_text" as const, ocrEngine: null, ocrConfidence: null },
      { pageIndex: 2, text: "出版者 2026", evidenceOrigin: "ocr" as const, ocrEngine: "PaddleOCR", ocrConfidence: 92 },
    ],
    embeddedMetadata: { title: "学术书名" },
    complete: true,
    hasUsableTextLayer: true,
  };
}

function unzip(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  const result = new Map<string, string>();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const pathLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const pathStart = offset + 30;
    const dataStart = pathStart + pathLength + extraLength;
    const path = buffer.subarray(pathStart, pathStart + pathLength).toString("utf8");
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    result.set(path, (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8"));
    offset = dataStart + compressedSize;
  }
  return result;
}

class FixtureInspector implements BoundedPdfTextSource {
  inspect(_bytes: Uint8Array, _limits: Readonly<SuggestionLimits>): Promise<never> { throw new Error("whole object path forbidden"); }
  async inspectRange(source: PdfRangeSource) {
    assert.equal(source.length, 100);
    return inspectionFixture();
  }
}

class StagedFallbackInspector implements BoundedPdfTextSource {
  readonly failure: PdfTextInspectionError;
  rangeCalls = 0;
  fileCalls = 0;
  stagedPath: string | undefined;
  stagedBytes: Uint8Array | undefined;

  constructor(failure = new PdfTextInspectionError("timeout", "document_load")) {
    this.failure = failure;
  }

  inspect(): Promise<never> { throw new Error("whole object path forbidden"); }

  async inspectRange(source: PdfRangeSource): Promise<never> {
    this.rangeCalls += 1;
    await source.read(0, Math.min(5, source.length));
    throw this.failure;
  }

  async inspectFile(path: string, length: number) {
    this.fileCalls += 1;
    this.stagedPath = path;
    this.stagedBytes = await readFile(path);
    assert.equal(this.stagedBytes.byteLength, length);
    return inspectionFixture();
  }
}

async function withMockedCatalogSource<T>(
  bytes: Uint8Array,
  operation: (rangeSizes: number[]) => Promise<T>,
): Promise<T> {
  const previous = globalThis.fetch;
  const rangeSizes: number[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/api/catalog-batches/")) {
      return Response.json({
        source: {
          method: "GET",
          url: "https://objects.example/catalog-fixture.pdf",
          expiresAt: "2099-01-01T00:00:00.000Z",
          sizeBytes: bytes.byteLength,
          mediaType: "application/pdf",
        },
      });
    }
    const range = new Headers(init?.headers).get("range")?.match(/^bytes=(\d+)-(\d+)$/u);
    assert.ok(range);
    const begin = Number(range[1]);
    const inclusiveEnd = Number(range[2]);
    const chunk = bytes.slice(begin, inclusiveEnd + 1);
    rangeSizes.push(chunk.byteLength);
    return new Response(chunk, {
      status: 206,
      headers: { "content-range": `bytes ${begin}-${inclusiveEnd}/${bytes.byteLength}` },
    });
  };
  try {
    return await operation(rangeSizes);
  } finally {
    globalThis.fetch = previous;
  }
}

test("bounded exporter creates manifest plus native/OCR evidence only, without PDF or image bytes", async () => {
  const parsed = parseCatalogExportRequest(request());
  const output = await createCatalogEvidencePackage({ request: parsed, inspector: new FixtureInspector() });
  assert.equal(output.filename, "academiccloud-catalog-batch-batch-fixture.zip");
  assert.equal(output.manifest.resources[0]?.pageCount, 120);
  assert.deepEqual(output.evidence[0]?.pages.map((entry) => entry.evidenceOrigin), ["native_text", "ocr"]);
  const files = unzip(output.bytes);
  assert.deepEqual([...files.keys()], ["manifest.json", "review-contract.json", "resources/resource-fixture.json"]);
  assert.equal(JSON.parse(files.get("manifest.json")!).resources[0].pageCount, 120);
  assert.equal(JSON.parse(files.get("resources/resource-fixture.json")!).pages[1].ocrConfidence, 92);
  assert.equal(JSON.parse(files.get("review-contract.json")!).sourceManifestSha256, sha256(canonicalCatalogJson(output.manifest)));
  assert.equal(Buffer.from(output.bytes).includes(Buffer.from("%PDF")), false);
  assert.equal([...files.keys()].some((path) => /\.(?:pdf|png|jpe?g)$/iu.test(path)), false);
  assert.deepEqual(output.fallbackResourceIds, []);
});

test("staged fallback keeps the diagnosed 922 MB resource inside the unchanged one-GiB envelope", () => {
  const policy = stagedPdfFallbackPolicy(922_469_003);
  assert.equal(policy.maximumBytes, 1024 * 1024 * 1024);
  assert.equal(policy.chunkBytes, 1024 * 1024);
  assert.throws(
    () => stagedPdfFallbackPolicy(SUGGESTION_LIMITS.maxPdfJsBufferBytes + 1),
    (error: unknown) => error instanceof CatalogExportError && error.code === "limit_exceeded",
  );
});

test("eligible range timeout uses an identity-verified bounded temporary file and removes it", async () => {
  const bytes = new TextEncoder().encode(`%PDF-1.7\n${"bounded".repeat(200_000)}\n%%EOF`);
  const inspector = new StagedFallbackInspector();
  const output = await withMockedCatalogSource(bytes, async (rangeSizes) => {
    const result = await createCatalogEvidencePackage({ request: requestForSource(bytes), inspector });
    assert.ok(rangeSizes.every((size) => size <= 1024 * 1024));
    return result;
  });
  assert.deepEqual(output.fallbackResourceIds, ["resource-fixture"]);
  assert.equal(inspector.rangeCalls, 1);
  assert.equal(inspector.fileCalls, 1);
  assert.equal(Buffer.compare(Buffer.from(inspector.stagedBytes!), Buffer.from(bytes)), 0);
  assert.ok(inspector.stagedPath);
  assert.equal(existsSync(inspector.stagedPath!), false);
  assert.equal(existsSync(dirname(inspector.stagedPath!)), false);
});

test("staged fallback is unavailable to corrupt content and identity mismatches", async () => {
  const corrupt = new TextEncoder().encode("not a PDF despite a range timeout");
  const corruptInspector = new StagedFallbackInspector();
  await assert.rejects(
    () => withMockedCatalogSource(corrupt, () => createCatalogEvidencePackage({
      request: requestForSource(corrupt),
      inspector: corruptInspector,
    })),
    (error: unknown) => error instanceof CatalogExportError && error.code === "inspection_failed",
  );
  assert.equal(corruptInspector.fileCalls, 0);

  const valid = new TextEncoder().encode("%PDF-1.7\nvalid bounded identity fixture\n%%EOF");
  const mismatchInspector = new StagedFallbackInspector();
  await assert.rejects(
    () => withMockedCatalogSource(valid, () => createCatalogEvidencePackage({
      request: requestForSource(valid, createHash("md5").update("different").digest("base64")),
      inspector: mismatchInspector,
    })),
    (error: unknown) => error instanceof CatalogExportError && error.code === "identity_mismatch",
  );
  assert.equal(mismatchInspector.fileCalls, 0);
});

test("non-range parser and OCR failures never activate staged fallback", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nvalid fixture\n%%EOF");
  const inspector = new StagedFallbackInspector(new PdfTextInspectionError("render_failure", "render"));
  await assert.rejects(
    () => withMockedCatalogSource(bytes, async (rangeSizes) => {
      await createCatalogEvidencePackage({ request: requestForSource(bytes), inspector });
      assert.fail("expected the render failure to stay terminal");
      return rangeSizes;
    }),
    (error: unknown) => error instanceof CatalogExportError && error.code === "inspection_failed",
  );
  assert.equal(inspector.fileCalls, 0);
});

test("export request parser rejects traversal, oversized batches and changed manifest identity", () => {
  const traversal = request() as unknown as Record<string, any>;
  traversal.manifest.resources[0].evidenceFile = "../fixture.json";
  traversal.sourceManifestSha256 = sha256(canonicalCatalogJson(traversal.manifest));
  assert.throws(() => parseCatalogExportRequest(traversal));

  const changed = request() as unknown as Record<string, any>;
  changed.manifest.resources[0].currentFilename = "changed.pdf";
  assert.throws(() => parseCatalogExportRequest(changed));

  const tooMany = request() as unknown as Record<string, any>;
  tooMany.manifest.resources = Array.from({ length: 501 }, (_, index) => ({ ...tooMany.manifest.resources[0], resourceId: `resource-${index}`, evidenceFile: `resources/resource-${index}.json` }));
  tooMany.sourceManifestSha256 = sha256(canonicalCatalogJson(tooMany.manifest));
  assert.throws(() => parseCatalogExportRequest(tooMany));

  const malformedIdentity = request() as unknown as Record<string, any>;
  malformedIdentity.manifest.resources[0].sourceIdentity.checksumAlgorithm = { value: "md5" };
  malformedIdentity.manifest.resources[0].sourceIdentity.checksum = { value: "checksum" };
  malformedIdentity.sourceManifestSha256 = sha256(canonicalCatalogJson(malformedIdentity.manifest));
  assert.throws(() => parseCatalogExportRequest(malformedIdentity));
});
