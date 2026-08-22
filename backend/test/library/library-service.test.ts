import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { AuthorizationDeniedError } from "../../src/auth/authorization.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { LibraryError, LibraryService } from "../../src/library/library-service.js";
import { CanonicalMetadataService } from "../../src/metadata/metadata-service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "owner-a", loginName: "owner-a", role: "owner" };
const MEMBER: AuthenticatedAccount = { id: "member-b", loginName: "member-b", role: "member" };
const MANAGER: AuthenticatedAccount = { id: "manager-c", loginName: "manager-c", role: "member" };

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
  const storage = new InMemoryStorageAdapter(() => NOW);
  const drive = new DriveService(persistence, storage, () => NOW);
  const libraries = new LibraryService(persistence, drive, () => NOW, (() => {
    let next = 0;
    return () => `library-${++next}`;
  })());
  let authorityId = 0;
  const metadata = new CanonicalMetadataService(persistence, () => NOW, () => `library-authority-${++authorityId}`);
  return { database, persistence, storage, drive, libraries, metadata };
}

function addLibraryHolding(database: ReturnType<typeof fixture>["database"], libraryId: string, ownerDomainId: string): string {
  const fileId = "library-file-1";
  const recordId = "library-record-1";
  const artifactId = "library-artifact-1";
  const versionId = "library-version-1";
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', 12, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(fileId, ownerDomainId, OWNER.id, "shared.pdf", "objects/aa/" + "b".repeat(62), "YWNhZGVtaWNjb3Vk", timestamp, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recordId, ownerDomainId, OWNER.id, "Shared record", timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run(artifactId, ownerDomainId, recordId, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(versionId, ownerDomainId, artifactId, fileId, timestamp, timestamp);
  database.prepare(`UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?`).run(artifactId);
  return fileId;
}

test("creates an explicit Library, scopes membership, and protects the last effective manager", async (context) => {
  const { database, persistence, libraries } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Shared Sources");
  assert.equal(library.role, "manager");
  const manager = libraries.addMember(OWNER, library.id, MEMBER.id, "manager");
  assert.equal(manager.role, "manager");

  const memberAccount = persistence.repositories.accounts.findById(MEMBER.id)!;
  assert.equal(persistence.repositories.accounts.updateState(memberAccount.id, "active", "disabled", NOW), true);
  assert.equal(libraries.listMembers(OWNER, library.id).find((entry) => entry.accountId === MEMBER.id)?.state, "disabled");
  assert.throws(() => libraries.changeMemberRole(OWNER, library.id, OWNER.id, "member"), (error) => (
    error instanceof LibraryError && error.code === "invalid_state"
  ));
  assert.throws(() => libraries.removeMember(OWNER, library.id, OWNER.id), (error) => (
    error instanceof LibraryError && error.code === "invalid_state"
  ));
  assert.throws(() => libraries.addMember(OWNER, library.id, MEMBER.id, "member"), (error) => (
    error instanceof LibraryError && error.code === "invalid_state"
  ));

  // With the other manager disabled, the database guard rejects disabling the
  // remaining active manager and leaves both membership/history rows intact.
  assert.throws(
    () => persistence.repositories.accounts.updateState(OWNER.id, "active", "disabled", NOW),
    /last effective library manager/,
  );
  assert.equal(persistence.repositories.accounts.findById(OWNER.id)?.state, "active");
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM library_memberships").get()?.count, 4);
});

test("Library holdings project ordered author labels without denormalizing canonical metadata", async (context) => {
  const { database, persistence, storage, libraries, metadata } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Shared Sources");
  const fileId = addLibraryHolding(database, library.id, `library:${library.id}`);
  storage.putObject({
    objectKey: `objects/aa/${"b".repeat(62)}`,
    sizeBytes: 12,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: "YWNhZGVtaWNjb3Vk",
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });

  const holdings = libraries.listHoldings(OWNER.id, library.id);
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0]?.file.id, fileId);
  assert.equal(holdings[0]?.canonicalTitle, null);
  assert.deepEqual(holdings[0]?.authorLabels, []);
  assert.equal("objectKey" in (holdings[0]?.file ?? {}), false);

  const authorA = metadata.createAuthority(OWNER, library.id, { type: "person", canonicalLabel: "作者甲", aliases: [] });
  const authorB = metadata.createAuthority(OWNER, library.id, { type: "person", canonicalLabel: "作者乙", aliases: [] });
  const current = metadata.getDetails(OWNER, library.id, fileId);
  metadata.updateMetadata(OWNER, library.id, fileId, current.metadataVersion, {
    materialType: "book",
    canonicalTitle: "书名",
    subtitle: null,
    alternativeTitles: [],
    dateStatement: null,
    identifiers: [],
    typeFields: {},
    authorityLinks: [
      { authorityId: authorA.id, role: "author" },
      { authorityId: authorB.id, role: "author" },
    ],
  });
  const catalogued = libraries.listHoldings(OWNER.id, library.id)[0]!;
  assert.equal(catalogued.canonicalTitle, "书名");
  assert.deepEqual(catalogued.authorLabels, ["作者甲", "作者乙"]);
  persistence.repositories.bibliography.saveProfile({
    recordId: catalogued.recordId,
    ownerDomainId: `library:${library.id}`,
    actorAccountId: OWNER.id,
    expectedRevision: null,
    now: NOW,
    materialClass: "scholarly_monograph",
    contributors: [{ id: "library-catalogue-author", label: "作者甲", role: "author" }],
    publication: { publisher: "学术出版社", publicationDate: "2026" },
    language: "汉语",
    carrierEdition: {},
    sourceEdition: {},
  });
  const intelligent = libraries.listHoldings(OWNER.id, library.id)[0]!;
  assert.equal(intelligent.materialClass, "scholarly_monograph");
  assert.deepEqual(intelligent.contributorLabels, ["作者甲"]);
  assert.equal(intelligent.catalogueDisplayTitle, "作者甲 书名");

  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  assert.deepEqual(libraries.listHoldings(MEMBER.id, library.id)[0]?.authorLabels, ["作者甲", "作者乙"]);
  const download = await libraries.createDownload(MEMBER.id, library.id, fileId);
  assert.match(download.url, /objects%2Faa%2F/);
  const preview = await libraries.createDownload(MEMBER.id, library.id, fileId, "inline");
  assert.match(preview.url, /inline/);

  assert.throws(() => libraries.listHoldings("outsider", library.id), (error) => (
    error instanceof LibraryError && error.code === "not_found"
  ));
  assert.throws(() => libraries.listHoldings(MEMBER.id, "does-not-exist"), (error) => (
    error instanceof LibraryError && error.code === "not_found"
  ));
  assert.equal(persistence.repositories.accounts.findById(MEMBER.id)?.state, "active");
});

test("disabled Library members lose effective access while membership and holdings remain durable", async (context) => {
  const { database, persistence, libraries } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Shared Sources");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  const fileId = addLibraryHolding(database, library.id, `library:${library.id}`);
  const memberAccount = persistence.repositories.accounts.findById(MEMBER.id)!;
  persistence.repositories.accounts.updateState(memberAccount.id, "active", "disabled", NOW);
  assert.throws(() => libraries.listHoldings(MEMBER.id, library.id), (error) => (
    error instanceof LibraryError && error.code === "not_found"
  ));
  assert.equal(libraries.listMembers(OWNER, library.id).find((entry) => entry.accountId === MEMBER.id)?.state, "disabled");
  assert.equal(database.prepare<[string], { count: number }>("SELECT count(*) AS count FROM scholarly_artifact_versions WHERE stored_file_id = ?").get(fileId)?.count, 1);
});

test("Library recycle is manager-only, domain-scoped, CAS guarded, and recoverable", async (context) => {
  const { database, persistence, storage, drive, libraries } = fixture(context);
  persistence.repositories.accounts.create({
    id: MANAGER.id,
    loginName: MANAGER.loginName,
    passwordHash: "test",
    role: MANAGER.role,
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const library = libraries.createLibrary(OWNER, "Shared Sources");
  const otherLibrary = libraries.createLibrary(OWNER, "Other Sources");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  libraries.addMember(OWNER, library.id, MANAGER.id, "manager");
  const fileId = addLibraryHolding(database, library.id, `library:${library.id}`);
  const objectKey = `objects/aa/${"b".repeat(62)}`;
  storage.putObject({
    objectKey,
    sizeBytes: 12,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: "YWNhZGVtaWNjb3Vk",
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  persistence.repositories.favorites.addFile(MEMBER.id, fileId, NOW);

  const beforeHolding = libraries.listHoldings(OWNER.id, library.id)[0]!;
  const beforeFile = persistence.repositories.files.findByDomainId(`library:${library.id}`, fileId)!;
  const beforeObject = await storage.statObject(objectKey);
  const stableFile = database.prepare<[string, string]>(`
    SELECT id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, created_at, activated_at, purged_at
    FROM files WHERE id = ? AND owner_domain_id = ?
  `).get(fileId, `library:${library.id}`);
  const stableLineage = database.prepare<[string]>(`
    SELECT
      scholarly_records.id AS record_id,
      scholarly_records.owner_domain_id AS record_owner_domain_id,
      scholarly_records.created_by_account_id AS record_creator_id,
      scholarly_records.label AS record_label,
      scholarly_artifacts.id AS artifact_id,
      scholarly_artifacts.owner_domain_id AS artifact_owner_domain_id,
      scholarly_artifacts.record_id AS artifact_record_id,
      scholarly_artifacts.attachment_state,
      scholarly_artifact_versions.id AS version_id,
      scholarly_artifact_versions.owner_domain_id AS version_owner_domain_id,
      scholarly_artifact_versions.artifact_id AS version_artifact_id,
      scholarly_artifact_versions.stored_file_id
    FROM scholarly_artifact_versions
    JOIN scholarly_artifacts ON scholarly_artifacts.id = scholarly_artifact_versions.artifact_id
    JOIN scholarly_records ON scholarly_records.id = scholarly_artifacts.record_id
    WHERE scholarly_artifact_versions.stored_file_id = ?
  `).get(fileId);
  const stableFavorite = database.prepare<[string, string]>(`
    SELECT account_id, file_id, created_at FROM favorite_files
    WHERE account_id = ? AND file_id = ?
  `).get(MEMBER.id, fileId);

  assert.throws(
    () => libraries.recycleHolding(MEMBER, library.id, fileId, beforeHolding.version),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );
  assert.throws(
    () => libraries.recycleHolding(OWNER, otherLibrary.id, fileId, beforeHolding.version),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );
  assert.throws(
    () => libraries.recycleHolding(OWNER, library.id, fileId, "s".repeat(43)),
    (error) => error instanceof LibraryError && error.code === "concurrent_change",
  );
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM recycle_groups").get()?.count, 0);
  assert.equal(persistence.repositories.files.findByDomainId(`library:${library.id}`, fileId)?.state, "active");
  assert.throws(
    () => libraries.listRecycle(MEMBER, library.id),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );

  const accountObjectKey = `objects/cc/${"d".repeat(62)}`;
  const accountFile = persistence.repositories.files.create({
    id: "account-private-file",
    ownerId: OWNER.id,
    folderId: null,
    displayName: "private.pdf",
    storageProvider: "memory",
    objectKey: accountObjectKey,
    mediaType: "application/pdf",
    sizeBytes: 7,
    checksumAlgorithm: "md5",
    checksum: "YWNhZGVtaWNjb3Vk",
    state: "active",
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
    activatedAt: NOW,
    deletedAt: null,
    purgedAt: null,
  });
  storage.putObject({
    objectKey: accountObjectKey,
    sizeBytes: 7,
    etag: "private-etag",
    checksumAlgorithm: "md5",
    checksum: "YWNhZGVtaWNjb3Vk",
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  drive.deleteFile(OWNER.id, accountFile.id);

  libraries.recycleHolding(OWNER, library.id, fileId, beforeHolding.version);

  const afterFile = persistence.repositories.files.findByDomainId(`library:${library.id}`, fileId)!;
  assert.equal(afterFile.state, "deleted");
  assert.equal(libraries.listHoldings(OWNER.id, library.id).length, 0);
  assert.equal(afterFile.ownerId, `library:${library.id}`);
  assert.equal(afterFile.objectKey, beforeFile.objectKey);
  assert.equal(afterFile.checksum, beforeFile.checksum);
  assert.equal(
    database.prepare<[string, string], { uploaded_by_account_id: string }>(
      "SELECT uploaded_by_account_id FROM files WHERE id = ? AND owner_domain_id = ?",
    ).get(fileId, `library:${library.id}`)?.uploaded_by_account_id,
    OWNER.id,
  );
  assert.equal(afterFile.revision, beforeFile.revision + 1);
  assert.equal(persistence.repositories.favorites.listFileIds(MEMBER.id).includes(fileId), true);
  const recycleGroup = database.prepare<[string, string], {
    id: string;
    owner_domain_id: string;
    created_by_account_id: string;
    root_kind: string;
    root_id: string;
  }>(
    "SELECT id, owner_domain_id, created_by_account_id, root_kind, root_id FROM recycle_groups WHERE root_id = ? AND owner_domain_id = ?",
  ).get(fileId, `library:${library.id}`);
  assert.ok(recycleGroup);
  assert.equal(recycleGroup.owner_domain_id, `library:${library.id}`);
  assert.equal(recycleGroup.created_by_account_id, OWNER.id);
  assert.equal(recycleGroup.root_kind, "file");
  assert.equal(recycleGroup.root_id, fileId);

  const listed = libraries.listRecycle(OWNER, library.id);
  assert.equal(listed.length, 1);
  assert.deepEqual(Object.keys(listed[0]!.file).sort(), ["deletedAt", "displayName", "id", "mediaType", "sizeBytes"]);
  assert.equal(listed[0]!.file.id, fileId);
  assert.equal("objectKey" in listed[0]!.file, false);
  assert.equal(libraries.listRecycle(MANAGER, library.id)[0]?.file.id, fileId);

  // Effective authority is re-read from the account repository. A stale
  // authenticated actor snapshot cannot list or restore after disable/archive.
  persistence.repositories.accounts.updateState(MANAGER.id, "active", "disabled", NOW);
  assert.throws(
    () => libraries.listRecycle(MANAGER, library.id),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );
  await assert.rejects(
    libraries.restoreHolding(MANAGER, library.id, fileId, listed[0]!.version),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );
  persistence.repositories.accounts.updateState(MANAGER.id, "disabled", "archived", NOW);
  assert.throws(
    () => libraries.listRecycle(MANAGER, library.id),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );
  assert.deepEqual(drive.listRecycle(OWNER.id).files.map((file) => file.id), [accountFile.id]);
  assert.equal(libraries.listRecycle(OWNER, library.id).some((entry) => entry.file.id === accountFile.id), false);

  await assert.rejects(
    libraries.restoreHolding(MEMBER, library.id, fileId, listed[0]!.version),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );
  await assert.rejects(
    libraries.restoreHolding(MANAGER, library.id, fileId, listed[0]!.version),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );
  await assert.rejects(
    libraries.restoreHolding(OWNER, otherLibrary.id, fileId, listed[0]!.version),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );
  await assert.rejects(
    libraries.restoreHolding(OWNER, library.id, "guessed-file", listed[0]!.version),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );
  await assert.rejects(
    libraries.restoreHolding(OWNER, library.id, fileId, "s".repeat(43)),
    (error) => error instanceof LibraryError && error.code === "concurrent_change",
  );
  assert.equal(persistence.repositories.files.findByDomainId(`library:${library.id}`, fileId)?.revision, afterFile.revision);
  assert.equal(
    database.prepare<[string], { count: number }>("SELECT count(*) AS count FROM recycle_groups WHERE id = ?").get(recycleGroup.id)?.count,
    1,
  );

  await libraries.restoreHolding(OWNER, library.id, fileId, listed[0]!.version);

  const restored = persistence.repositories.files.findByDomainId(`library:${library.id}`, fileId)!;
  assert.equal(restored.state, "active");
  assert.equal(restored.revision, beforeFile.revision + 2);
  assert.equal(restored.deletedAt, null);
  assert.equal(libraries.listRecycle(OWNER, library.id).length, 0);
  assert.equal(libraries.listHoldings(OWNER.id, library.id)[0]?.file.id, fileId);
  assert.equal(
    database.prepare<[string], { count: number }>("SELECT count(*) AS count FROM recycle_groups WHERE id = ?").get(recycleGroup.id)?.count,
    0,
  );
  assert.equal(drive.listRecycle(OWNER.id).files[0]?.id, accountFile.id, "Library restore must not consume account recycle state");
  await drive.restoreFile(OWNER.id, accountFile.id);
  assert.equal(persistence.repositories.files.findById(OWNER.id, accountFile.id)?.state, "active");

  assert.deepEqual(database.prepare<[string, string]>(`
    SELECT id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, created_at, activated_at, purged_at
    FROM files WHERE id = ? AND owner_domain_id = ?
  `).get(fileId, `library:${library.id}`), stableFile);
  assert.deepEqual(database.prepare<[string]>(`
    SELECT
      scholarly_records.id AS record_id,
      scholarly_records.owner_domain_id AS record_owner_domain_id,
      scholarly_records.created_by_account_id AS record_creator_id,
      scholarly_records.label AS record_label,
      scholarly_artifacts.id AS artifact_id,
      scholarly_artifacts.owner_domain_id AS artifact_owner_domain_id,
      scholarly_artifacts.record_id AS artifact_record_id,
      scholarly_artifacts.attachment_state,
      scholarly_artifact_versions.id AS version_id,
      scholarly_artifact_versions.owner_domain_id AS version_owner_domain_id,
      scholarly_artifact_versions.artifact_id AS version_artifact_id,
      scholarly_artifact_versions.stored_file_id
    FROM scholarly_artifact_versions
    JOIN scholarly_artifacts ON scholarly_artifacts.id = scholarly_artifact_versions.artifact_id
    JOIN scholarly_records ON scholarly_records.id = scholarly_artifacts.record_id
    WHERE scholarly_artifact_versions.stored_file_id = ?
  `).get(fileId), stableLineage);
  assert.deepEqual(database.prepare<[string, string]>(`
    SELECT account_id, file_id, created_at FROM favorite_files
    WHERE account_id = ? AND file_id = ?
  `).get(MEMBER.id, fileId), stableFavorite);
  assert.deepEqual(await storage.statObject(objectKey), beforeObject);
  assert.deepEqual(
    database.prepare<[string], { action: string; actor_account_id: string; target_id: string; outcome: string }>(`
      SELECT action, actor_account_id, target_id, outcome
      FROM governance_audit_events
      WHERE action = 'drive.file_restore' AND target_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(fileId),
    { action: "drive.file_restore", actor_account_id: OWNER.id, target_id: fileId, outcome: "succeeded" },
  );
});

test("Library restore fails closed when the stored object is missing", async (context) => {
  const { database, persistence, libraries } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Shared Sources");
  const fileId = addLibraryHolding(database, library.id, `library:${library.id}`);
  const active = libraries.listHoldings(OWNER.id, library.id)[0]!;
  libraries.recycleHolding(OWNER, library.id, fileId, active.version);
  const deleted = libraries.listRecycle(OWNER, library.id)[0]!;
  const groupId = database.prepare<[string, string], { id: string }>(
    "SELECT id FROM recycle_groups WHERE owner_domain_id = ? AND root_id = ?",
  ).get(`library:${library.id}`, fileId)!.id;

  await assert.rejects(
    libraries.restoreHolding(OWNER, library.id, fileId, deleted.version),
    (error) => error instanceof Error && error.message === "upload_metadata_mismatch",
  );
  assert.equal(persistence.repositories.files.findByDomainId(`library:${library.id}`, fileId)?.state, "deleted");
  assert.equal(
    database.prepare<[string], { count: number }>("SELECT count(*) AS count FROM recycle_groups WHERE id = ?").get(groupId)?.count,
    1,
  );
});

test("Library permanent delete is global-Owner-only and revalidates exclusivity at the destructive transaction boundary", async (context) => {
  const { database, persistence, storage, drive, libraries } = fixture(context);
  const canonical = persistence.repositories.libraries.findDefault();
  assert.ok(canonical);

  const upload = await drive.createUpload(OWNER.id, {
    folderId: null,
    displayName: "exclusive.pdf",
    mediaType: "application/pdf",
    sizeBytes: 12,
    checksum: { algorithm: "md5", value: "1B2M2Y8AsgTpgAmY7PhCfg==" },
  });
  storage.putObject({
    objectKey: upload.upload.fields.key!,
    sizeBytes: 12,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: "1B2M2Y8AsgTpgAmY7PhCfg==",
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  await libraries.completeDefaultUpload(OWNER, upload.file.id);
  const holding = libraries.listHoldings(OWNER.id, canonical.id)[0]!;
  libraries.recycleHolding(OWNER, canonical.id, holding.file.id, holding.version);
  const recycled = libraries.listRecycle(OWNER, canonical.id)[0]!;

  await assert.rejects(
    libraries.permanentlyDeleteHolding(MEMBER, canonical.id, holding.file.id, recycled.version),
    (error: unknown) => error instanceof AuthorizationDeniedError,
  );

  const repository = persistence.repositories.libraries;
  const originalProof = repository.verifyRecycledHoldingExclusive.bind(repository);
  let proofCalls = 0;
  repository.verifyRecycledHoldingExclusive = (...args) => {
    proofCalls += 1;
    return proofCalls === 1 ? originalProof(...args) : false;
  };

  await assert.rejects(
    libraries.permanentlyDeleteHolding(OWNER, canonical.id, holding.file.id, recycled.version),
    (error: unknown) => error instanceof LibraryError && error.code === "concurrent_change",
  );
  assert.equal(proofCalls, 2, "preflight proof must be repeated inside the mutation transaction");
  assert.equal(persistence.repositories.files.findByDomainId(canonical.ownerDomainId, holding.file.id)?.state, "deleted");
  assert.equal(database.prepare<[string], { attachment_state: string }>(
    "SELECT attachment_state FROM scholarly_artifacts WHERE id = ?",
  ).get(holding.artifactId)?.attachment_state, "attached");
  assert.notEqual(await storage.statObject(upload.upload.fields.key!), null);

  repository.verifyRecycledHoldingExclusive = originalProof;
  await libraries.permanentlyDeleteHolding(OWNER, canonical.id, holding.file.id, recycled.version);
  assert.equal(persistence.repositories.files.findByDomainId(canonical.ownerDomainId, holding.file.id)?.state, "purged");
  assert.equal(database.prepare<[string], { attachment_state: string }>(
    "SELECT attachment_state FROM scholarly_artifacts WHERE id = ?",
  ).get(holding.artifactId)?.attachment_state, "detached");
  assert.equal(database.prepare<[string, string], { count: number }>(
    "SELECT count(*) AS count FROM scholarly_artifact_versions WHERE id = ? AND stored_file_id = ?",
  ).get(holding.versionId, holding.file.id)?.count, 1, "retained lineage remains attributed to the purged file");
  assert.equal(await storage.statObject(upload.upload.fields.key!), null);
});
