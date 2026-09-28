import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { DerivedComputeDispatchJob, DerivedComputeDispatcher } from "@academiccloud/compute-contracts";

import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { LocalPullComputeDispatcher } from "../../src/compute/local-pull-dispatcher.js";
import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import { FavoriteService } from "../../src/favorites/favorite-service.js";
import { LibraryError, LibraryService } from "../../src/library/library-service.js";
import { CanonicalMetadataService } from "../../src/metadata/metadata-service.js";
import { openSqlitePersistence } from "../../src/persistence/sqlite/persistence.js";
import { ScholarlyRecordService } from "../../src/research/service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { SuggestionService } from "../../src/suggestions/suggestion-service.js";
import { multipartUploadVersion } from "../../src/transfer/multipart-transfer.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "owner-contrib", loginName: "owner-contrib", role: "owner" };
const MEMBER: AuthenticatedAccount = { id: "member-contrib", loginName: "member-contrib", role: "member" };
const OUTSIDER: AuthenticatedAccount = { id: "outsider-contrib", loginName: "outsider-contrib", role: "member" };
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

function fixture(context: TestContext) {
  const { database, persistence } = createTestPersistence(context);
  for (const account of [OWNER, MEMBER, OUTSIDER]) {
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
    return () => `contrib-id-${++next}`;
  })());
  const research = new ScholarlyRecordService(persistence, () => NOW);
  return { database, persistence, storage, drive, libraries, research };
}

function addCanonicalHolding(database: ReturnType<typeof fixture>["database"], displayName: string): string {
  const suffix = displayName.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 20);
  const fileId = `canonical-${suffix}-file`;
  const recordId = `canonical-${suffix}-record`;
  const artifactId = `canonical-${suffix}-artifact`;
  const versionId = `canonical-${suffix}-version`;
  const domainId = "library:canonical-library";
  const objectKey = `objects/ca/${"d".repeat(62)}`;
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', 12, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(fileId, domainId, OWNER.id, displayName, objectKey, MD5, timestamp, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recordId, domainId, OWNER.id, displayName, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run(artifactId, domainId, recordId, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(versionId, domainId, artifactId, fileId, timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run(artifactId);
  return fileId;
}

function addAccountHolding(database: ReturnType<typeof fixture>["database"], accountId: string, prefix: string): { fileId: string; artifactId: string; recordId: string; versionId: string; folderId: string } {  const fileId = `${prefix}-file`;
  const recordId = `${prefix}-record`;
  const artifactId = `${prefix}-artifact`;
  const versionId = `${prefix}-version`;
  const folderId = `${prefix}-folder`;
  const domainId = `account:${accountId}`;
  const objectKey = `objects/${prefix.slice(0, 2).padEnd(2, "a")}/${"c".repeat(62)}`;
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO folders (
      id, owner_domain_id, created_by_account_id, parent_id, name, state,
      created_at, updated_at, deleted_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'active', ?, ?, NULL, NULL)
  `).run(folderId, domainId, accountId, `${prefix} folder`, timestamp, timestamp);
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, ?, ?, 'memory', ?, 'application/pdf', 12, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(fileId, domainId, accountId, folderId, `${prefix}.pdf`, objectKey, MD5, timestamp, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recordId, domainId, accountId, `${prefix} record`, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run(artifactId, domainId, recordId, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(versionId, domainId, artifactId, fileId, timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run(artifactId);
  database.prepare("INSERT INTO favorite_files (account_id, file_id, created_at) VALUES (?, ?, ?)").run(accountId, fileId, timestamp);
  return { fileId, artifactId, recordId, versionId, folderId };
}

function putObject(storage: InMemoryStorageAdapter, prefix: string): void {
  storage.putObject({
    objectKey: `objects/${prefix.slice(0, 2).padEnd(2, "a")}/${"c".repeat(62)}`,
    sizeBytes: 12,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
}

test("submit → approve promotes one explicit artifact atomically while preserving identity, bytes, provenance, and private overlay rows", async (context) => {
  const { database, persistence, storage, libraries, research } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Contribution Library");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  const resource = addAccountHolding(database, MEMBER.id, "aa-submit");
  putObject(storage, "aa-submit");

  const submitted = libraries.submitContribution(MEMBER, library.id, resource.artifactId);
  assert.equal(submitted.state, "submitted");
  assert.throws(() => libraries.submitContribution(MEMBER, library.id, resource.artifactId), (error) => error instanceof LibraryError && error.code === "conflict");
  assert.equal(libraries.listContributions(OWNER, library.id)[0]?.file.displayName, "aa-submit.pdf");
  assert.equal(libraries.listMyContributions(MEMBER, library.id)[0]?.id, submitted.id);
  assert.throws(() => libraries.listContributions(OUTSIDER, library.id), (error) => error instanceof LibraryError && error.code === "not_found");
  const reviewDownload = await libraries.createContributionDownload(OWNER, library.id, submitted.id, "inline");
  assert.match(reviewDownload.url, /objects%2Faa%2F/);

  const approved = libraries.reviewContribution(OWNER, library.id, submitted.id, "approve");
  assert.equal(approved.state, "approved");
  assert.equal(libraries.listContributions(OWNER, library.id).length, 0);
  assert.equal(libraries.listHoldings(MEMBER.id, library.id)[0]?.file.id, resource.fileId);
  const promotedFile = database.prepare<[string], { owner_domain_id: string; folder_id: string | null; uploaded_by_account_id: string; object_key: string }>("SELECT owner_domain_id, folder_id, uploaded_by_account_id, object_key FROM files WHERE id = ?").get(resource.fileId);
  assert.deepEqual(promotedFile, {
    owner_domain_id: `library:${library.id}`,
    folder_id: null,
    uploaded_by_account_id: MEMBER.id,
    object_key: `objects/aa/${"c".repeat(62)}`,
  });
  assert.equal(database.prepare<[string, string], { count: number }>("SELECT count(*) AS count FROM favorite_files WHERE account_id = ? AND file_id = ?").get(MEMBER.id, resource.fileId)?.count, 1);
  assert.equal(persistence.repositories.research?.listRecords(MEMBER.id, null, 100).length, 0);
  assert.equal(database.prepare<[string], { count: number }>("SELECT count(*) AS count FROM scholarly_artifact_versions WHERE stored_file_id = ?").get(resource.fileId)?.count, 1);
  assert.equal(persistence.repositories.accounts.updateState(MEMBER.id, "active", "disabled", NOW), true);
  assert.equal(libraries.listHoldings(OWNER.id, library.id)[0]?.file.id, resource.fileId);
  assert.throws(() => libraries.listHoldings(MEMBER.id, library.id), (error) => error instanceof LibraryError && error.code === "not_found");
  assert.equal(persistence.repositories.accounts.updateState(MEMBER.id, "disabled", "active", NOW), true);
  libraries.removeMember(OWNER, library.id, MEMBER.id);
  assert.equal(libraries.listHoldings(OWNER.id, library.id)[0]?.file.id, resource.fileId);
  await assert.rejects(libraries.createContributionDownload(MEMBER, library.id, submitted.id), (error) => error instanceof LibraryError && error.code === "not_found");
});

test("reject and withdraw are terminal state-only decisions and leave account ownership unchanged", async (context) => {
  const { database, persistence, libraries } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Contribution Library");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  const rejectedResource = addAccountHolding(database, MEMBER.id, "bb-reject");
  const withdrawnResource = addAccountHolding(database, MEMBER.id, "cc-withdraw");
  const rejected = libraries.submitContribution(MEMBER, library.id, rejectedResource.artifactId);
  const withdrawn = libraries.submitContribution(MEMBER, library.id, withdrawnResource.artifactId);

  assert.equal(libraries.reviewContribution(OWNER, library.id, rejected.id, "reject").state, "rejected");
  assert.equal(libraries.withdrawContribution(MEMBER, library.id, withdrawn.id).state, "withdrawn");
  for (const resource of [rejectedResource, withdrawnResource]) {
    assert.equal(database.prepare<[string], { owner_domain_id: string; folder_id: string | null }>("SELECT owner_domain_id, folder_id FROM files WHERE id = ?").get(resource.fileId)?.owner_domain_id, `account:${MEMBER.id}`);
    assert.equal(database.prepare<[string], { owner_domain_id: string; folder_id: string | null }>("SELECT owner_domain_id, folder_id FROM files WHERE id = ?").get(resource.fileId)?.folder_id, resource.folderId);
  }
  assert.throws(() => libraries.reviewContribution(OWNER, library.id, rejected.id, "approve"), (error) => error instanceof LibraryError && error.code === "not_found");
  assert.throws(() => libraries.withdrawContribution(MEMBER, library.id, withdrawn.id), (error) => error instanceof LibraryError && error.code === "not_found");
  assert.equal(persistence.repositories.accounts.findById(MEMBER.id)?.state, "active");
});

test("approval cannot bypass the guarded ownership-promotion transaction", (context) => {
  const { database, libraries } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Contribution Library");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  const resource = addAccountHolding(database, MEMBER.id, "bi-guarded");

  for (const state of ["approved", "rejected", "withdrawn"] as const) {
    assert.throws(() => database.prepare(`
      INSERT INTO library_contributions (
        id, library_id, artifact_id, contributor_account_id, state, revision,
        submitted_at, reviewed_at, reviewed_by_account_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(`direct-${state}`, library.id, resource.artifactId, MEMBER.id, state,
      NOW.toISOString(), NOW.toISOString(), OWNER.id, NOW.toISOString(), NOW.toISOString()),
    /library contribution must begin submitted/);
  }
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM library_contributions").get()?.count, 0);

  const submitted = libraries.submitContribution(MEMBER, library.id, resource.artifactId);

  assert.throws(() => database.prepare(`
    UPDATE library_contributions
    SET state = 'approved', revision = revision + 1,
        reviewed_at = ?, reviewed_by_account_id = ?, updated_at = ?
    WHERE id = ?
  `).run(NOW.toISOString(), OWNER.id, NOW.toISOString(), submitted.id), /approved contribution requires completed Library ownership promotion/);
  assert.equal(libraries.listContributions(OWNER, library.id)[0]?.state, "submitted");
  assert.equal(database.prepare<[string], { owner_domain_id: string }>("SELECT owner_domain_id FROM files WHERE id = ?").get(resource.fileId)?.owner_domain_id, `account:${MEMBER.id}`);

  assert.equal(libraries.reviewContribution(OWNER, library.id, submitted.id, "approve").state, "approved");
  assert.equal(database.prepare<[string], { owner_domain_id: string }>("SELECT owner_domain_id FROM files WHERE id = ?").get(resource.fileId)?.owner_domain_id, `library:${library.id}`);
});

test("approval in one Library invalidates another Library's stale submission authority", async (context) => {
  const { database, storage, libraries } = fixture(context);
  const libraryA = libraries.createLibrary(OWNER, "Library A");
  const libraryB = libraries.createLibrary(OUTSIDER, "Library B");
  libraries.addMember(OWNER, libraryA.id, MEMBER.id, "member");
  libraries.addMember(OUTSIDER, libraryB.id, MEMBER.id, "member");
  const resource = addAccountHolding(database, MEMBER.id, "ba-cross-library");
  putObject(storage, "ba-cross-library");

  const submittedA = libraries.submitContribution(MEMBER, libraryA.id, resource.artifactId);
  const submittedB = libraries.submitContribution(MEMBER, libraryB.id, resource.artifactId);
  assert.equal(libraries.listContributions(OUTSIDER, libraryB.id)[0]?.id, submittedB.id);

  assert.equal(libraries.reviewContribution(OWNER, libraryA.id, submittedA.id, "approve").state, "approved");
  assert.equal(database.prepare<[string], { state: string }>("SELECT state FROM library_contributions WHERE id = ?").get(submittedB.id)?.state, "submitted");
  assert.equal(libraries.listContributions(OUTSIDER, libraryB.id).length, 0);
  libraries.removeMember(OWNER, libraryA.id, MEMBER.id);
  assert.equal(libraries.listMyContributions(MEMBER, libraryB.id).length, 0);
  await assert.rejects(libraries.createContributionDownload(OUTSIDER, libraryB.id, submittedB.id), (error) => error instanceof LibraryError && error.code === "not_found");
  await assert.rejects(libraries.createContributionDownload(MEMBER, libraryB.id, submittedB.id), (error) => error instanceof LibraryError && error.code === "not_found");
  assert.throws(() => libraries.reviewContribution(OUTSIDER, libraryB.id, submittedB.id, "reject"), (error) => error instanceof LibraryError && error.code === "not_found");
  assert.throws(() => libraries.withdrawContribution(MEMBER, libraryB.id, submittedB.id), (error) => error instanceof LibraryError && error.code === "not_found");
});

test("a disabled submitter cannot complete stale approval, and one terminal winner prevents a second decision", (context) => {
  const { database, persistence, libraries } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Contribution Library");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  const resource = addAccountHolding(database, MEMBER.id, "dd-disabled");
  const submitted = libraries.submitContribution(MEMBER, library.id, resource.artifactId);
  assert.equal(persistence.repositories.accounts.updateState(MEMBER.id, "active", "disabled", NOW), true);
  assert.throws(() => libraries.reviewContribution(OWNER, library.id, submitted.id, "approve"), (error) => error instanceof LibraryError && error.code === "invalid_state");
  assert.equal(libraries.reviewContribution(OWNER, library.id, submitted.id, "reject").state, "rejected");
  assert.throws(() => libraries.reviewContribution(OWNER, library.id, submitted.id, "approve"), (error) => error instanceof LibraryError && error.code === "not_found");
});

test("membership removal before approval blocks stale promotion without exposing unrelated resources", (context) => {
  const { database, libraries } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Contribution Library");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  const resource = addAccountHolding(database, MEMBER.id, "ff-removed");
  const submitted = libraries.submitContribution(MEMBER, library.id, resource.artifactId);
  libraries.removeMember(OWNER, library.id, MEMBER.id);
  assert.throws(() => libraries.reviewContribution(OWNER, library.id, submitted.id, "approve"), (error) => error instanceof LibraryError && error.code === "invalid_state");
  assert.equal(database.prepare<[string], { owner_domain_id: string }>("SELECT owner_domain_id FROM files WHERE id = ?").get(resource.fileId)?.owner_domain_id, `account:${MEMBER.id}`);
  assert.equal(libraries.reviewContribution(OWNER, library.id, submitted.id, "reject").state, "rejected");
});

test("the minimum promotion refuses a partial multi-Artifact Record instead of moving unsubmitted siblings", (context) => {
  const { database, libraries } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Contribution Library");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  const resource = addAccountHolding(database, MEMBER.id, "gg-multi");
  const timestamp = NOW.toISOString();
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES ('gg-private-sibling', ?, ?, 'detached', ?, ?)
  `).run(`account:${MEMBER.id}`, resource.recordId, timestamp, timestamp);
  assert.throws(() => libraries.submitContribution(MEMBER, library.id, resource.artifactId), (error) => error instanceof LibraryError && error.code === "invalid_state");
  assert.equal(database.prepare<[string], { count: number }>("SELECT count(*) AS count FROM library_contributions WHERE artifact_id = ?").get(resource.artifactId)?.count, 0);
});

test("approval and ownership promotion roll back completely when governance audit persistence fails", (context) => {
  const { database, persistence, libraries } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Contribution Library");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  const resource = addAccountHolding(database, MEMBER.id, "hh-rollback");
  const submitted = libraries.submitContribution(MEMBER, library.id, resource.artifactId);
  const createAudit = persistence.repositories.audit.create.bind(persistence.repositories.audit);
  persistence.repositories.audit.create = () => { throw new Error("injected audit failure"); };
  assert.throws(() => libraries.reviewContribution(OWNER, library.id, submitted.id, "approve"), /injected audit failure/);
  persistence.repositories.audit.create = createAudit;

  assert.equal(database.prepare<[string], { owner_domain_id: string }>("SELECT owner_domain_id FROM files WHERE id = ?").get(resource.fileId)?.owner_domain_id, `account:${MEMBER.id}`);
  assert.equal(persistence.repositories.contributions.findById(library.id, submitted.id)?.state, "submitted");
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM library_ownership_promotions").get()?.count, 0);
});

test("canonical Member upload enters pending review automatically and preserves the contributor's private Favorite after approval", async (context) => {
  const { database, persistence, storage, drive, libraries } = fixture(context);
  const enrichmentRequests: Array<{ actorId: string; libraryId: string; fileId: string }> = [];
  libraries.setHoldingAvailableListener(async (actor, libraryId, fileId) => {
    enrichmentRequests.push({ actorId: actor.id, libraryId, fileId });
  });
  const favorites = new FavoriteService(persistence, () => NOW);
  const canonical = libraries.listLibraries(MEMBER.id).find((library) => library.isDefault);
  assert.ok(canonical);
  assert.equal(libraries.listLibraries(OUTSIDER.id).find((library) => library.isDefault)?.id, canonical.id);

  const reserved = await drive.createMultipartUpload(MEMBER.id, {
    folderId: null,
    displayName: "member-source.pdf",
    mediaType: "application/pdf",
    sizeBytes: 12,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const memberTransfer = persistence.repositories.multipartUploads!.findByFileId(MEMBER.id, reserved.file.id)!;
  storage.putMultipartPart(memberTransfer.providerUploadId, 1, 12, "etag-1");

  const completed = await libraries.completeDefaultMultipartUpload(MEMBER, reserved.file.id, reserved.transfer.version);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.deepEqual(enrichmentRequests, [], "a Member upload cannot trigger canonical enrichment before Owner admission");
  assert.equal(completed.state, "active");
  favorites.setFileFavorite(MEMBER.id, completed.id, true);
  assert.equal(libraries.listHoldings(OUTSIDER.id, canonical.id).length, 0);
  const pending = libraries.listContributions(OWNER, canonical.id);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.file.id, completed.id);
  assert.equal(pending[0]?.submitterLoginName, MEMBER.loginName);
  assert.equal(libraries.listMyContributions(MEMBER, canonical.id)[0]?.state, "submitted");
  assert.equal((await libraries.completeDefaultMultipartUpload(MEMBER, completed.id, reserved.transfer.version)).id, completed.id);
  assert.equal(libraries.listContributions(OWNER, canonical.id).length, 1);

  libraries.reviewContribution(OWNER, canonical.id, pending[0]!.id, "approve");
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.deepEqual(enrichmentRequests, [{ actorId: OWNER.id, libraryId: canonical.id, fileId: completed.id }]);
  assert.equal(libraries.listHoldings(OUTSIDER.id, canonical.id)[0]?.file.id, completed.id);
  assert.equal(favorites.listFavorites(MEMBER.id).libraryHoldings[0]?.holding.file.id, completed.id);
  assert.equal(favorites.listFavorites(OWNER.id).files.length, 0);
  assert.equal(database.prepare<[string], { uploaded_by_account_id: string; object_key: string }>(
    "SELECT uploaded_by_account_id, object_key FROM files WHERE id = ?",
  ).get(completed.id)?.uploaded_by_account_id, MEMBER.id);
  assert.equal((await libraries.completeDefaultMultipartUpload(MEMBER, completed.id, reserved.transfer.version)).id, completed.id);

  assert.equal(persistence.repositories.accounts.updateState(OUTSIDER.id, "active", "disabled", NOW), true);
  assert.throws(() => libraries.listHoldings(OUTSIDER.id, canonical.id), (error) => error instanceof LibraryError && error.code === "not_found");
});

test("canonical Owner multipart upload is admitted in the completion transaction without a pending self-review", async (context) => {
  const { database, persistence, storage, drive, libraries } = fixture(context);
  const enrichmentRequests: Array<{ actorId: string; libraryId: string; fileId: string }> = [];
  libraries.setHoldingAvailableListener(async (actor, libraryId, fileId) => {
    enrichmentRequests.push({ actorId: actor.id, libraryId, fileId });
  });
  const canonical = libraries.listLibraries(OWNER.id).find((library) => library.isDefault);
  assert.ok(canonical);
  const reserved = await drive.createMultipartUpload(OWNER.id, {
    folderId: null,
    displayName: "owner-source.pdf",
    mediaType: "application/pdf",
    sizeBytes: 12,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const ownerTransfer = persistence.repositories.multipartUploads!.findByFileId(OWNER.id, reserved.file.id)!;
  storage.putMultipartPart(ownerTransfer.providerUploadId, 1, 12, "etag-1");

  const completed = await libraries.completeDefaultMultipartUpload(OWNER, reserved.file.id, reserved.transfer.version);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.deepEqual(enrichmentRequests, [{ actorId: OWNER.id, libraryId: canonical.id, fileId: completed.id }]);
  assert.equal(libraries.listContributions(OWNER, canonical.id).length, 0);
  assert.equal(libraries.listHoldings(MEMBER.id, canonical.id)[0]?.file.id, completed.id);
  assert.equal(database.prepare<[string], { state: string }>(
    "SELECT state FROM library_contributions WHERE artifact_id = (SELECT artifact_id FROM scholarly_artifact_versions WHERE stored_file_id = ?)",
  ).get(completed.id)?.state, "approved");
  assert.equal(database.prepare<[string], { count: number }>(
    "SELECT count(*) AS count FROM governance_audit_events WHERE action = 'libraries.resource_admit' AND actor_account_id = ?",
  ).get(OWNER.id)?.count, 1);
  assert.equal((await libraries.completeDefaultMultipartUpload(OWNER, completed.id, reserved.transfer.version)).id, completed.id);
});

test("canonical intake persistence failure rolls upload activation and generated identities back together", async (context) => {
  const { database, persistence, storage, drive, libraries } = fixture(context);
  const reserved = await drive.createUpload(MEMBER.id, {
    folderId: null,
    displayName: "rollback-source.pdf",
    mediaType: "application/pdf",
    sizeBytes: 12,
    checksum: { algorithm: "md5", value: MD5 },
  });
  storage.putObject({
    objectKey: reserved.file.objectKey,
    sizeBytes: 12,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  const createContribution = persistence.repositories.contributions.create.bind(persistence.repositories.contributions);
  persistence.repositories.contributions.create = () => { throw new Error("injected intake failure"); };
  await assert.rejects(libraries.completeDefaultUpload(MEMBER, reserved.file.id), /injected intake failure/);
  persistence.repositories.contributions.create = createContribution;

  assert.equal(persistence.repositories.files.findById(MEMBER.id, reserved.file.id)?.state, "pending_upload");
  assert.equal(database.prepare<[string], { count: number }>(
    "SELECT count(*) AS count FROM scholarly_artifact_versions WHERE stored_file_id = ?",
  ).get(reserved.file.id)?.count, 0);
  assert.equal(database.prepare<[string], { count: number }>(
    "SELECT count(*) AS count FROM governance_audit_events WHERE action = 'drive.upload_activate' AND target_id = ?",
  ).get(reserved.file.id)?.count, 0);
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM library_contributions").get()?.count, 0);
});

test("canonical Owner upload creation rejects a duplicate holding name before reserving any bytes", async (context) => {
  const { database, persistence, libraries } = fixture(context);
  addCanonicalHolding(database, "dup-name.pdf");
  const input = {
    folderId: null,
    displayName: "dup-name.pdf",
    mediaType: "application/pdf",
    sizeBytes: 12,
    checksum: { algorithm: "md5" as const, value: MD5 },
  };
  await assert.rejects(
    libraries.createDefaultMultipartUpload(OWNER, input),
    (error) => error instanceof DriveError && error.code === "name_conflict",
  );
  await assert.rejects(
    libraries.createDefaultMultipartUpload(OWNER, { ...input, displayName: "DUP-NAME.PDF" }),
    (error) => error instanceof DriveError && error.code === "name_conflict",
  );
  assert.equal(
    database.prepare<[], { count: number }>("SELECT count(*) AS count FROM files WHERE display_name = 'dup-name.pdf'").get()?.count,
    1,
  );
  assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM multipart_uploads").get()?.count, 0);
  // The early gate is scoped to direct Owner admission; Members still submit
  // for review and their private account domain stays the first authority.
  const memberCreated = await libraries.createDefaultMultipartUpload(MEMBER, input);
  assert.ok(memberCreated.file.id);
  assert.equal(persistence.repositories.multipartUploads!.findByFileId(MEMBER.id, memberCreated.file.id)?.state, "uploading");
});

test("duplicate canonical filename surfaces name_conflict at completion and status, stays stable, and abandons cleanly", async (context) => {
  const { database, persistence, storage, drive, libraries } = fixture(context);
  addCanonicalHolding(database, "clash.pdf");
  const reserved = await drive.createMultipartUpload(OWNER.id, {
    folderId: null,
    displayName: "clash.pdf",
    mediaType: "application/pdf",
    sizeBytes: 12,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const upload = persistence.repositories.multipartUploads!.findByFileId(OWNER.id, reserved.file.id)!;
  storage.putMultipartPart(upload.providerUploadId, 1, 12, "etag-1");

  // The promotion-time UNIQUE collision maps to a clean, stable name_conflict.
  await assert.rejects(
    libraries.completeDefaultMultipartUpload(OWNER, reserved.file.id, reserved.transfer.version),
    (error) => error instanceof DriveError && error.code === "name_conflict",
  );
  const stuck = persistence.repositories.multipartUploads!.findByFileId(OWNER.id, reserved.file.id)!;
  assert.equal(stuck.state, "completing");

  // Status surfaces the same clean code instead of a raw SqliteError/500.
  await assert.rejects(
    libraries.getDefaultUploadStatus(OWNER, reserved.file.id),
    (error) => error instanceof DriveError && error.code === "name_conflict",
  );

  // Repeating completion with the current version fails identically without
  // state thrash: no endless 98%-style mutation loop.
  await assert.rejects(
    libraries.completeDefaultMultipartUpload(OWNER, reserved.file.id, multipartUploadVersion(stuck)),
    (error) => error instanceof DriveError && error.code === "name_conflict",
  );
  const still = persistence.repositories.multipartUploads!.findByFileId(OWNER.id, reserved.file.id)!;
  assert.equal(still.state, "completing");
  assert.equal(still.revision, stuck.revision);

  // The provider object was physically completed: abandoning discards it and
  // removes both rows, leaving no orphan bytes.
  assert.notEqual(await storage.statObject(reserved.file.objectKey), null);
  await drive.abandonUpload(OWNER.id, reserved.file.id, multipartUploadVersion(still));
  assert.equal(persistence.repositories.files.findById(OWNER.id, reserved.file.id), null);
  assert.equal(persistence.repositories.multipartUploads!.findByFileId(OWNER.id, reserved.file.id), null);
  assert.equal(await storage.statObject(reserved.file.objectKey), null);
});

function admissionFixture(context: TestContext) {
  const f = fixture(context);
  const canonical = f.libraries.listLibraries(OWNER.id).find((library) => library.isDefault)!;
  const dispatched: DerivedComputeDispatchJob[] = [];
  const localPull = new LocalPullComputeDispatcher();
  const dispatcher: DerivedComputeDispatcher = {
    dispatch: async (job) => {
      assert.equal(f.database.inTransaction, false, "provider work must begin after admission commits");
      dispatched.push({ ...job });
      return localPull.dispatch(job);
    },
  };
  const createSuggestions = (persistence = f.persistence) => new SuggestionService({
    persistence, storage: f.storage, metadata: new CanonicalMetadataService(persistence, () => NOW),
    dispatcher, coreBaseUrl: "https://academiccloud.example", now: () => NOW,
  });
  const suggestions = createSuggestions();
  const recorded: Array<{ actorId: string; fileId: string }> = [];
  f.libraries.setHoldingAdmissionRecorder((repositories, actor, libraryId, fileId, now) => {
    assert.equal(f.database.inTransaction, true);
    assert.equal(repositories.libraries.findHoldingByFile(libraryId, fileId)?.file.state, "active");
    assert.ok(repositories.files.findCurrentDocumentSource(fileId));
    suggestions.recordAdmission(repositories, actor, libraryId, fileId, now);
    recorded.push({ actorId: actor.id, fileId });
  });
  // Deliberately omit the latency-only wake: the durable sweep must suffice.
  return { ...f, canonical, suggestions, createSuggestions, dispatched, recorded };
}

type AdmissionUploadPath = "single" | "multipart" | "status recovery";

async function reserveAdmissionUpload(
  f: ReturnType<typeof admissionFixture>,
  actor: AuthenticatedAccount,
  path: AdmissionUploadPath,
  mediaType = "application/pdf",
) {
  const bytes = new Uint8Array(12).fill(37);
  const input = {
    folderId: null, displayName: `${actor.id}-${path}.${mediaType === "application/pdf" ? "pdf" : "txt"}`,
    mediaType, sizeBytes: bytes.byteLength, checksum: { algorithm: "md5" as const, value: MD5 },
  };
  if (path === "single") {
    const reserved = await f.drive.createUpload(actor.id, input);
    f.storage.putObject({ objectKey: reserved.file.objectKey, sizeBytes: bytes.byteLength, etag: "etag", checksumAlgorithm: "md5", checksum: MD5, mediaType, modifiedAt: NOW }, bytes);
    return { file: reserved.file, bytes, complete: () => f.libraries.completeDefaultUpload(actor, reserved.file.id) };
  }
  const reserved = await f.drive.createMultipartUpload(actor.id, input);
  const transfer = f.persistence.repositories.multipartUploads!.findByFileId(actor.id, reserved.file.id)!;
  f.storage.putMultipartPart(transfer.providerUploadId, 1, bytes, "etag-1");
  if (path === "status recovery") {
    // Model provider completion followed by loss of the Core response/process.
    await f.storage.completeMultipartUpload({ objectKey: reserved.file.objectKey, uploadId: transfer.providerUploadId, parts: [{ partNumber: 1, etag: "etag-1" }] });
  }
  const complete = async () => {
    if (path === "multipart") return f.libraries.completeDefaultMultipartUpload(actor, reserved.file.id, reserved.transfer.version);
    const status = await f.libraries.getDefaultUploadStatus(actor, reserved.file.id);
    assert.equal(status.kind, "complete");
    return status.file;
  };
  return { file: reserved.file, bytes, complete };
}

for (const path of ["single", "multipart", "status recovery"] as const) {
  test(`Owner ${path} admission persists its job atomically and a fresh SQLite service recovers the same attempt without a wake`, async (context) => {
    const f = admissionFixture(context);
    const upload = await reserveAdmissionUpload(f, OWNER, path);
    await upload.complete();
    const job = f.persistence.repositories.derivedJobs.findLatest("metadata_suggestion", f.canonical.id, upload.file.id)!;
    assert.ok(job);
    assert.equal(job.state, "queued");
    assert.equal(job.origin, "admission");
    assert.equal(job.queuePriority, 10);
    assert.equal(job.createdByAccountId, OWNER.id);
    assert.equal(job.attempts, 1);
    assert.equal(job.providerJobId, null);
    assert.deepEqual(f.recorded, [{ actorId: OWNER.id, fileId: upload.file.id }]);
    assert.deepEqual(f.dispatched, []);
    assert.equal(f.suggestions.getLatest(OWNER, f.canonical.id, upload.file.id), null, "filename extraction is outside admission");

    const reopened = openSqlitePersistence(f.database.name);
    try {
      assert.deepEqual(reopened.repositories.derivedJobs.findById(job.id), job, "the committed intent is visible from a fresh connection");
      const recovered = f.createSuggestions(reopened);
      assert.equal(await recovered.reconcileUndispatchedJobs(), 1);
      assert.equal(await recovered.reconcileUndispatchedJobs(), 0);
      assert.deepEqual(f.dispatched.map(({ id, attemptId }) => ({ id, attemptId })), [{ id: job.id, attemptId: job.activeAttemptId }]);
      const dispatched = reopened.repositories.derivedJobs.findById(job.id)!;
      assert.equal(dispatched.provider, "local_pull");
      assert.equal(dispatched.attempts, 1);
      assert.equal(dispatched.activeAttemptId, job.activeAttemptId);
    } finally {
      reopened.close();
    }
  });

  test(`Owner ${path} queue insertion failure rolls back activation, source, promotion and audit while preserving uploaded bytes`, async (context) => {
    const f = admissionFixture(context);
    const upload = await reserveAdmissionUpload(f, OWNER, path);
    const auditCount = f.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_events").get()!.count;
    const jobs = f.persistence.repositories.derivedJobs;
    const create = jobs.create.bind(jobs);
    jobs.create = (input) => { create(input); throw new Error("injected durable queue insertion failure"); };
    await assert.rejects(upload.complete, /injected durable queue insertion failure/);
    jobs.create = create;

    const pending = f.persistence.repositories.files.findById(OWNER.id, upload.file.id)!;
    assert.equal(pending.state, "pending_upload");
    assert.equal(pending.revision, upload.file.revision);
    assert.equal(pending.activatedAt, null);
    assert.equal(pending.ownerId, OWNER.id);
    assert.equal(f.persistence.repositories.files.findCurrentDocumentSource(upload.file.id), null);
    for (const table of ["derived_compute_jobs", "document_sources", "scholarly_records", "scholarly_artifacts", "scholarly_artifact_versions", "library_contributions", "library_ownership_promotions"]) {
      assert.equal(f.database.prepare<[], { count: number }>(`SELECT count(*) AS count FROM ${table}`).get()!.count, 0, `${table} must roll back`);
    }
    assert.equal(f.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_events").get()!.count, auditCount);
    assert.deepEqual(await f.storage.readObject(upload.file.objectKey, 12), upload.bytes);
    assert.deepEqual(f.dispatched, []);
    assert.equal(f.libraries.listHoldings(MEMBER.id, f.canonical.id).length, 0);
    if (path !== "single") assert.ok(f.persistence.repositories.multipartUploads!.findByFileId(OWNER.id, upload.file.id));

    // Recovery uses the retained object; no browser re-upload is required.
    if (path === "single") await upload.complete();
    else assert.equal((await f.libraries.getDefaultUploadStatus(OWNER, upload.file.id)).kind, "complete");
    assert.ok(f.persistence.repositories.derivedJobs.findLatest("metadata_suggestion", f.canonical.id, upload.file.id));
  });
}

test("Member upload has no job before approval; failed queue insertion preserves its contribution, source, overlay and bytes", async (context) => {
  const f = admissionFixture(context);
  const upload = await reserveAdmissionUpload(f, MEMBER, "multipart");
  await upload.complete();
  assert.equal(f.persistence.repositories.derivedJobs.findLatest("metadata_suggestion", f.canonical.id, upload.file.id), null);
  assert.deepEqual(f.recorded, []);
  const favorites = new FavoriteService(f.persistence, () => NOW);
  favorites.setFileFavorite(MEMBER.id, upload.file.id, true);
  const contribution = f.libraries.listContributions(OWNER, f.canonical.id)[0]!;
  const source = f.persistence.repositories.files.findCurrentDocumentSource(upload.file.id);
  const auditCount = f.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_events").get()!.count;
  const create = f.persistence.repositories.derivedJobs.create.bind(f.persistence.repositories.derivedJobs);
  f.persistence.repositories.derivedJobs.create = (input) => { create(input); throw new Error("injected review queue failure"); };
  assert.throws(() => f.libraries.reviewContribution(OWNER, f.canonical.id, contribution.id, "approve"), /injected review queue failure/);
  f.persistence.repositories.derivedJobs.create = create;
  assert.deepEqual(f.libraries.listContributions(OWNER, f.canonical.id)[0], contribution);
  assert.equal(f.persistence.repositories.files.findById(MEMBER.id, upload.file.id)?.state, "active");
  assert.deepEqual(f.persistence.repositories.files.findCurrentDocumentSource(upload.file.id), source);
  assert.equal(f.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM library_ownership_promotions").get()!.count, 0);
  assert.equal(f.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM derived_compute_jobs").get()!.count, 0);
  assert.equal(f.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM governance_audit_events").get()!.count, auditCount);
  assert.deepEqual(await f.storage.readObject(upload.file.objectKey, 12), upload.bytes);
  assert.deepEqual(f.dispatched, []);

  let wake: Promise<number> | undefined;
  f.libraries.setHoldingAvailableListener(async () => { wake = f.suggestions.reconcileUndispatchedJobs(); await wake; });
  f.libraries.reviewContribution(OWNER, f.canonical.id, contribution.id, "approve");
  const admitted = f.persistence.repositories.derivedJobs.findLatest("metadata_suggestion", f.canonical.id, upload.file.id)!;
  assert.equal(admitted.createdByAccountId, OWNER.id, "approval authority belongs to the reviewer, not the contributor");
  assert.equal(admitted.origin, "admission");
  assert.equal(admitted.providerJobId, null, "synchronous approval commits before the wake runs");
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.ok(wake);
  assert.equal(await wake, 1);
  assert.equal(f.dispatched.length, 1);
  assert.equal(favorites.listFavorites(MEMBER.id).libraryHoldings[0]?.holding.file.id, upload.file.id);
  assert.deepEqual(f.persistence.repositories.files.findCurrentDocumentSource(upload.file.id), source);
});

test("non-PDF Owner admission does not record or dispatch an optional metadata job", async (context) => {
  const f = admissionFixture(context);
  const upload = await reserveAdmissionUpload(f, OWNER, "single", "text/plain");
  await upload.complete();
  assert.equal(f.libraries.listHoldings(MEMBER.id, f.canonical.id)[0]?.file.id, upload.file.id);
  assert.deepEqual(f.recorded, []);
  assert.equal(await f.suggestions.reconcileUndispatchedJobs(), 0);
  assert.deepEqual(f.dispatched, []);
});

test("duplicate completion and status reads preserve a failed admission job even after rename; only explicit retry creates work", async (context) => {
  const f = admissionFixture(context);
  const upload = await reserveAdmissionUpload(f, OWNER, "multipart");
  await upload.complete();
  const jobs = f.persistence.repositories.derivedJobs;
  const job = jobs.findLatest("metadata_suggestion", f.canonical.id, upload.file.id)!;
  assert.ok(job.activeAttemptId);
  const failed = jobs.fail(job.id, job.activeAttemptId, "compute_timeout", NOW)!;
  f.persistence.runInTransaction((repositories) => f.suggestions.recordAdmission(repositories, OWNER, f.canonical.id, upload.file.id, NOW));
  assert.deepEqual(jobs.findById(job.id), failed, "same-key admission must not retry a terminal job");
  f.libraries.setHoldingAvailableListener(async () => { await f.suggestions.reconcileUndispatchedJobs(); });
  for (const rename of [false, true]) {
    if (rename) {
      const current = f.persistence.repositories.files.findByDomainId(`library:${f.canonical.id}`, upload.file.id)!;
      assert.ok(f.persistence.repositories.files.updateForDomain({ ...current, displayName: "renamed-source.pdf" }, "active", current.revision));
    }
    await upload.complete();
    assert.equal((await f.libraries.getDefaultUploadStatus(OWNER, upload.file.id)).kind, "complete");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(jobs.findById(job.id), failed);
    assert.equal(f.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM derived_compute_jobs").get()!.count, 1);
    assert.deepEqual(f.dispatched, []);
    assert.equal(f.recorded.length, 1);
  }
  const retried = await f.suggestions.requestGeneration(OWNER, f.canonical.id, upload.file.id);
  assert.notEqual(retried.id, job.id, "explicit retry after rename records the new fingerprint");
  assert.equal(retried.origin, "interactive");
  assert.deepEqual(jobs.findById(job.id), failed);
  assert.equal(f.dispatched.length, 1);
});

test("optional filename evidence failure cannot roll back admission or block durable dispatch", async (context) => {
  const f = admissionFixture(context);
  const upload = await reserveAdmissionUpload(f, OWNER, "single");
  await upload.complete();
  f.persistence.repositories.suggestions.createRun = () => { throw new Error("optional filename persistence unavailable"); };
  assert.equal(await f.suggestions.reconcileUndispatchedJobs(), 1);
  assert.equal(f.libraries.listHoldings(MEMBER.id, f.canonical.id)[0]?.file.id, upload.file.id);
  assert.equal(f.suggestions.getLatest(OWNER, f.canonical.id, upload.file.id), null);
  assert.equal(f.dispatched.length, 1);
});

for (const invalidation of ["disabled actor", "revoked manager", "changed source"] as const) {
  test(`admission recovery refuses dispatch after ${invalidation}`, async (context) => {
    const f = admissionFixture(context);
    let libraryId = f.canonical.id;
    let fileId: string;
    if (invalidation === "revoked manager") {
      const library = f.libraries.createLibrary(OWNER, "Revocable reviewer");
      libraryId = library.id;
      f.libraries.addMember(OWNER, library.id, MEMBER.id, "manager");
      f.libraries.addMember(OWNER, library.id, OUTSIDER.id, "member");
      const resource = addAccountHolding(f.database, OUTSIDER.id, "revoked-reviewer");
      fileId = resource.fileId;
      const contribution = f.libraries.submitContribution(OUTSIDER, library.id, resource.artifactId);
      f.libraries.reviewContribution(MEMBER, library.id, contribution.id, "approve");
      f.libraries.changeMemberRole(OWNER, library.id, MEMBER.id, "member");
    } else {
      const upload = await reserveAdmissionUpload(f, OWNER, "single");
      fileId = upload.file.id;
      await upload.complete();
      if (invalidation === "disabled actor") assert.equal(f.persistence.repositories.accounts.updateState(OWNER.id, "active", "disabled", NOW), true);
      else {
        const current = f.persistence.repositories.files.findByDomainId(`library:${libraryId}`, fileId)!;
        assert.ok(f.persistence.repositories.files.updateForDomain({ ...current, displayName: "changed-before-dispatch.pdf" }, "active", current.revision));
      }
    }
    const job = f.persistence.repositories.derivedJobs.findLatest("metadata_suggestion", libraryId, fileId)!;
    assert.equal(await f.suggestions.reconcileUndispatchedJobs(), 0);
    const failed = f.persistence.repositories.derivedJobs.findById(job.id)!;
    assert.equal(failed.state, "failed");
    assert.equal(failed.errorCode, invalidation === "changed source" ? "compute_source_stale" : "compute_authorization_changed");
    assert.equal(failed.activeAttemptId, job.activeAttemptId);
    assert.equal(failed.attempts, 1);
    assert.equal(failed.providerJobId, null);
    assert.deepEqual(f.dispatched, []);
  });
}
