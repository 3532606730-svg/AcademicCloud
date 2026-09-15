import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { driveEntryVersion } from "../../src/drive/bulk.js";
import { LibraryError, LibraryService } from "../../src/library/library-service.js";
import { CanonicalMetadataService } from "../../src/metadata/metadata-service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "owner-s", loginName: "owner-s", role: "owner" };
const MEMBER: AuthenticatedAccount = { id: "member-s", loginName: "member-s", role: "member" };
const OUTSIDER: AuthenticatedAccount = { id: "outsider-s", loginName: "outsider-s", role: "member" };

function fixture(context: TestContext) {
  const { database, persistence } = createTestPersistence(context);
  for (const account of [
    { id: OWNER.id, loginName: OWNER.loginName, role: OWNER.role },
    { id: MEMBER.id, loginName: MEMBER.loginName, role: MEMBER.role },
    { id: OUTSIDER.id, loginName: OUTSIDER.loginName, role: OUTSIDER.role },
  ]) {
    persistence.repositories.accounts.create({
      id: account.id,
      loginName: account.loginName,
      passwordHash: "test",
      role: account.role,
      state: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  const storage = new InMemoryStorageAdapter(() => NOW);
  const drive = new DriveService(persistence, storage, () => NOW);
  const libraries = new LibraryService(persistence, drive, () => NOW, (() => {
    let next = 0;
    return () => `library-search-${++next}`;
  })());
  let authorityId = 0;
  const metadata = new CanonicalMetadataService(persistence, () => NOW, () => `search-authority-${++authorityId}`);
  return { database, persistence, libraries, metadata };
}

function addHolding(database: ReturnType<typeof fixture>["database"], ownerDomainId: string, suffix: string, displayName: string): string {
  const fileId = `search-file-${suffix}`;
  const recordId = `search-record-${suffix}`;
  const artifactId = `search-artifact-${suffix}`;
  const versionId = `search-version-${suffix}`;
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', 12, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(fileId, ownerDomainId, OWNER.id, displayName, `objects/${suffix.slice(0, 2)}/${"c".repeat(62)}`, "YWNhZGVtaWNjb3Vk", timestamp, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recordId, ownerDomainId, OWNER.id, displayName, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run(artifactId, ownerDomainId, recordId, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(versionId, ownerDomainId, artifactId, fileId, timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run(artifactId);
  return fileId;
}

function setMetadata(
  metadata: ReturnType<typeof fixture>["metadata"],
  libraryId: string,
  fileId: string,
  value: { canonicalTitle: string; authorLabel?: string; publisherLabel?: string; dateStatement?: string; identifier?: string },
): void {
  const links: Array<{ authorityId: string; role: string }> = [];
  if (value.authorLabel) {
    const author = metadata.createAuthority(OWNER, libraryId, { type: "person", canonicalLabel: value.authorLabel, aliases: [] });
    links.push({ authorityId: author.id, role: "author" });
  }
  if (value.publisherLabel) {
    const publisher = metadata.createAuthority(OWNER, libraryId, { type: "institution", canonicalLabel: value.publisherLabel, aliases: [] });
    links.push({ authorityId: publisher.id, role: "publisher" });
  }
  const current = metadata.getDetails(OWNER, libraryId, fileId);
  metadata.updateMetadata(OWNER, libraryId, fileId, current.metadataVersion, {
    materialType: "book",
    canonicalTitle: value.canonicalTitle,
    subtitle: null,
    alternativeTitles: [],
    dateStatement: value.dateStatement ?? null,
    identifiers: value.identifier ? [{ scheme: "isbn", value: value.identifier }] : [],
    typeFields: {},
    authorityLinks: links as Array<{ authorityId: string; role: "author" | "publisher" }>,
  });
}

test("authority-scoped search returns only accessible holdings across the whole corpus", (context) => {
  const { database, libraries, metadata, persistence } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Shared Sources");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  const ownerDomainId = `library:${library.id}`;
  const bookA = addHolding(database, ownerDomainId, "aa", "scan-001.pdf");
  const bookB = addHolding(database, ownerDomainId, "bb", "scan-002.pdf");
  setMetadata(metadata, library.id, bookA, { canonicalTitle: "元代宰相制度研究", authorLabel: "张帆", publisherLabel: "北京大学出版社", dateStatement: "1997", identifier: "9787301032145" });
  setMetadata(metadata, library.id, bookB, { canonicalTitle: "The Mongols and the West", authorLabel: "Peter Jackson", publisherLabel: "Routledge", dateStatement: "2018" });
  const holdingA = persistence.repositories.libraries.findHoldingByFile(library.id, bookA)!;
  persistence.repositories.bibliography.saveProfile({
    ownerDomainId,
    recordId: holdingA.recordId,
    actorAccountId: OWNER.id,
    expectedRevision: null,
    now: NOW,
    materialClass: "primary_source_modern_edition",
    contributors: [{ id: "search-contributor-a", label: "顾颉刚", role: "annotator", roleLabel: "点校" }],
    publication: { publisher: "中华书局", place: "北京", publicationDate: "1976" },
    series: "二十四史",
    volume: "第一册",
    language: "汉语",
    carrierEdition: { editionType: "annotated_edition" },
    sourceEdition: { dynasty: "元" },
  });

  const byTitle = libraries.searchHoldings(MEMBER.id, library.id, "元代宰相", 50, null);
  assert.deepEqual(byTitle.results.map((item) => item.fileId), [bookA]);
  assert.equal(byTitle.results[0]?.canonicalTitle, "元代宰相制度研究");
  assert.deepEqual(byTitle.results[0]?.authorLabels, ["张帆"]);
  assert.equal(byTitle.results[0]?.publisher, "中华书局");
  assert.equal(byTitle.results[0]?.date, "1976");
  const listed = libraries.listHoldingsSorted(MEMBER.id, library.id, "newest", null).holdings;
  assert.deepEqual(byTitle.results[0]!.holding, listed.find((holding) => holding.file.id === bookA));
  assert.equal(byTitle.results[0]!.holding.publisher, "中华书局");
  assert.equal(byTitle.results[0]!.holding.date, "1976");
  assert.deepEqual(byTitle.results[0]!.holding.secondaryContributorLabels, ["顾颉刚"]);

  const byAuthor = libraries.searchHoldings(MEMBER.id, library.id, "Peter Jackson", 50, null);
  assert.deepEqual(byAuthor.results.map((item) => item.fileId), [bookB]);
  assert.deepEqual(byAuthor.results[0]!.holding, listed.find((holding) => holding.file.id === bookB));
  assert.equal(byAuthor.results[0]!.holding.publisher, "Routledge", "legacy authority publisher fallback agrees with Search");
  assert.equal(byAuthor.results[0]!.holding.date, "2018");

  const byIdentifier = libraries.searchHoldings(MEMBER.id, library.id, "9787301032145", 50, null);
  assert.deepEqual(byIdentifier.results.map((item) => item.fileId), [bookA]);

  const byFilename = libraries.searchHoldings(MEMBER.id, library.id, "scan-002", 50, null);
  assert.deepEqual(byFilename.results.map((item) => item.fileId), [bookB]);

  const byStructuredEdition = libraries.searchHoldings(MEMBER.id, library.id, "中华书局点校本", 50, null);
  assert.deepEqual(byStructuredEdition.results.map((item) => item.fileId), [bookA]);
  assert.equal(byStructuredEdition.results[0]?.materialClass, "primary_source_modern_edition");
  assert.equal(byStructuredEdition.results[0]?.catalogueDisplayTitle, "元代宰相制度研究 中华书局1976点校本");

  const filtered = libraries.searchHoldings(MEMBER.id, library.id, "", 50, null, {
    materialClass: "primary_source_modern_edition",
    contributor: "顾颉刚",
    publisher: "中华书局",
    year: "1976",
    editionType: "annotated_edition",
    editorialRole: "annotator",
    series: "二十四史",
    volume: "第一册",
  });
  assert.deepEqual(filtered.results.map((item) => item.fileId), [bookA]);
});

test("catalogue search hydrates metadata, bibliography, and authorities in constant batch calls", (context) => {
  const { database, libraries, metadata, persistence } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Batch Search");
  const ownerDomainId = `library:${library.id}`;
  const first = addHolding(database, ownerDomainId, "ba", "first.pdf");
  const second = addHolding(database, ownerDomainId, "bb2", "second.pdf");
  setMetadata(metadata, library.id, first, { canonicalTitle: "第一种元史", authorLabel: "甲" });
  setMetadata(metadata, library.id, second, { canonicalTitle: "第二种元史", authorLabel: "乙" });

  const metadataRepository = persistence.repositories.metadata;
  const bibliographyRepository = persistence.repositories.bibliography;
  const batchCalls = { metadata: 0, bibliography: 0, authorities: 0 };
  const findMetadataMany = metadataRepository.findMetadataMany.bind(metadataRepository);
  const findProfiles = bibliographyRepository.findProfiles.bind(bibliographyRepository);
  const findAuthorities = metadataRepository.findAuthorities.bind(metadataRepository);
  metadataRepository.findMetadata = () => { throw new Error("singular metadata hydration is forbidden"); };
  bibliographyRepository.findProfile = () => { throw new Error("singular bibliography hydration is forbidden"); };
  metadataRepository.findAuthority = () => { throw new Error("singular authority hydration is forbidden"); };
  persistence.repositories.libraries.findHoldingByFile = () => { throw new Error("search must use its already-authorized candidate holdings"); };
  persistence.repositories.libraries.listHoldings = () => { throw new Error("search must not scan all holdings"); };
  persistence.repositories.libraries.listHoldingsPage = () => { throw new Error("search must not scan all holding pages"); };
  metadataRepository.findMetadataMany = (...arguments_) => {
    batchCalls.metadata += 1;
    return findMetadataMany(...arguments_);
  };
  bibliographyRepository.findProfiles = (...arguments_) => {
    batchCalls.bibliography += 1;
    return findProfiles(...arguments_);
  };
  metadataRepository.findAuthorities = (...arguments_) => {
    batchCalls.authorities += 1;
    return findAuthorities(...arguments_);
  };

  const result = libraries.searchHoldings(OWNER.id, library.id, "元史", 50, null);
  assert.deepEqual(result.results.map((entry) => entry.fileId).sort(), [first, second].sort());
  assert.deepEqual(batchCalls, { metadata: 1, bibliography: 1, authorities: 1 });
  batchCalls.metadata = 0;
  batchCalls.bibliography = 0;
  batchCalls.authorities = 0;
  const firstPage = libraries.searchHoldings(OWNER.id, library.id, "元史", 1, null);
  assert.equal(firstPage.results.length, 1);
  assert.ok(firstPage.nextCursor);
  assert.deepEqual(batchCalls, { metadata: 1, bibliography: 1, authorities: 1 });
  const secondPage = libraries.searchHoldings(OWNER.id, library.id, "元史", 1, firstPage.nextCursor);
  assert.equal(secondPage.results.length, 1);
  assert.equal(secondPage.nextCursor, null);
  assert.notEqual(firstPage.results[0]!.holding.file.id, secondPage.results[0]!.holding.file.id);
});

test("non-members, disabled accounts, and guessed libraries are indistinguishable from no match", (context) => {
  const { database, libraries, metadata, persistence } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Shared Sources");
  const ownerDomainId = `library:${library.id}`;
  const book = addHolding(database, ownerDomainId, "cc", "hidden.pdf");
  setMetadata(metadata, library.id, book, { canonicalTitle: "元代宰相制度研究", authorLabel: "张帆" });

  // No match for a member.
  assert.deepEqual(libraries.searchHoldings(OWNER.id, library.id, "不存在的书名", 50, null).results, []);

  // Non-member and guessed library fail closed as not_found, identical to the
  // caller being unable to access any matching resource.
  assert.throws(() => libraries.searchHoldings(OUTSIDER.id, library.id, "元代宰相", 50, null), (error) => (
    error instanceof LibraryError && error.code === "not_found"
  ));
  assert.throws(() => libraries.searchHoldings(OWNER.id, "does-not-exist", "元代宰相", 50, null), (error) => (
    error instanceof LibraryError && error.code === "not_found"
  ));

  // A disabled member loses effective authority.
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  persistence.repositories.accounts.updateState(MEMBER.id, "active", "disabled", NOW);
  assert.throws(() => libraries.searchHoldings(MEMBER.id, library.id, "元代宰相", 50, null), (error) => (
    error instanceof LibraryError && error.code === "not_found"
  ));
});

test("search returns real public holding identities without physical storage or private account data", (context) => {
  const { database, libraries, metadata, persistence } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Shared Sources");
  const ownerDomainId = `library:${library.id}`;
  const book = addHolding(database, ownerDomainId, "dd", "book.pdf");
  setMetadata(metadata, library.id, book, { canonicalTitle: "元代宰相制度研究", authorLabel: "张帆" });

  const result = libraries.searchHoldings(OWNER.id, library.id, "元代宰相", 50, null).results[0]!;
  for (const key of Object.keys(result)) {
    assert.ok(!["recordId", "artifactId", "versionId", "ownerDomainId", "rank"].includes(key), `leaked ${key}`);
  }
  assert.equal(result.fileId, book);
  assert.deepEqual(result.holding, libraries.listHoldings(OWNER.id, library.id)[0]);
  assert.equal(result.holding.recordId, "search-record-dd");
  assert.equal(result.holding.artifactId, "search-artifact-dd");
  assert.equal(result.holding.versionId, "search-version-dd");
  const file = persistence.repositories.files.findByDomainId(ownerDomainId, book)!;
  assert.equal(result.holding.version, driveEntryVersion(file));
  assert.equal(result.holding.file.updatedAt, file.updatedAt.toISOString());
  for (const key of ["objectKey", "storageProvider", "ownerDomainId", "uploadedByAccountId", "favorites", "checksum", "rank"]) {
    assert.equal(JSON.stringify(result).includes(`"${key}"`), false, `leaked ${key}`);
  }
  const later = new Date(NOW.getTime() + 5000).toISOString();
  database.prepare("UPDATE files SET display_name = ?, revision = revision + 1, updated_at = ? WHERE id = ?").run("renamed.pdf", later, book);
  const changed = libraries.searchHoldings(OWNER.id, library.id, "元代宰相", 50, null).results[0]!.holding;
  assert.notEqual(changed.version, result.holding.version);
  assert.equal(changed.file.updatedAt, later);
  assert.equal(changed.file.displayName, "renamed.pdf");
  assert.equal(changed.recordId, result.holding.recordId);
  assert.equal(changed.artifactId, result.holding.artifactId);
  assert.equal(changed.versionId, result.holding.versionId);
  assert.throws(() => libraries.recycleHolding(OWNER, library.id, book, result.holding.version), (error) =>
    error instanceof LibraryError && error.code === "concurrent_change");
});

test("page hydration is bounded and excludes other library and account-domain matches", (context) => {
  const { database, libraries, metadata, persistence } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Visible");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  const foreignLibrary = libraries.createLibrary(OWNER, "Hidden");
  for (const suffix of ["one", "two", "three"]) addHolding(database, `library:${library.id}`, suffix, `same-${suffix}.pdf`);
  addHolding(database, `library:${foreignLibrary.id}`, "foreign", "same-foreign.pdf");
  addHolding(database, `account:${OWNER.id}`, "private", "same-private.pdf");
  const metadataRepository = persistence.repositories.metadata;
  const findMetadataMany = metadataRepository.findMetadataMany.bind(metadataRepository);
  const hydratedIds: string[][] = [];
  context.mock.method(metadataRepository, "findMetadataMany", (domain: string, ids: string[]) => {
    assert.equal(domain, `library:${library.id}`);
    hydratedIds.push([...ids]);
    return findMetadataMany(domain, ids);
  });
  const result = libraries.searchHoldings(MEMBER.id, library.id, "same", 1, null);
  assert.equal(result.results.length, 1);
  assert.deepEqual(hydratedIds, [[result.results[0]!.holding.recordId]]);
  assert.equal(result.results[0]!.holding.publisher, null);
  assert.equal(result.results[0]!.holding.date, null);
  assert.deepEqual(result.results[0]!.holding.secondaryContributorLabels, []);
  assert.equal(result.results[0]!.holding.catalogueDisplayTitle, result.results[0]!.displayName);
  assert.equal(JSON.stringify(result).includes("foreign"), false);
  assert.equal(JSON.stringify(result).includes("private"), false);
  const countBeforeDenial = hydratedIds.length;
  assert.throws(() => libraries.searchHoldings(MEMBER.id, foreignLibrary.id, "same", 1, null), (error) =>
    error instanceof LibraryError && error.code === "not_found");
  assert.equal(hydratedIds.length, countBeforeDenial, "membership denial occurs before hydration");
  assert.throws(() => metadata.getDetails(MEMBER, library.id, "search-file-foreign"));
});
