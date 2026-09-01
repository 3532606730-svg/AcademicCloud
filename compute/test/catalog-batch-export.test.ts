import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";

import { canonicalCatalogJson, type CatalogExportRequest } from "@academiccloud/compute-contracts";

import { createCatalogEvidencePackage, parseCatalogExportRequest } from "../src/catalog-batch-export.js";
import type { BoundedPdfTextSource, PdfRangeSource, SuggestionLimits } from "../src/suggestion.js";

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
