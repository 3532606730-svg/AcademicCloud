import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { inflateRawSync } from "node:zlib";

import { canonicalCatalogJson, type CatalogExportRequest } from "@academiccloud/compute-contracts";

import { CatalogExportError, createCatalogEndpointPolicy } from "../src/catalog-batch-export.js";
import { createResilientCatalogEvidencePackage } from "../src/catalog-batch-resilient-export.js";
import { PdfTextInspectionError } from "../src/pdf-text.js";
import type { BoundedPdfTextSource, PdfRangeSource } from "../src/suggestion.js";

function requestDocument(lengths = [100, 101, 102]): CatalogExportRequest {
  const manifest: CatalogExportRequest["manifest"] = {
    schemaVersion: "academiccloud.catalog-batch.v1",
    batchId: "batch-resilient",
    createdAt: "2026-09-03T00:00:00.000Z",
    namingPolicyVersion: "academiccloud.filename.v1",
    evidencePolicy: {
      firstPages: 15,
      lastPages: 5,
      maxPages: 20,
      maxCharactersPerPage: 16_384,
      maxCharactersPerResource: 262_144,
      selectiveOcr: true,
      includesSourceBytes: false,
    },
    resources: lengths.map((sizeBytes, index) => ({
      resourceId: `resource-${index + 1}`,
      sourceIdentity: {
        sourceFingerprint: String.fromCharCode(97 + index).repeat(43),
        fileRevision: 1,
        checksumAlgorithm: "md5",
        checksum: "YWJjZA==",
      },
      currentFilename: `book-${index + 1}.pdf`,
      mediaType: "application/pdf" as const,
      sizeBytes,
      pageCount: null,
      evidenceFile: `resources/resource-${index + 1}.json`,
    })),
  };
  return {
    schemaVersion: "academiccloud.catalog-export-request.v1",
    manifest,
    sourceManifestSha256: createHash("sha256").update(canonicalCatalogJson(manifest), "utf8").digest("hex"),
    sourceAccess: {
      coreBaseUrl: "https://cloud.ajtlab.top",
      capabilityToken: "x".repeat(43),
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  };
}

function inspection() {
  return {
    pageCount: 1,
    pageIndices: [1],
    pages: [{
      pageIndex: 1,
      text: "书名\n作者",
      evidenceOrigin: "native_text" as const,
      ocrEngine: null,
      ocrConfidence: null,
    }],
    embeddedMetadata: { title: "书名" },
    complete: true,
    hasUsableTextLayer: true,
  };
}

class IsolatingInspector implements BoundedPdfTextSource {
  inspect(): Promise<never> { throw new Error("whole object path forbidden"); }
  async inspectRange(source: PdfRangeSource) {
    if (source.length === 101) throw new PdfTextInspectionError("invalid_pdf", "document_load");
    return inspection();
  }
  close(): void {}
}

class TypedFailureInspector implements BoundedPdfTextSource {
  inspect(): Promise<never> { throw new Error("whole object path forbidden"); }
  async inspectRange(source: PdfRangeSource) {
    if (source.length === 100) throw new CatalogExportError("source_unavailable");
    if (source.length === 101) throw new CatalogExportError("identity_mismatch");
    throw new CatalogExportError("limit_exceeded");
  }
  close(): void {}
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

const ENDPOINT_POLICY = createCatalogEndpointPolicy(
  "https://cloud.ajtlab.top",
  ["https://ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com", "https://files.ajtlab.top"],
);

test("one bad PDF is isolated while the remaining resources still produce a reviewable ZIP", async () => {
  const progress: Array<[number, number, number]> = [];
  let inspectors = 0;
  const result = await createResilientCatalogEvidencePackage({
    request: requestDocument(),
    createInspector: () => { inspectors += 1; return new IsolatingInspector(); },
    endpointPolicy: ENDPOINT_POLICY,
    onProgress: (entry) => progress.push([entry.completedResources, entry.totalResources, entry.failedResources]),
  });

  assert.equal(result.evidence.length, 3);
  assert.equal(result.failedResources.length, 1);
  assert.deepEqual(result.failedResources[0], { resourceId: "resource-2", code: "inspection_failed" });
  assert.equal(result.manifest.resources[0]?.pageCount, 1);
  assert.equal(result.manifest.resources[1]?.pageCount, null);
  assert.equal(result.manifest.resources[2]?.pageCount, 1);
  assert.deepEqual(result.evidence[1]?.inspection, { status: "failed", failureCode: "inspection_failed" });
  assert.equal(result.evidence[1]?.pages.length, 0);
  assert.equal(result.evidence[1]?.embeddedMetadata && Object.keys(result.evidence[1].embeddedMetadata).length, 0);
  assert.equal(inspectors, 2, "the parser is replaced after a resource-level failure");
  assert.deepEqual(progress, [[0, 3, 0], [1, 3, 0], [2, 3, 1], [3, 3, 1]]);

  const files = unzip(result.bytes);
  assert.deepEqual([...files.keys()], [
    "manifest.json",
    "review-contract.json",
    "resources/resource-1.json",
    "resources/resource-2.json",
    "resources/resource-3.json",
  ]);
  const contract = JSON.parse(files.get("review-contract.json")!) as any;
  assert.equal(contract.schemaVersion, "academiccloud.catalog-review-contract.v2");
  assert.deepEqual(contract.summary, { totalResources: 3, readyResources: 2, failedResources: 1 });
  assert.deepEqual(contract.failurePolicy, {
    disposition: "unknown",
    bibliographic: null,
    confidence: 0,
    inferBibliographicFactsWithoutEvidence: false,
  });
  assert.equal(Buffer.from(result.bytes).includes(Buffer.from("%PDF")), false);
});

test("source, identity and size failures remain explicit instead of collapsing the batch", async () => {
  const result = await createResilientCatalogEvidencePackage({
    request: requestDocument(),
    createInspector: () => new TypedFailureInspector(),
    endpointPolicy: ENDPOINT_POLICY,
  });
  assert.deepEqual(result.failedResources, [
    { resourceId: "resource-1", code: "source_unavailable" },
    { resourceId: "resource-2", code: "identity_mismatch" },
    { resourceId: "resource-3", code: "limit_exceeded" },
  ]);
  assert.ok(result.evidence.every((entry) => entry.inspection.status === "failed"));
  assert.ok(result.manifest.resources.every((entry) => entry.pageCount === null));
});

test("caller cancellation is global and is never converted into a partial-success package", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => createResilientCatalogEvidencePackage({
      request: requestDocument([100]),
      createInspector: () => new IsolatingInspector(),
      endpointPolicy: ENDPOINT_POLICY,
      signal: controller.signal,
    }),
    (error: unknown) => error instanceof CatalogExportError && error.code === "source_unavailable",
  );
});
