import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCatalogResultsDocument } from "../../src/catalog-batch/contracts.js";

function validDocument() {
  const identity = { sourceFingerprint: "a".repeat(43), fileRevision: 0, checksumAlgorithm: "md5", checksum: "YWNhZGVtaWNjbG91ZA==" };
  const manifest = {
    schemaVersion: "academiccloud.catalog-batch.v1",
    batchId: "batch-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    namingPolicyVersion: "academiccloud.filename.v1",
    evidencePolicy: { firstPages: 15, lastPages: 5, maxPages: 20, maxCharactersPerPage: 16384, maxCharactersPerResource: 262144, selectiveOcr: true, includesSourceBytes: false },
    resources: [{ resourceId: "resource-1", sourceIdentity: identity, currentFilename: "old.pdf", mediaType: "application/pdf", sizeBytes: 10, pageCount: 1, evidenceFile: "resources/resource-1.json" }],
  };
  return {
    schemaVersion: "academiccloud.catalog-results.v1",
    batchId: "batch-1",
    sourceManifestSha256: "b".repeat(64),
    sourceManifest: manifest,
    results: [{
      resourceId: "resource-1", sourceIdentity: identity, disposition: "review",
      bibliographic: {
        canonicalTitle: "书名", materialClass: "scholarly_monograph",
        contributors: [{ label: "作者", role: "author" }], publication: { publicationDate: "2026" },
        carrierEdition: {}, sourceEdition: {}, filenameStyle: "cjk_book",
      },
      confidence: 80, notes: null,
    }],
  };
}

test("strict results contract accepts the existing canonical bibliography shape", () => {
  assert.equal(parseCatalogResultsDocument(validDocument()).results[0]?.bibliographic?.canonicalTitle, "书名");
});

test("catalog import preserves valid ISBNs, drops bad checksums with a warning, and leaves other schemes untouched", () => {
  const cases = [
    { value: "0-306-40615-2", valid: true },
    { value: "0-674-12337-8", valid: false },
    { value: "978-0-306-40615-7", valid: true },
    { value: "978-0-306-40615-8", valid: false },
  ] as const;
  for (const entry of cases) {
    const document = validDocument();
    (document.results[0]!.bibliographic as typeof document.results[0]["bibliographic"] & { identifiers: Array<{ scheme: string; value: string }> }).identifiers = [
      { scheme: "isbn", value: entry.value },
    ];
    const parsed = parseCatalogResultsDocument(document).results[0]!.bibliographic!;
    assert.deepEqual(parsed.identifiers, entry.valid ? [{ scheme: "isbn", value: entry.value }] : []);
    assert.deepEqual(parsed.importWarnings, entry.valid ? [] : [{ code: "invalid_isbn_removed", count: 1 }]);
  }

  const mixed = validDocument();
  (mixed.results[0]!.bibliographic as typeof mixed.results[0]["bibliographic"] & { identifiers: Array<{ scheme: string; value: string }> }).identifiers = [
    { scheme: "isbn", value: "0-674-12337-8" },
    { scheme: "isbn", value: "978-0-306-40615-7" },
    { scheme: "doi", value: "10.1000/academiccloud" },
  ];
  const parsed = parseCatalogResultsDocument(mixed).results[0]!.bibliographic!;
  assert.deepEqual(parsed.identifiers, [
    { scheme: "isbn", value: "978-0-306-40615-7" },
    { scheme: "doi", value: "10.1000/academiccloud" },
  ]);
  assert.deepEqual(parsed.importWarnings, [{ code: "invalid_isbn_removed", count: 1 }]);
});

test("strict results contract rejects duplicate IDs, path traversal, unknown dispositions, oversized text and identity mismatch shapes", () => {
  const duplicate = validDocument();
  duplicate.sourceManifest.resources.push({ ...duplicate.sourceManifest.resources[0]! });
  duplicate.results.push({ ...duplicate.results[0]! });
  assert.throws(() => parseCatalogResultsDocument(duplicate));

  const traversal = validDocument();
  traversal.sourceManifest.resources[0]!.evidenceFile = "../resource-1.json";
  assert.throws(() => parseCatalogResultsDocument(traversal));

  const disposition = validDocument();
  disposition.results[0]!.disposition = "automatic";
  assert.throws(() => parseCatalogResultsDocument(disposition));

  const oversized = validDocument();
  oversized.results[0]!.bibliographic!.canonicalTitle = "x".repeat(513);
  assert.throws(() => parseCatalogResultsDocument(oversized));

  const wrongBatch = validDocument();
  wrongBatch.batchId = "batch-2";
  assert.throws(() => parseCatalogResultsDocument(wrongBatch));

  const extra = validDocument() as ReturnType<typeof validDocument> & { script?: string };
  extra.script = "alert(1)";
  assert.throws(() => parseCatalogResultsDocument(extra));
});

test("v2 distinguishes absent fields from clears and rejects ambiguous or privileged external replacements", () => {
  const base = validDocument();
  const document = { ...base, schemaVersion: "academiccloud.catalog-results.v2", results: [{
    ...base.results[0]!, bibliographic: { set: { canonicalTitle: "保留其他字段" }, clear: ["subtitle"], filenameStyle: "preserve_original" },
    evidence: { executionState: "ready", pages: [0] },
  }] };
  const parsed = parseCatalogResultsDocument(document).results[0]!;
  assert.deepEqual(parsed.bibliographic!.patch, { set: { canonicalTitle: "保留其他字段" }, clear: ["subtitle"] });
  assert.equal(parsed.evidence!.state, "unverified");
  assert.equal(parsed.legacy, false);
  const invalidPatches = [
    { set: { subtitle: null }, clear: [] },
    { set: { alternativeTitles: [] }, clear: [] },
    { set: { subtitle: "" }, clear: [] },
    { set: { contributors: [{ id: "internal-id", label: "Name", role: "author" }] }, clear: [] },
    { set: { contributors: [{ authorityId: "internal-authority", label: "Name", role: "author" }] }, clear: [] },
    { set: { authorityLinks: [] }, clear: [] },
    { set: { "publication.publisher": "Publisher" }, clear: ["publication.publisher"] },
    { set: {}, clear: ["canonicalTitle"] },
    { set: {}, clear: ["materialClass"] },
    { set: {}, clear: ["typeFields"] },
    { set: {}, clear: ["subtitle", "subtitle"] },
  ];
  for (const patch of invalidPatches) assert.throws(() => parseCatalogResultsDocument({ ...document, results: [{
    ...document.results[0], bibliographic: { ...patch, filenameStyle: "preserve_original" },
  }] }), JSON.stringify(patch));
  for (const evidence of [{ executionState: "failed", pages: [0] }, { executionState: "verified", pages: [0] },
    { executionState: "ready", pages: [-1] }, { executionState: "ready", pages: [0, 0] }, { executionState: "ready", pages: [0], attested: true }]) {
    assert.throws(() => parseCatalogResultsDocument({ ...document, results: [{ ...document.results[0], evidence }] }));
  }
  assert.throws(() => parseCatalogResultsDocument({ ...document, results: [{ ...document.results[0], disposition: "unknown" }] }));
  assert.equal(parseCatalogResultsDocument({ ...document, results: [{ ...document.results[0], disposition: "unknown", bibliographic: null }] }).results[0]!.bibliographic, null);
});

test("legacy null and empty arrays never silently clear existing values", () => {
  const document = validDocument();
  const result = document.results[0]!;
  const parsed = parseCatalogResultsDocument({ ...document, results: [{ ...result, bibliographic: {
    ...result.bibliographic, subtitle: null, alternativeTitles: [], identifiers: [], contributors: [],
  } }] }).results[0]!;
  assert.equal(parsed.legacy, true);
  assert.deepEqual(parsed.bibliographic!.patch!.clear, []);
  for (const field of ["subtitle", "alternativeTitles", "identifiers", "contributors"]) assert.equal(Object.hasOwn(parsed.bibliographic!.patch!.set, field), false);
});

test("evidence page references respect the exact source page count and unknown lengths remain unverified", () => {
  const base = validDocument();
  const document = { ...base, schemaVersion: "academiccloud.catalog-results.v2", results: [{
    ...base.results[0]!, bibliographic: { set: {}, clear: [], filenameStyle: "preserve_original" },
    evidence: { executionState: "ready", pages: [0] },
  }] };
  assert.deepEqual(parseCatalogResultsDocument(document).results[0]!.evidence!.pages, [0]);
  for (const pages of [[1], [999], [0, 1]]) {
    assert.throws(() => parseCatalogResultsDocument({ ...document, results: [{ ...document.results[0], evidence: { executionState: "ready", pages } }] }));
  }
  const unknown = { ...document, sourceManifest: { ...document.sourceManifest,
    resources: [{ ...document.sourceManifest.resources[0], pageCount: null }],
  } };
  assert.equal(parseCatalogResultsDocument(unknown).results[0]!.evidence!.state, "unverified");
});
