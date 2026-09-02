import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { canonicalCatalogJson } from "@academiccloud/compute-contracts";

import { correctReviewedCatalogResults } from "../../src/catalog-batch/reviewed-results.js";
import { CATALOG_INTERNAL_SOURCE_EXCLUSIONS } from "../../src/catalog-batch/internal-resource-exclusions.js";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("reviewed-result correction preserves identities while excluding exact fixtures and filtering only invalid ISBNs", () => {
  const excluded = CATALOG_INTERNAL_SOURCE_EXCLUSIONS[0]!;
  const identities = [
    { sourceFingerprint: excluded.sourceFingerprint, fileRevision: 1, checksumAlgorithm: "md5", checksum: "YWNhZGVtaWNjbG91ZA==" },
    { sourceFingerprint: "z".repeat(43), fileRevision: 2, checksumAlgorithm: "sha256", checksum: "safe-checksum" },
  ];
  const manifest = {
    schemaVersion: "academiccloud.catalog-batch.v1",
    batchId: "batch-correction",
    createdAt: "2026-09-02T00:00:00.000Z",
    namingPolicyVersion: "academiccloud.filename.v1",
    evidencePolicy: { firstPages: 15, lastPages: 5, maxPages: 20, maxCharactersPerPage: 16384, maxCharactersPerResource: 262144, selectiveOcr: true, includesSourceBytes: false },
    resources: [
      { resourceId: excluded.resourceId, sourceIdentity: identities[0], currentFilename: "internal.pdf", mediaType: "application/pdf", sizeBytes: 10, pageCount: 1, evidenceFile: `resources/${excluded.resourceId}.json` },
      { resourceId: "legitimate", sourceIdentity: identities[1], currentFilename: "legitimate.pdf", mediaType: "application/pdf", sizeBytes: 20, pageCount: 2, evidenceFile: "resources/legitimate.json" },
    ],
  } as const;
  const bibliography = {
    canonicalTitle: "Legitimate Book", materialClass: "scholarly_monograph",
    contributors: [{ label: "Author", role: "author" }], publication: { publicationDate: "2026" },
    carrierEdition: {}, sourceEdition: {}, filenameStyle: "foreign_book",
  };
  const document = {
    schemaVersion: "academiccloud.catalog-results.v1",
    batchId: manifest.batchId,
    sourceManifestSha256: sha256(canonicalCatalogJson(manifest)),
    sourceManifest: manifest,
    results: [
      { resourceId: excluded.resourceId, sourceIdentity: identities[0], disposition: "auto", bibliographic: bibliography, confidence: 99, notes: null },
      {
        resourceId: "legitimate", sourceIdentity: identities[1], disposition: "auto",
        bibliographic: {
          ...bibliography,
          identifiers: [
            { scheme: "isbn", value: "0-674-12337-8" },
            { scheme: "isbn", value: "978-0-306-40615-7" },
            { scheme: "doi", value: "10.1000/academiccloud" },
          ],
        },
        confidence: 96, notes: null,
      },
    ],
  };
  const before = structuredClone(document);
  const corrected = correctReviewedCatalogResults(document);
  assert.deepEqual(document, before);
  assert.deepEqual(corrected.report, {
    inputResults: 2,
    fixturesExcluded: [excluded.resourceId],
    invalidIdentifiersRemoved: 1,
    dispositions: { AUTO: 1, REVIEW: 0, UNKNOWN: 1 },
  });
  assert.equal(corrected.document.batchId, document.batchId);
  assert.equal(corrected.document.sourceManifestSha256, document.sourceManifestSha256);
  assert.deepEqual(corrected.document.sourceManifest, document.sourceManifest);
  const results = corrected.document.results as Array<Record<string, unknown>>;
  assert.deepEqual(results[0], {
    ...document.results[0], disposition: "unknown", bibliographic: null, confidence: 0,
  });
  assert.deepEqual((results[1]!.bibliographic as typeof bibliography & { identifiers: Array<{ scheme: string; value: string }> }).identifiers, [
    { scheme: "isbn", value: "978-0-306-40615-7" },
    { scheme: "doi", value: "10.1000/academiccloud" },
  ]);
});
