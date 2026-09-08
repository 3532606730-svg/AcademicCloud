import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { CanonicalMetadataService, MetadataError } from "../../src/metadata/metadata-service.js";
import type { CanonicalMetadataInput, MaterialType } from "../../src/metadata/metadata.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "metadata-owner", loginName: "metadata-owner", role: "owner" };
const MEMBER: AuthenticatedAccount = { id: "metadata-member", loginName: "metadata-member", role: "member" };

function fixture(context: TestContext) {
  const { database, persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({
    id: OWNER.id,
    loginName: OWNER.loginName,
    passwordHash: "test",
    role: OWNER.role,
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  persistence.repositories.accounts.create({
    id: MEMBER.id,
    loginName: MEMBER.loginName,
    passwordHash: "test",
    role: MEMBER.role,
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const library = persistence.repositories.libraries.findDefault()!;
  const fileId = addHolding(database, library.id, library.ownerDomainId, OWNER.id, "metadata");
  persistence.repositories.favorites.addFile(MEMBER.id, fileId, NOW);
  let id = 0;
  let tick = 0;
  const metadata = new CanonicalMetadataService(
    persistence,
    () => new Date(NOW.getTime() + tick++),
    () => `authority-${++id}`,
  );
  return { database, persistence, library, fileId, metadata };
}

function addHolding(
  database: ReturnType<typeof createTestPersistence>["database"],
  libraryId: string,
  ownerDomainId: string,
  uploaderId: string,
  prefix: string,
): string {
  const fileId = `${prefix}-file`;
  const recordId = `${prefix}-record`;
  const artifactId = `${prefix}-artifact`;
  const versionId = `${prefix}-version`;
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', 12, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(
    fileId,
    ownerDomainId,
    uploaderId,
    `${prefix} -- acquisition filename.pdf`,
    `objects/${prefix}/${"a".repeat(58)}`,
    "1B2M2Y8AsgTpgAmY7PhCfg==",
    timestamp,
    timestamp,
    timestamp,
  );
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recordId, ownerDomainId, uploaderId, `${prefix} legacy label`, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run(artifactId, ownerDomainId, recordId, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(versionId, ownerDomainId, artifactId, fileId, timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run(artifactId);
  assert.equal(database.prepare<[string], { id: string }>("SELECT id FROM libraries WHERE id = ?").get(libraryId)?.id, libraryId);
  return fileId;
}

function input(materialType: MaterialType = "book", typeFields: CanonicalMetadataInput["typeFields"] = { editionStatement: "第一版" }): CanonicalMetadataInput {
  return {
    materialType,
    canonicalTitle: "元西域人华化考",
    subtitle: "资料副题名",
    alternativeTitles: ["另一题名"],
    dateStatement: "2008",
    identifiers: [{ scheme: "isbn", value: "978-7-0000-0000-0" }],
    typeFields,
    authorityLinks: [],
  };
}

function stableRows(database: ReturnType<typeof createTestPersistence>["database"], fileId: string) {
  return {
    file: database.prepare<[string]>(`
      SELECT id, owner_domain_id, uploaded_by_account_id, display_name,
        storage_provider, object_key, media_type, size_bytes,
        checksum_algorithm, checksum, created_at, activated_at
      FROM files WHERE id = ?
    `).get(fileId),
    lineage: database.prepare<[string]>(`
      SELECT scholarly_records.id AS record_id, scholarly_records.owner_domain_id,
        scholarly_records.created_by_account_id, scholarly_records.label,
        scholarly_artifacts.id AS artifact_id, scholarly_artifacts.record_id AS artifact_record_id,
        scholarly_artifact_versions.id AS version_id,
        scholarly_artifact_versions.artifact_id AS version_artifact_id,
        scholarly_artifact_versions.stored_file_id
      FROM scholarly_artifact_versions
      JOIN scholarly_artifacts ON scholarly_artifacts.id = scholarly_artifact_versions.artifact_id
      JOIN scholarly_records ON scholarly_records.id = scholarly_artifacts.record_id
      WHERE scholarly_artifact_versions.stored_file_id = ?
    `).get(fileId),
    favorite: database.prepare<[string]>("SELECT account_id, file_id, created_at FROM favorite_files WHERE file_id = ?").get(fileId),
  };
}

test("manager canonical edits preserve physical identity, lineage, filename, provenance, and private Favorites", (context) => {
  const { database, persistence, library, fileId, metadata } = fixture(context);
  const before = stableRows(database, fileId);
  assert.equal(persistence.repositories.libraries.listHoldings(library.id, 10)[0]?.canonicalTitle, null);
  const initial = metadata.getDetails(MEMBER, library.id, fileId);
  assert.equal(initial.metadata, null);
  assert.equal(initial.displayTitle, `${fileId.replace("-file", "")} -- acquisition filename.pdf`);
  assert.equal(initial.originalFilename, initial.displayTitle);
  assert.equal(initial.canEditMetadata, false);
  assert.equal(initial.metadataVersion.length, 43);

  const author = metadata.createAuthority(OWNER, library.id, {
    type: "person",
    canonicalLabel: "陈垣",
    aliases: ["援庵"],
  });
  const language = metadata.createAuthority(OWNER, library.id, {
    type: "language",
    canonicalLabel: "中文",
    aliases: [],
  });
  const update = input();
  update.authorityLinks = [
    { authorityId: author.id, role: "author" },
    { authorityId: language.id, role: "content_language" },
  ];
  const saved = metadata.updateMetadata(OWNER, library.id, fileId, initial.metadataVersion, update);

  assert.equal(saved.displayTitle, "元西域人华化考");
  const projectedHolding = persistence.repositories.libraries.listHoldings(library.id, 10)[0];
  assert.equal(projectedHolding?.canonicalTitle, "元西域人华化考");
  assert.deepEqual(projectedHolding?.authorLabels, ["陈垣"]);
  assert.equal(saved.originalFilename, `${fileId.replace("-file", "")} -- acquisition filename.pdf`);
  assert.equal(saved.metadata?.authorityLinks[0]?.canonicalLabel, "陈垣");
  assert.equal("ownerDomainId" in (saved.metadata ?? {}), false);
  assert.equal("revision" in (saved.metadata ?? {}), false);
  assert.equal("favorites" in saved, false);
  assert.deepEqual(stableRows(database, fileId), before);
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_events WHERE action = 'libraries.metadata_update'").get()?.count, 1);

  const holding = database.prepare<[string], { canonical_title: string; display_name: string }>(`
    SELECT scholarly_record_metadata.canonical_title, files.display_name
    FROM libraries
    JOIN scholarly_records ON scholarly_records.owner_domain_id = libraries.owner_domain_id
    JOIN scholarly_record_metadata ON scholarly_record_metadata.record_id = scholarly_records.id
    JOIN scholarly_artifacts ON scholarly_artifacts.record_id = scholarly_records.id
    JOIN scholarly_artifact_versions ON scholarly_artifact_versions.artifact_id = scholarly_artifacts.id
    JOIN files ON files.id = scholarly_artifact_versions.stored_file_id
    WHERE files.id = ?
  `).get(fileId)!;
  assert.deepEqual(holding, { canonical_title: "元西域人华化考", display_name: "metadata -- acquisition filename.pdf" });
});

test("structured bibliography persists field-level human authority and exact-only person binding", (context) => {
  const { persistence, library, fileId, metadata } = fixture(context);
  const initial = metadata.getDetails(OWNER, library.id, fileId);
  assert.equal(initial.bibliography, null);
  assert.equal(initial.bibliographyVersion.length, 43);
  assert.deepEqual(initial.fieldAuthorities, []);

  const person = metadata.createAuthority(OWNER, library.id, {
    type: "person", canonicalLabel: "杉山正明", aliases: ["Sugiyama Masaaki"],
  });
  const saved = metadata.updateBibliography(OWNER, library.id, fileId, initial.bibliographyVersion, {
    materialClass: "scholarly_monograph",
    contributors: [{ label: "杉山正明", role: "author", authorityId: person.id }],
    publication: { publisher: "講談社", publicationDate: "1996" },
    language: "日本語",
    carrierEdition: {},
    sourceEdition: {},
  });
  assert.equal(saved.bibliography?.materialClass, "scholarly_monograph");
  assert.equal(saved.bibliography?.contributors[0]?.authorityId, person.id);
  assert.equal(saved.fieldAuthorities.every((entry) => entry.source === "human"), true);
  assert.equal(saved.fieldAuthorities.some((entry) => entry.fieldName === "materialClass"), true);
  assert.equal(saved.fieldAuthorities.some((entry) => entry.fieldName === "publication.publisher"), true);
  assert.equal(saved.fieldAuthorities.some((entry) => entry.fieldName === "publication.place"), false);
  assert.equal(saved.fieldAuthorities.some((entry) => entry.fieldName === "contributor.role" && entry.scopeKey.length > 0), true);
  assert.equal(metadata.findUniqueExactPersonAuthority(library.ownerDomainId, "杉山正明")?.id, person.id);
  assert.equal(metadata.findUniqueExactPersonAuthority(library.ownerDomainId, "杉山正"), null);

  metadata.createAuthority(OWNER, library.id, {
    type: "person", canonicalLabel: "別人", aliases: ["杉山正明"],
  });
  assert.equal(metadata.findUniqueExactPersonAuthority(library.ownerDomainId, "杉山正明"), null);
  const { contractVersion: _contractVersion, ...bibliographyInput } = saved.bibliography!;
  assert.throws(
    () => metadata.updateBibliography(OWNER, library.id, fileId, saved.bibliographyVersion, {
      ...bibliographyInput,
      contributors: [{ ...saved.bibliography!.contributors[0]!, label: "杉山正" }],
    }),
    (error) => error instanceof MetadataError && error.code === "not_found",
  );

  const reset = metadata.resetBibliographicFieldAuthority(
    OWNER, library.id, fileId, saved.bibliographyVersion,
    [{ fieldName: "materialClass", scopeKey: "" }, { fieldName: "contributors", scopeKey: "" }],
  );
  assert.equal(reset.fieldAuthorities.some((entry) => entry.fieldName === "materialClass"), false);
  assert.equal(reset.fieldAuthorities.some((entry) => entry.fieldName === "contributors"), false);
  assert.equal(reset.fieldAuthorities.some((entry) => entry.fieldName === "contributor.role"), true);
  assert.equal(reset.fieldAuthorities.some((entry) => entry.fieldName === "publication.publisher"), true);
  assert.equal(persistence.repositories.bibliography.findProfile(library.ownerDomainId, "metadata-record")?.materialClass, "scholarly_monograph");
});

test("metadata CAS, authority validation, and type transitions fail atomically", (context) => {
  const { database, persistence, library, fileId, metadata } = fixture(context);
  const initial = metadata.getDetails(OWNER, library.id, fileId);
  const first = metadata.updateMetadata(OWNER, library.id, fileId, initial.metadataVersion, input());
  assert.throws(
    () => metadata.updateMetadata(OWNER, library.id, fileId, initial.metadataVersion, { ...input(), canonicalTitle: "stale" }),
    (error) => error instanceof MetadataError && error.code === "concurrent_change",
  );
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).displayTitle, "元西域人华化考");

  assert.throws(
    () => metadata.updateMetadata(OWNER, library.id, fileId, first.metadataVersion, input("article", { locator: "1–10" })),
    (error) => error instanceof MetadataError && error.code === "incompatible_type_transition",
  );
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).metadata?.typeFields.editionStatement, "第一版");

  const cleared = metadata.updateMetadata(OWNER, library.id, fileId, first.metadataVersion, input("book", {}));
  const article = metadata.updateMetadata(OWNER, library.id, fileId, cleared.metadataVersion, input("article", { locator: "1–10" }));
  assert.equal(article.metadata?.materialType, "article");
  assert.deepEqual(article.metadata?.typeFields, { locator: "1–10" });

  const otherLibrary = persistence.repositories.libraries.create({
    id: "other-library",
    ownerDomainId: "library:other-library",
    name: "Other",
    isDefault: false,
    createdByAccountId: OWNER.id,
    createdAt: NOW,
    updatedAt: NOW,
  });
  persistence.repositories.libraries.createMembership({
    libraryId: otherLibrary.id,
    accountId: OWNER.id,
    role: "manager",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const foreign = metadata.createAuthority(OWNER, otherLibrary.id, { type: "person", canonicalLabel: "Foreign", aliases: [] });
  const beforeRows = database.prepare<[], { metadata: number; links: number }>(`
    SELECT
      (SELECT count(*) FROM scholarly_record_metadata) AS metadata,
      (SELECT count(*) FROM scholarly_record_authority_links) AS links
  `).get();
  assert.throws(
    () => metadata.updateMetadata(OWNER, library.id, fileId, article.metadataVersion, {
      ...input("article", { locator: "changed" }),
      canonicalTitle: "must rollback",
      authorityLinks: [{ authorityId: foreign.id, role: "author" }],
    }),
    (error) => error instanceof MetadataError && error.code === "not_found",
  );
  assert.equal(metadata.getDetails(OWNER, library.id, fileId).displayTitle, "元西域人华化考");
  assert.deepEqual(database.prepare<[], { metadata: number; links: number }>(`
    SELECT
      (SELECT count(*) FROM scholarly_record_metadata) AS metadata,
      (SELECT count(*) FROM scholarly_record_authority_links) AS links
  `).get(), beforeRows);
});

test("all five templates normalize and round-trip under the fixed contract", (context) => {
  const cases: Array<[MaterialType, CanonicalMetadataInput["typeFields"]]> = [
    ["book", { editionStatement: "  第一版  ", volumeStatement: "上册" }],
    ["article", { volumeStatement: "12", issueStatement: "3", locator: "pp. 1–20" }],
    ["manuscript", { shelfmark: "MS 1", supportStatement: "纸本", extentStatement: "20 fols.", scriptStatement: "行书" }],
    ["inscription", { objectType: "碑", materialStatement: "石", dimensionsStatement: "120 × 60 cm", scriptStatement: "隶书" }],
    ["archival_document", { documentType: "函", fondsOrCollection: "陈垣全宗", seriesStatement: "往来函件", referenceCode: "CY-1" }],
  ];
  for (const [index, [materialType, fields]] of cases.entries()) {
    const { database, library, metadata } = fixture(context);
    const fileId = index === 0 ? "metadata-file" : addHolding(database, library.id, library.ownerDomainId, OWNER.id, `template-${index}`);
    const before = metadata.getDetails(OWNER, library.id, fileId);
    const saved = metadata.updateMetadata(OWNER, library.id, fileId, before.metadataVersion, input(materialType, fields));
    assert.equal(saved.metadata?.materialType, materialType);
    assert.deepEqual(saved.metadata?.typeFields, Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value?.trim()])));
  }
});

test("Members, inactive managers, wrong Libraries, and global Owner without effective membership fail non-disclosingly", (context) => {
  const { persistence, library, fileId, metadata } = fixture(context);
  const initial = metadata.getDetails(OWNER, library.id, fileId);
  assert.throws(
    () => metadata.updateMetadata(MEMBER, library.id, fileId, initial.metadataVersion, input()),
    (error) => error instanceof MetadataError && error.code === "not_found",
  );
  assert.throws(
    () => metadata.getDetails(MEMBER, "guessed-library", fileId),
    (error) => error instanceof MetadataError && error.code === "not_found",
  );

  const isolated = persistence.repositories.libraries.create({
    id: "member-managed",
    ownerDomainId: "library:member-managed",
    name: "Member managed",
    isDefault: false,
    createdByAccountId: MEMBER.id,
    createdAt: NOW,
    updatedAt: NOW,
  });
  persistence.repositories.libraries.createMembership({
    libraryId: isolated.id,
    accountId: MEMBER.id,
    role: "manager",
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.throws(
    () => metadata.listAuthorities(OWNER, isolated.id, "person", null),
    (error) => error instanceof MetadataError && error.code === "not_found",
  );

  assert.equal(persistence.repositories.accounts.updateState(OWNER.id, "active", "disabled", NOW), true);
  assert.throws(
    () => metadata.getDetails(OWNER, library.id, fileId),
    (error) => error instanceof MetadataError && error.code === "not_found",
  );
});

test("strict validation and authority CAS reject malformed, duplicate, stale, and incompatible facts", (context) => {
  const { library, fileId, metadata } = fixture(context);
  const initial = metadata.getDetails(OWNER, library.id, fileId);
  assert.throws(
    () => metadata.updateMetadata(OWNER, library.id, fileId, initial.metadataVersion, { ...input(), canonicalTitle: "bad\nline" }),
    (error) => error instanceof MetadataError && error.code === "invalid_input",
  );
  assert.throws(
    () => metadata.updateMetadata(OWNER, library.id, fileId, initial.metadataVersion, { ...input(), alternativeTitles: ["same", "same"] }),
    (error) => error instanceof MetadataError && error.code === "invalid_input",
  );
  assert.throws(
    () => metadata.updateMetadata(OWNER, library.id, fileId, initial.metadataVersion, { ...input(), typeFields: { locator: "not a Book field" } }),
    (error) => error instanceof MetadataError && error.code === "invalid_input",
  );

  const authority = metadata.createAuthority(OWNER, library.id, { type: "person", canonicalLabel: "  陈垣  ", aliases: ["援庵"] });
  assert.equal(authority.canonicalLabel, "陈垣");
  assert.throws(
    () => metadata.createAuthority(OWNER, library.id, { type: "person", canonicalLabel: "陈垣", aliases: [] }),
    (error) => error instanceof MetadataError && error.code === "conflict",
  );
  assert.throws(
    () => metadata.createAuthority(OWNER, library.id, { type: "person", canonicalLabel: "New", aliases: ["New"] }),
    (error) => error instanceof MetadataError && error.code === "invalid_input",
  );
  const updated = metadata.updateAuthority(OWNER, library.id, authority.id, authority.version, {
    type: "person",
    canonicalLabel: "陈垣",
    aliases: ["援庵", "陈援庵"],
  });
  assert.deepEqual(updated.aliases, ["援庵", "陈援庵"]);
  assert.throws(
    () => metadata.updateAuthority(OWNER, library.id, authority.id, authority.version, {
      type: "person", canonicalLabel: "stale", aliases: [],
    }),
    (error) => error instanceof MetadataError && error.code === "concurrent_change",
  );
  assert.throws(
    () => metadata.updateMetadata(OWNER, library.id, fileId, initial.metadataVersion, {
      ...input(), authorityLinks: [{ authorityId: authority.id, role: "publisher" }],
    }),
    (error) => error instanceof MetadataError && error.code === "not_found",
  );
});
