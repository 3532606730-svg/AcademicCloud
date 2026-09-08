import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test, type TestContext } from "node:test";

import {
  CATALOG_RESULTS_SCHEMA_VERSION,
  canonicalCatalogJson,
  type CatalogBatchManifest,
  type CatalogSourceIdentity,
} from "@academiccloud/compute-contracts";

import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { CatalogBatchError, CatalogBatchService, CATALOG_PLAN_TTL_MILLISECONDS, MAX_ACTIVE_CATALOG_PLANS } from "../../src/catalog-batch/catalog-batch-service.js";
import { catalogFieldValue, CATALOG_PATCH_FIELDS } from "../../src/catalog-batch/contracts.js";
import { catalogSourceIdentity } from "../../src/drive/source-identity.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-09-01T01:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "catalog-owner", loginName: "catalog-owner", role: "owner" };
const MEMBER: AuthenticatedAccount = { id: "catalog-member", loginName: "catalog-member", role: "member" };

function md5(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("base64");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fixture(context: TestContext, now: () => Date = () => NOW) {
  const { database, persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({
    id: OWNER.id, loginName: OWNER.loginName, passwordHash: "test", role: "owner", state: "active", createdAt: NOW, updatedAt: NOW,
  });
  persistence.repositories.accounts.create({
    id: MEMBER.id, loginName: MEMBER.loginName, passwordHash: "test", role: "member", state: "active", createdAt: NOW, updatedAt: NOW,
  });
  const library = persistence.repositories.libraries.findDefault()!;
  const storage = new InMemoryStorageAdapter(() => NOW);
  let nextId = 0;
  const service = new CatalogBatchService({
    persistence, storage, coreBaseUrl: "https://academiccloud.example", now,
    createId: () => `catalog-generated-${++nextId}`,
    createToken: () => "catalog-export-capability-token-1234567890",
  });
  return { database, persistence, library, storage, service };
}

function addHolding(
  state: ReturnType<typeof fixture>,
  id: string,
  displayName: string,
  content = `%PDF-1.4\n${id}\n`,
): { resourceId: string; objectKey: string; identity: CatalogSourceIdentity } {
  const bytes = new TextEncoder().encode(content);
  const opaque = createHash("sha256").update(id).digest("hex");
  const objectKey = `objects/${opaque.slice(0, 2)}/${opaque.slice(2)}`;
  const timestamp = NOW.toISOString();
  state.database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', ?, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(id, state.library.ownerDomainId, OWNER.id, displayName, objectKey, bytes.byteLength, md5(bytes), timestamp, timestamp, timestamp);
  state.database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`record-${id}`, state.library.ownerDomainId, OWNER.id, `Record ${id}`, timestamp, timestamp);
  state.database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run(`artifact-${id}`, state.library.ownerDomainId, `record-${id}`, timestamp, timestamp);
  state.database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`version-${id}`, state.library.ownerDomainId, `artifact-${id}`, id, timestamp, timestamp);
  state.database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?")
    .run(`artifact-${id}`);
  state.storage.putObject({
    objectKey, sizeBytes: bytes.byteLength, etag: null, checksumAlgorithm: "md5", checksum: md5(bytes),
    mediaType: "application/pdf", modifiedAt: NOW,
  }, bytes);
  const file = state.persistence.repositories.files.findByDomainId(state.library.ownerDomainId, id)!;
  return { resourceId: id, objectKey, identity: catalogSourceIdentity(file) };
}

function bibliography(options: {
  title: string;
  materialClass: string;
  contributors: Array<{ label: string; role: string; roleLabel?: string }>;
  date: string;
  filenameStyle: "cjk_book" | "cjk_article" | "foreign_book";
  responsibilityStatement?: string;
  editionType?: "translated_edition";
}) {
  return {
    canonicalTitle: options.title,
    materialClass: options.materialClass,
    contributors: options.contributors,
    publication: { publicationDate: options.date },
    carrierEdition: options.editionType ? { editionType: options.editionType } : {},
    sourceEdition: {},
    filenameStyle: options.filenameStyle,
    ...(options.responsibilityStatement ? { responsibilityStatement: options.responsibilityStatement } : {}),
  };
}

async function resultsFixture(state: ReturnType<typeof fixture>) {
  const cases = [
    { id: "modern", name: "modern-old.pdf", bibliographic: bibliography({ title: "蒙元史研究", materialClass: "scholarly_monograph", contributors: [{ label: "刘晓", role: "author" }], date: "2009", filenameStyle: "cjk_book" }) },
    { id: "historical", name: "historical-old.pdf", bibliographic: bibliography({ title: "蒙古秘史", materialClass: "primary_source_modern_edition", contributors: [{ label: "余大钧", role: "annotator", roleLabel: "译注" }], date: "2005", filenameStyle: "cjk_book", responsibilityStatement: "余大钧译注" }) },
    { id: "translated", name: "translated-old.pdf", bibliographic: bibliography({
      title: "蒙古与教廷", materialClass: "scholarly_monograph",
      contributors: [{ label: "伯希和", role: "author" }, { label: "冯承钧", role: "translator", roleLabel: "译" }],
      date: "1994", filenameStyle: "cjk_book", editionType: "translated_edition",
    }) },
    { id: "multiple", name: "multiple-old.pdf", bibliographic: bibliography({ title: "某书", materialClass: "primary_source_modern_edition", contributors: [{ label: "甲", role: "collator", roleLabel: "校注" }, { label: "乙", role: "collator", roleLabel: "校注" }], date: "年份", filenameStyle: "cjk_book" }) },
    { id: "article", name: "article-old.pdf", bibliographic: bibliography({ title: "论文名", materialClass: "journal_article", contributors: [{ label: "作者", role: "author" }], date: "年份", filenameStyle: "cjk_article" }) },
    { id: "foreign", name: "foreign-old.pdf", bibliographic: bibliography({ title: "The Mongols", materialClass: "scholarly_monograph", contributors: [{ label: "David Morgan", role: "author" }], date: "2007", filenameStyle: "foreign_book" }) },
    { id: "unknown", name: "unknown-old.pdf", bibliographic: null },
    { id: "collision", name: "collision-old.pdf", bibliographic: bibliography({ title: "碰撞书", materialClass: "scholarly_monograph", contributors: [{ label: "作者", role: "author" }], date: "2020", filenameStyle: "cjk_book" }) },
  ] as const;
  for (const entry of cases) addHolding(state, entry.id, entry.name);
  addHolding(state, "collision-existing", "《碰撞书》（作者，2020）.pdf", "different-content");
  const request = await state.service.prepareExport(OWNER, state.library.id, cases.map((entry) => entry.id));
  const manifest: CatalogBatchManifest = {
    ...request.manifest,
    resources: request.manifest.resources.map((entry) => ({ ...entry, pageCount: 1 })),
  };
  const results = cases.map((entry) => {
    const source = manifest.resources.find((resource) => resource.resourceId === entry.id)!;
    return {
      resourceId: entry.id,
      sourceIdentity: source.sourceIdentity,
      disposition: entry.bibliographic === null ? "unknown" as const : "auto" as const,
      bibliographic: entry.bibliographic,
      confidence: entry.bibliographic === null ? 0 : 96,
      notes: null,
    };
  });
  const document = {
    schemaVersion: CATALOG_RESULTS_SCHEMA_VERSION,
    batchId: manifest.batchId,
    sourceManifestSha256: sha256(canonicalCatalogJson(manifest)),
    sourceManifest: manifest,
    results,
  };
  return { cases, request, document };
}

test("eight-class local roundtrip previews without mutation and applies only explicitly selected safe rows", async (context) => {
  const state = fixture(context);
  const { document } = await resultsFixture(state);
  const before = new Map<string, { displayName: string; objectKey: string; revision: number }>(document.results.map((entry) => {
    const file = state.persistence.repositories.files.findByDomainId(state.library.ownerDomainId, entry.resourceId)!;
    return [entry.resourceId, { displayName: file.displayName, objectKey: file.objectKey, revision: file.revision }];
  }));
  const auditBefore = state.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_events").get()!.count;
  const preview = state.service.preview(OWNER, state.library.id, document);
  assert.deepEqual(preview.counts, { AUTO: 0, REVIEW: 6, UNKNOWN: 1, EXCLUDED: 0, STALE: 0, COLLISION: 1, UNCHANGED: 0 });
  assert.equal(preview.items.find((entry) => entry.resourceId === "modern")?.proposedFilename, "《蒙元史研究》（刘晓，2009）.pdf");
  assert.equal(preview.items.find((entry) => entry.resourceId === "historical")?.proposedFilename, "《蒙古秘史》（余大钧译注，2005）.pdf");
  assert.equal(preview.items.find((entry) => entry.resourceId === "translated")?.proposedFilename, "《蒙古与教廷》（伯希和著、冯承钧译，1994）.pdf");
  assert.equal(preview.items.find((entry) => entry.resourceId === "multiple")?.proposedFilename, "《某书》（甲、乙校注，年份）.pdf");
  assert.equal(preview.items.find((entry) => entry.resourceId === "article")?.proposedFilename, "作者：《论文名》（年份）.pdf");
  assert.equal(preview.items.find((entry) => entry.resourceId === "foreign")?.proposedFilename, "The Mongols (David Morgan, 2007).pdf");
  assert.equal(preview.items.find((entry) => entry.resourceId === "unknown")?.renameStatus, "no_rename");
  assert.equal(preview.items.find((entry) => entry.resourceId === "collision")?.collisionStatus, "name_collision");
  for (const [resourceId, expected] of before) {
    const file = state.persistence.repositories.files.findByDomainId(state.library.ownerDomainId, resourceId)!;
    assert.deepEqual({ displayName: file.displayName, objectKey: file.objectKey, revision: file.revision }, expected);
  }
  assert.equal(state.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_events").get()!.count, auditBefore);

  // Leave the foreign-language review row unconfirmed: suggestions remain visible and
  // eligible, but never means invisible or automatic application.
  const selected = preview.items.filter((entry) => entry.category === "review" && entry.resourceId !== "foreign");
  const applied = state.service.apply(OWNER, state.library.id, preview.planId, selected.map((entry) => ({
    resourceId: entry.resourceId, previewVersion: entry.previewVersion, acknowledgeEvidence: true,
  })));
  assert.equal(applied.every((entry) => entry.status === "applied"), true);
  assert.equal(state.persistence.repositories.files.findByDomainId(state.library.ownerDomainId, "foreign")!.displayName, "foreign-old.pdf");
  assert.equal(state.persistence.repositories.files.findByDomainId(state.library.ownerDomainId, "collision")!.displayName, "collision-old.pdf");
  for (const entry of selected) {
    const file = state.persistence.repositories.files.findByDomainId(state.library.ownerDomainId, entry.resourceId)!;
    assert.equal(file.displayName, entry.proposedFilename);
    assert.equal(file.objectKey, before.get(entry.resourceId)!.objectKey);
    const holding = state.persistence.repositories.libraries.findHoldingByFile(state.library.id, entry.resourceId)!;
    const metadata = state.persistence.repositories.metadata.findMetadata(state.library.ownerDomainId, holding.recordId)!;
    assert.equal(metadata.canonicalTitle, entry.canonicalTitle);
    const authority = state.persistence.repositories.bibliography.listFieldAuthorities(state.library.ownerDomainId, holding.recordId)
      .find((field) => field.fieldName === "canonicalTitle" && field.scopeKey === "");
    assert.equal(authority?.source, "human");
    assert.equal(authority?.actorAccountId, OWNER.id);
  }
  const auditAfter = state.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_events").get()!.count;
  assert.equal(auditAfter - auditBefore, selected.length);
});

test("identity, authority and collision gates fail closed", async (context) => {
  const state = fixture(context);
  const { document } = await resultsFixture(state);
  assert.throws(() => state.service.preview(MEMBER, state.library.id, document), (error) => error instanceof CatalogBatchError && error.code === "not_found");
  const wrongContentIdentity = structuredClone(document);
  wrongContentIdentity.results[0]!.sourceIdentity.checksum = "different-checksum";
  assert.throws(
    () => state.service.preview(OWNER, state.library.id, wrongContentIdentity),
    (error) => error instanceof CatalogBatchError && error.code === "invalid_input",
  );
  const preview = state.service.preview(OWNER, state.library.id, document);
  const modern = preview.items.find((entry) => entry.resourceId === "modern")!;
  const file = state.persistence.repositories.files.findByDomainId(state.library.ownerDomainId, "modern")!;
  state.persistence.repositories.files.updateForDomain({ ...file, displayName: "changed-after-preview.pdf", updatedAt: new Date(NOW.getTime() + 1_000) }, "active", file.revision);
  assert.deepEqual(state.service.apply(OWNER, state.library.id, preview.planId, [{ resourceId: modern.resourceId, previewVersion: modern.previewVersion }]), [
    { resourceId: "modern", status: "stale", displayName: null },
  ]);
  const collision = preview.items.find((entry) => entry.resourceId === "collision")!;
  assert.deepEqual(state.service.apply(OWNER, state.library.id, preview.planId, [{ resourceId: collision.resourceId, previewVersion: collision.previewVersion }]), [
    { resourceId: "collision", status: "collision", displayName: "collision-old.pdf" },
  ]);
});

test("same-content namespace duplicates are reported exactly and never overwritten", async (context) => {
  const state = fixture(context);
  const source = addHolding(state, "duplicate-source", "source.pdf", "identical-content");
  const existing = addHolding(state, "duplicate-existing", "《重复书》（作者，2020）.pdf", "identical-content");
  const request = await state.service.prepareExport(OWNER, state.library.id, [source.resourceId]);
  const manifest: CatalogBatchManifest = {
    ...request.manifest,
    resources: request.manifest.resources.map((entry) => ({ ...entry, pageCount: 1 })),
  };
  const document = {
    schemaVersion: CATALOG_RESULTS_SCHEMA_VERSION,
    batchId: manifest.batchId,
    sourceManifestSha256: sha256(canonicalCatalogJson(manifest)),
    sourceManifest: manifest,
    results: [{
      resourceId: source.resourceId,
      sourceIdentity: source.identity,
      disposition: "auto" as const,
      bibliographic: bibliography({
        title: "重复书", materialClass: "scholarly_monograph",
        contributors: [{ label: "作者", role: "author" }], date: "2020", filenameStyle: "cjk_book",
      }),
      confidence: 99,
      notes: null,
    }],
  };
  const preview = state.service.preview(OWNER, state.library.id, document);
  const item = preview.items[0]!;
  assert.equal(item.collisionStatus, "exact_duplicate");
  assert.equal(item.category, "collision");
  assert.deepEqual(state.service.apply(OWNER, state.library.id, preview.planId, [{
    resourceId: item.resourceId, previewVersion: item.previewVersion, acknowledgeEvidence: true,
  }]), [{ resourceId: source.resourceId, status: "collision", displayName: "source.pdf" }]);
  assert.equal(state.persistence.repositories.files.findByDomainId(state.library.ownerDomainId, source.resourceId)!.objectKey, source.objectKey);
  assert.equal(state.persistence.repositories.files.findByDomainId(state.library.ownerDomainId, existing.resourceId)!.objectKey, existing.objectKey);
});

test("batch apply preserves existing type-specific canonical fields across an incompatible material-type proposal", async (context) => {
  const state = fixture(context);
  const source = addHolding(state, "typed-source", "typed.pdf");
  const holding = state.persistence.repositories.libraries.findHoldingByFile(state.library.id, source.resourceId)!;
  state.persistence.repositories.metadata.saveMetadata({
    recordId: holding.recordId,
    ownerDomainId: state.library.ownerDomainId,
    materialType: "manuscript",
    canonicalTitle: "旧题",
    alternativeTitles: [],
    identifiers: [],
    typeFields: { shelfmark: "MS 42" },
    authorityLinks: [],
    actorAccountId: OWNER.id,
    expectedRevision: null,
    now: NOW,
  });
  const request = await state.service.prepareExport(OWNER, state.library.id, [source.resourceId]);
  const manifest: CatalogBatchManifest = {
    ...request.manifest,
    resources: request.manifest.resources.map((entry) => ({ ...entry, pageCount: 1 })),
  };
  const imported = bibliography({
    title: "新题", materialClass: "scholarly_monograph",
    contributors: [{ label: "作者", role: "author" }], date: "2020", filenameStyle: "cjk_book",
  });
  const document = {
    schemaVersion: CATALOG_RESULTS_SCHEMA_VERSION,
    batchId: manifest.batchId,
    sourceManifestSha256: sha256(canonicalCatalogJson(manifest)),
    sourceManifest: manifest,
    results: [{
      resourceId: source.resourceId,
      sourceIdentity: source.identity,
      disposition: "review" as const,
      bibliographic: { ...imported, materialType: "book" as const },
      confidence: 80,
      notes: null,
    }],
  };
  const preview = state.service.preview(OWNER, state.library.id, document);
  const item = preview.items[0]!;
  assert.equal(item.category, "review");
  assert.equal(item.fields.find((field) => field.field === "materialType")?.operation, "unsupported");
  assert.deepEqual(state.service.apply(OWNER, state.library.id, preview.planId, [{
    resourceId: item.resourceId, previewVersion: item.previewVersion, acknowledgeEvidence: true,
  }]).map((entry) => entry.status), ["applied"]);
  const saved = state.persistence.repositories.metadata.findMetadata(state.library.ownerDomainId, holding.recordId)!;
  assert.equal(saved.materialType, "manuscript");
  assert.deepEqual(saved.typeFields, { shelfmark: "MS 42" });
  assert.equal(saved.canonicalTitle, "新题");
});

test("exact source-bound internal fixtures are excluded while a similarly named user document remains eligible", async (context) => {
  const state = fixture(context);
  const internal = addHolding(state, "internal-resource", "academiccloud-ai-e2e-new-20260823.pdf");
  const legitimate = addHolding(state, "legitimate-resource", "academiccloud-ai-e2e-new-20260823-user-copy.pdf", "%PDF-1.4\nlegitimate-user-content\n");
  const originalRequest = await state.service.prepareExport(OWNER, state.library.id, [internal.resourceId, legitimate.resourceId]);
  const protectedService = new CatalogBatchService({
    persistence: state.persistence,
    storage: state.storage,
    coreBaseUrl: "https://academiccloud.example",
    now: () => NOW,
    createId: () => "protected-batch",
    createToken: () => "catalog-export-capability-token-protected",
    excludedCatalogSources: [{
      resourceId: internal.resourceId,
      sourceFingerprint: internal.identity.sourceFingerprint,
      reason: "internal_test_fixture",
    }],
  });
  const filteredRequest = await protectedService.prepareExport(OWNER, state.library.id, [internal.resourceId, legitimate.resourceId]);
  assert.deepEqual(filteredRequest.manifest.resources.map((entry) => entry.resourceId), [legitimate.resourceId]);

  const manifest: CatalogBatchManifest = {
    ...originalRequest.manifest,
    resources: originalRequest.manifest.resources.map((entry) => ({ ...entry, pageCount: 1 })),
  };
  const document = {
    schemaVersion: CATALOG_RESULTS_SCHEMA_VERSION,
    batchId: manifest.batchId,
    sourceManifestSha256: sha256(canonicalCatalogJson(manifest)),
    sourceManifest: manifest,
    results: manifest.resources.map((source) => ({
      resourceId: source.resourceId,
      sourceIdentity: source.sourceIdentity,
      disposition: "auto" as const,
      bibliographic: bibliography({
        title: source.resourceId === internal.resourceId ? "Internal result" : "Legitimate result",
        materialClass: "scholarly_monograph",
        contributors: [{ label: "Author", role: "author" }],
        date: "2026",
        filenameStyle: "foreign_book",
      }),
      confidence: 99,
      notes: null,
    })),
  };
  const preview = protectedService.preview(OWNER, state.library.id, document);
  const excluded = preview.items.find((entry) => entry.resourceId === internal.resourceId)!;
  const allowed = preview.items.find((entry) => entry.resourceId === legitimate.resourceId)!;
  assert.equal(excluded.category, "excluded");
  assert.deepEqual(excluded.warnings, ["internal_test_resource_excluded"]);
  assert.deepEqual(excluded.metadataChanges, []);
  assert.equal(excluded.proposedFilename, null);
  assert.equal(allowed.category, "review");
  assert.deepEqual(preview.counts, { AUTO: 0, REVIEW: 1, UNKNOWN: 0, EXCLUDED: 1, STALE: 0, COLLISION: 0, UNCHANGED: 0 });
  assert.deepEqual(protectedService.apply(OWNER, state.library.id, preview.planId, [{
    resourceId: excluded.resourceId,
    previewVersion: excluded.previewVersion,
  }]), [{ resourceId: internal.resourceId, status: "invalid_input", displayName: null }]);
  assert.equal(state.persistence.repositories.metadata.findMetadata(state.library.ownerDomainId, `record-${internal.resourceId}`), null);
});

test("preview warns on an invalid ISBN while valid and non-ISBN identifiers remain independently applicable", async (context) => {
  const state = fixture(context);
  const source = addHolding(state, "identifier-source", "identifier-old.pdf");
  const request = await state.service.prepareExport(OWNER, state.library.id, [source.resourceId]);
  const manifest: CatalogBatchManifest = {
    ...request.manifest,
    resources: request.manifest.resources.map((entry) => ({ ...entry, pageCount: 1 })),
  };
  const imported = bibliography({
    title: "Identifier Study", materialClass: "scholarly_monograph",
    contributors: [{ label: "Researcher", role: "author" }], date: "2026", filenameStyle: "foreign_book",
  });
  const document = {
    schemaVersion: CATALOG_RESULTS_SCHEMA_VERSION,
    batchId: manifest.batchId,
    sourceManifestSha256: sha256(canonicalCatalogJson(manifest)),
    sourceManifest: manifest,
    results: [{
      resourceId: source.resourceId,
      sourceIdentity: source.identity,
      disposition: "auto" as const,
      bibliographic: {
        ...imported,
        identifiers: [
          { scheme: "isbn", value: "0-674-12337-8" },
          { scheme: "isbn", value: "978-0-306-40615-7" },
          { scheme: "doi", value: "10.1000/academiccloud" },
        ],
      },
      confidence: 96,
      notes: null,
    }],
  };
  const preview = state.service.preview(OWNER, state.library.id, document);
  const item = preview.items[0]!;
  assert.equal(item.category, "review");
  assert.deepEqual(item.warnings, ["invalid_isbn_removed", "unverified_evidence", "legacy_preserve_semantics"]);
  assert.deepEqual(state.service.apply(OWNER, state.library.id, preview.planId, [{
    resourceId: item.resourceId,
    previewVersion: item.previewVersion, acknowledgeEvidence: true,
  }]).map((entry) => entry.status), ["applied"]);
  const holding = state.persistence.repositories.libraries.findHoldingByFile(state.library.id, source.resourceId)!;
  assert.deepEqual(state.persistence.repositories.metadata.findMetadata(state.library.ownerDomainId, holding.recordId)!.identifiers, [
    { scheme: "isbn", value: "978-0-306-40615-7" },
    { scheme: "doi", value: "10.1000/academiccloud" },
  ]);
});

async function patchDocument(state: ReturnType<typeof fixture>, resourceIds: string[], patches: Array<{
  set: Record<string, unknown>; clear?: string[]; filenameStyle?: string;
}>) {
  const request = await state.service.prepareExport(OWNER, state.library.id, resourceIds);
  const manifest: CatalogBatchManifest = { ...request.manifest,
    resources: request.manifest.resources.map((entry) => ({ ...entry, pageCount: 10 })) };
  const patchesById = new Map(resourceIds.map((id, index) => [id, patches[index]!]));
  return {
    schemaVersion: "academiccloud.catalog-results.v2", batchId: manifest.batchId,
    sourceManifest: manifest, sourceManifestSha256: sha256(canonicalCatalogJson(manifest)),
    results: manifest.resources.map((source) => ({
      resourceId: source.resourceId, sourceIdentity: source.sourceIdentity, disposition: "auto",
      bibliographic: { set: patchesById.get(source.resourceId)!.set, clear: patchesById.get(source.resourceId)!.clear ?? [], filenameStyle: patchesById.get(source.resourceId)!.filenameStyle ?? "cjk_book" },
      confidence: 100, notes: null, evidence: { executionState: "ready", pages: [0] },
    })),
  };
}

function seedRichProfile(state: ReturnType<typeof fixture>, resourceId: string) {
  const recordId = `record-${resourceId}`;
  const ownerDomainId = state.library.ownerDomainId;
  const authorityId = `person-${resourceId}`;
  state.persistence.repositories.metadata.createAuthority({
    id: authorityId, ownerDomainId, type: "person", canonicalLabel: "旧责任者", aliases: ["别名"], revision: 1,
    createdByAccountId: OWNER.id, updatedByAccountId: OWNER.id, createdAt: NOW, updatedAt: NOW,
  });
  const metadata = state.persistence.repositories.metadata.saveMetadata({
    recordId, ownerDomainId, actorAccountId: OWNER.id, expectedRevision: null, now: NOW,
    materialType: "book", canonicalTitle: "旧题名", subtitle: "旧副题", alternativeTitles: ["别题"],
    dateStatement: "旧纪年", identifiers: [{ scheme: "doi", value: "10.1000/old" }],
    typeFields: { volumeStatement: "原装两册" }, authorityLinks: [{ authorityId, role: "author" }],
  })!;
  const profile = state.persistence.repositories.bibliography.saveProfile({
    recordId, ownerDomainId, actorAccountId: OWNER.id, expectedRevision: null, now: NOW,
    materialClass: "traditional_book", contributors: [{ id: `contributor-${resourceId}`, label: "旧责任者", role: "author", authorityId }],
    publication: { publisher: "旧出版社", place: "北京", publicationDate: "2000", editionNumber: "第一版", printing: "第一次" },
    series: "旧丛书", volume: "卷一", language: "zh", carrierEdition: { editionType: "facsimile", facsimileStatement: "据明刻本影印" },
    sourceEdition: { dynasty: "明", reignTitle: "万历", editionType: "engraved", holdingInformation: "原本藏书楼" },
  })!;
  for (const fieldName of ["canonicalTitle", "subtitle", "publication.publisher"] as const) state.persistence.repositories.bibliography.setFieldAuthority({
    recordId, ownerDomainId, fieldName, scopeKey: "", source: "human", actorAccountId: OWNER.id, now: NOW,
  });
  state.persistence.repositories.bibliography.setFieldAuthority({ recordId, ownerDomainId,
    fieldName: "contributor.label", scopeKey: profile.contributors[0]!.id, source: "human", actorAccountId: OWNER.id, now: NOW });
  return { metadata, profile, recordId, ownerDomainId };
}

const confirmed = (item: { resourceId: string; previewVersion: string }) => ({
  resourceId: item.resourceId, previewVersion: item.previewVersion,
  acknowledgeEvidence: true as const, acknowledgeHumanConflict: true as const, acknowledgeClear: true as const,
});

test("v2 preserves every absent field and stable contributor/authority identities, and Preview exactly matches persistence", async (context) => {
  const state = fixture(context);
  const source = addHolding(state, "preserve-all", "original.pdf");
  const before = seedRichProfile(state, source.resourceId);
  const document = await patchDocument(state, [source.resourceId], [{ set: { canonicalTitle: "更正题名" } }]);
  const preview = state.service.preview(OWNER, state.library.id, document);
  const item = preview.items[0]!;
  assert.equal(item.category, "review");
  assert.equal(item.fields.find((field) => field.field === "canonicalTitle")!.operation, "conflict");
  assert.deepEqual(item.requiresAcknowledgement, { evidence: true, humanConflict: true, clear: false });
  assert.equal(item.fields.length, CATALOG_PATCH_FIELDS.length + 3);
  for (const field of item.fields.filter((field) => !["canonicalTitle", "displayName"].includes(field.field))) {
    assert.equal(field.operation, "preserve", field.field);
    assert.deepEqual(field.proposedValue, field.currentValue, field.field);
  }
  assert.equal(state.service.apply(OWNER, state.library.id, preview.planId, [{
    resourceId: item.resourceId, previewVersion: item.previewVersion, acknowledgeEvidence: true,
  }])[0]!.status, "acknowledgement_required");
  assert.deepEqual(state.persistence.repositories.metadata.findMetadata(before.ownerDomainId, before.recordId), before.metadata);
  assert.equal(state.service.apply(OWNER, state.library.id, preview.planId, [confirmed(item)])[0]!.status, "applied");
  const savedMetadata = state.persistence.repositories.metadata.findMetadata(before.ownerDomainId, before.recordId)!;
  const savedProfile = state.persistence.repositories.bibliography.findProfile(before.ownerDomainId, before.recordId)!;
  assert.deepEqual(savedProfile, before.profile, "title-only correction must not rewrite a bibliography profile");
  const persisted = { ...savedMetadata, ...savedProfile };
  for (const field of item.fields.filter((field) => field.field !== "displayName")) {
    assert.deepEqual(catalogFieldValue(persisted, field.field) ?? null, field.proposedValue, field.field);
  }
  const savedFile = state.persistence.repositories.files.findByDomainId(before.ownerDomainId, source.resourceId)!;
  assert.equal(savedFile.objectKey, source.objectKey);
  assert.equal(savedFile.displayName, item.fields.find((field) => field.field === "displayName")!.proposedValue);
});

test("v2 explicit clear requires independent clear and human-conflict decisions, then clears only the reviewed fields", async (context) => {
  const state = fixture(context);
  const source = addHolding(state, "clear-fields", "original.pdf");
  const before = seedRichProfile(state, source.resourceId);
  const document = await patchDocument(state, [source.resourceId], [{ set: {}, clear: ["subtitle", "contributors", "publication.publisher", "sourceEdition.holdingInformation"] }]);
  const preview = state.service.preview(OWNER, state.library.id, document);
  const item = preview.items[0]!;
  assert.deepEqual(item.requiresAcknowledgement, { evidence: true, humanConflict: true, clear: true });
  assert.equal(item.fields.find((field) => field.field === "sourceEdition.holdingInformation")!.operation, "clear");
  assert.equal(item.fields.find((field) => field.field === "contributors")!.operation, "conflict");
  const { acknowledgeClear: _clear, ...withoutClear } = confirmed(item);
  assert.equal(state.service.apply(OWNER, state.library.id, preview.planId, [withoutClear])[0]!.status, "acknowledgement_required");
  assert.equal(state.service.apply(OWNER, state.library.id, preview.planId, [confirmed(item)])[0]!.status, "applied");
  const metadata = state.persistence.repositories.metadata.findMetadata(before.ownerDomainId, before.recordId)!;
  const profile = state.persistence.repositories.bibliography.findProfile(before.ownerDomainId, before.recordId)!;
  assert.equal(metadata.subtitle, undefined);
  assert.deepEqual(metadata.authorityLinks, before.metadata.authorityLinks);
  assert.deepEqual(metadata.identifiers, before.metadata.identifiers);
  assert.deepEqual(profile.contributors, []);
  assert.equal(profile.publication.publisher, undefined);
  assert.equal(profile.publication.place, "北京");
  assert.equal(profile.sourceEdition.holdingInformation, undefined);
  assert.equal(profile.sourceEdition.reignTitle, "万历");
  for (const field of item.fields.filter((field) => field.field !== "displayName")) {
    assert.deepEqual(catalogFieldValue({ ...metadata, ...profile }, field.field) ?? null, field.proposedValue, field.field);
  }
});

test("v2 source editions reach actual Preview/Apply filenames and publisher overrides verbose provenance", async (context) => {
  const state = fixture(context);
  const rows = [
    { id: "source-only", set: { canonicalTitle: "史书", materialClass: "traditional_book", "publication.publicationDate": "2000", "sourceEdition.editionType": "engraved", "sourceEdition.dynasty": "明", "sourceEdition.reignTitle": "万历" }, expected: "《史书》（明万历本，2000）.pdf" },
    { id: "publisher-first", set: { canonicalTitle: "古书", materialClass: "traditional_book", "publication.publicationDate": "2001", "publication.publisher": "中华书局", "carrierEdition.editionStatement": "北京新一版", "sourceEdition.editionStatement": "据明万历刻本影印", "sourceEdition.editionType": "engraved" }, expected: "《古书》（中华书局，2001）.pdf" },
  ];
  rows.forEach((row) => addHolding(state, row.id, `${row.id}.pdf`));
  const document = await patchDocument(state, rows.map((row) => row.id), rows.map((row) => ({ set: row.set, filenameStyle: "cjk_source" })));
  const preview = state.service.preview(OWNER, state.library.id, document);
  for (const row of rows) assert.equal(preview.items.find((item) => item.resourceId === row.id)!.proposedFilename, row.expected);
  assert.deepEqual(state.service.apply(OWNER, state.library.id, preview.planId, preview.items.map(confirmed)).map((item) => item.status), ["applied", "applied"]);
  for (const row of rows) {
    const profile = state.persistence.repositories.bibliography.findProfile(state.library.ownerDomainId, `record-${row.id}`)!;
    assert.equal(profile.sourceEdition.editionType, "engraved");
    assert.equal(state.persistence.repositories.files.findByDomainId(state.library.ownerDomainId, row.id)!.displayName, row.expected);
  }
});

test("external AUTO and confidence never bypass failed evidence; explicit human correction remains possible", async (context) => {
  const state = fixture(context);
  addHolding(state, "failed-extraction", "failed.pdf");
  const document = await patchDocument(state, ["failed-extraction"], [{ set: { canonicalTitle: "人工核对的题名" } }]);
  document.results[0]!.evidence = { executionState: "failed", pages: [] };
  document.results[0]!.confidence = 0;
  const preview = state.service.preview(OWNER, state.library.id, document);
  const item = preview.items[0]!;
  assert.equal(item.disposition, "auto");
  assert.equal(item.category, "review");
  assert.equal(item.evidence.state, "failed");
  assert.equal(item.confidence, 0);
  assert.equal(state.service.apply(OWNER, state.library.id, preview.planId, [{ resourceId: item.resourceId, previewVersion: item.previewVersion }])[0]!.status, "acknowledgement_required");
  assert.equal(state.service.apply(OWNER, state.library.id, preview.planId, [confirmed(item)])[0]!.status, "applied");
  assert.equal(state.persistence.repositories.bibliography.listFieldAuthorities(state.library.ownerDomainId, "record-failed-extraction")
    .find((field) => field.fieldName === "canonicalTitle")!.source, "human");
});

test("plans are immutable, expire and evict predictably, reject unauthorized actors, and require a new Preview after restart", async (context) => {
  let now = NOW;
  const state = fixture(context, () => now);
  addHolding(state, "plan-lifecycle", "before.pdf");
  const document = await patchDocument(state, ["plan-lifecycle"], [{ set: { canonicalTitle: "Verified title" }, filenameStyle: "preserve_original" }]);
  const preview = state.service.preview(OWNER, state.library.id, document);
  const originalSelection = confirmed(preview.items[0]!);
  preview.items[0]!.fields.find((field) => field.field === "canonicalTitle")!.proposedValue = "tampered";
  preview.items[0]!.canonicalTitle = "tampered";
  assert.throws(() => state.service.apply(MEMBER, state.library.id, preview.planId, [originalSelection]), (error) => error instanceof CatalogBatchError && error.code === "not_found");
  const freshService = new CatalogBatchService({ persistence: state.persistence, storage: state.storage, coreBaseUrl: "https://academiccloud.example" });
  assert.throws(() => freshService.apply(OWNER, state.library.id, preview.planId, [originalSelection]), (error) => error instanceof CatalogBatchError && error.code === "plan_expired");
  assert.equal(state.service.apply(OWNER, state.library.id, preview.planId, [originalSelection])[0]!.status, "applied");
  assert.equal(state.persistence.repositories.metadata.findMetadata(state.library.ownerDomainId, "record-plan-lifecycle")!.canonicalTitle, "Verified title");
  const replay = state.service.apply(OWNER, state.library.id, preview.planId, [originalSelection])[0]!;
  assert.equal(replay.status, "applied");
  assert.equal(replay.replayed, true);
  now = new Date(NOW.getTime() + CATALOG_PLAN_TTL_MILLISECONDS);
  assert.throws(() => state.service.apply(OWNER, state.library.id, preview.planId, [originalSelection]), (error) => error instanceof CatalogBatchError && error.code === "plan_expired");
  const first = state.service.preview(OWNER, state.library.id, document);
  for (let index = 0; index < MAX_ACTIVE_CATALOG_PLANS; index++) state.service.preview(OWNER, state.library.id, document);
  assert.throws(() => state.service.apply(OWNER, state.library.id, first.planId, [confirmed(first.items[0]!)]), (error) => error instanceof CatalogBatchError && error.code === "plan_expired");
});

test("Apply revalidates only selected rows, rolls back a failed item, and retries successful items without another write", async (context) => {
  const state = fixture(context);
  const ids = Array.from({ length: 12 }, (_, index) => `partial-${index}`);
  ids.forEach((id) => addHolding(state, id, `${id}.pdf`));
  const document = await patchDocument(state, ids, ids.map((id) => ({ set: { canonicalTitle: `Title ${id}` } })));
  const preview = state.service.preview(OWNER, state.library.id, document);
  const repository = state.persistence.repositories.metadata;
  const save = repository.saveMetadata.bind(repository);
  let saves = 0;
  context.mock.method(repository, "saveMetadata", (...args: Parameters<typeof save>) => { saves++; return save(...args); });
  const read = repository.findMetadata.bind(repository);
  let reads = 0;
  context.mock.method(repository, "findMetadata", (...args: Parameters<typeof read>) => { reads++; return read(...args); });
  state.database.exec(`CREATE TRIGGER synthetic_item_failure BEFORE INSERT ON scholarly_bibliographic_profiles
    WHEN NEW.record_id = 'record-partial-1' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`);
  const selections = preview.items.slice(0, 3).map(confirmed);
  const auditCount = () => state.database.prepare<[], { n: number }>("SELECT count(*) AS n FROM governance_audit_events").get()!.n;
  const auditBefore = auditCount();
  const result = state.service.apply(OWNER, state.library.id, preview.planId, selections);
  assert.deepEqual(result.map((item) => item.status), ["applied", "conflict", "applied"]);
  assert.equal(saves, 3);
  assert.ok(reads <= selections.length * 3, `bounded selected-row revalidation; reads=${reads}`);
  assert.equal(repository.findMetadata(state.library.ownerDomainId, "record-partial-1"), null, "metadata write rolled back with bibliography failure");
  assert.equal(auditCount() - auditBefore, 2);
  state.database.exec("DROP TRIGGER synthetic_item_failure");
  const retry = state.service.apply(OWNER, state.library.id, preview.planId, selections);
  assert.deepEqual(retry.map((item) => [item.status, Boolean(item.replayed)]), [["applied", true], ["applied", false], ["applied", true]]);
  assert.equal(saves, 4);
  assert.equal(auditCount() - auditBefore, 3);
});

test("authority-only changes after Preview invalidate the plan even if the displayed values and revisions remain unchanged", async (context) => {
  const state = fixture(context);
  addHolding(state, "authority-race", "before.pdf");
  const document = await patchDocument(state, ["authority-race"], [{ set: { canonicalTitle: "Proposed" } }]);
  const preview = state.service.preview(OWNER, state.library.id, document);
  state.persistence.repositories.bibliography.setFieldAuthority({
    recordId: "record-authority-race", ownerDomainId: state.library.ownerDomainId, fieldName: "canonicalTitle", scopeKey: "",
    source: "human", actorAccountId: OWNER.id, now: NOW,
  });
  assert.equal(state.service.apply(OWNER, state.library.id, preview.planId, preview.items.map(confirmed))[0]!.status, "stale");
  assert.equal(state.persistence.repositories.metadata.findMetadata(state.library.ownerDomainId, "record-authority-race"), null);
});
