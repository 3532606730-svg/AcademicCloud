import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { LibraryError, LibraryService } from "../../src/library/library-service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "owner-a", loginName: "owner-a", role: "owner" };
const MEMBER: AuthenticatedAccount = { id: "member-b", loginName: "member-b", role: "member" };

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
  return { database, persistence, storage, libraries };
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

test("Library holdings are non-disclosing and reuse scoped storage download/preview authorization", async (context) => {
  const { database, persistence, storage, libraries } = fixture(context);
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
  assert.equal("objectKey" in (holdings[0]?.file ?? {}), false);

  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
  assert.equal(libraries.listHoldings(MEMBER.id, library.id).length, 1);
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
  const { database, persistence, storage, libraries } = fixture(context);
  const library = libraries.createLibrary(OWNER, "Shared Sources");
  const otherLibrary = libraries.createLibrary(OWNER, "Other Sources");
  libraries.addMember(OWNER, library.id, MEMBER.id, "member");
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
  const beforeLineage = database.prepare<[string], Array<{ id: string }>>(
    "SELECT id FROM scholarly_artifact_versions WHERE stored_file_id = ?",
  ).all(fileId);

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

  // A disabled or archived manager cannot mutate the Library, even when the
  // caller still holds a previously authenticated actor snapshot.
  libraries.changeMemberRole(OWNER, library.id, MEMBER.id, "manager");
  persistence.repositories.accounts.updateState(MEMBER.id, "active", "disabled", NOW);
  assert.throws(
    () => libraries.recycleHolding(MEMBER, library.id, fileId, beforeHolding.version),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );
  persistence.repositories.accounts.updateState(MEMBER.id, "disabled", "archived", NOW);
  assert.throws(
    () => libraries.recycleHolding(MEMBER, library.id, fileId, beforeHolding.version),
    (error) => error instanceof LibraryError && error.code === "not_found",
  );

  libraries.recycleHolding(OWNER, library.id, fileId, beforeHolding.version);

  const afterFile = persistence.repositories.files.findByDomainId(`library:${library.id}`, fileId)!;
  assert.equal(afterFile.state, "deleted");
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
  assert.deepEqual(
    database.prepare<[string], Array<{ id: string }>>(
      "SELECT id FROM scholarly_artifact_versions WHERE stored_file_id = ?",
    ).all(fileId),
    beforeLineage,
  );
  assert.equal(persistence.repositories.favorites.listFileIds(MEMBER.id).includes(fileId), true);
  const recycleGroup = database.prepare<[string, string], {
    owner_domain_id: string;
    created_by_account_id: string;
    root_kind: string;
    root_id: string;
  }>(
    "SELECT owner_domain_id, created_by_account_id, root_kind, root_id FROM recycle_groups WHERE root_id = ? AND owner_domain_id = ?",
  ).get(fileId, `library:${library.id}`);
  assert.deepEqual(recycleGroup, {
    owner_domain_id: `library:${library.id}`,
    created_by_account_id: OWNER.id,
    root_kind: "file",
    root_id: fileId,
  });
  assert.equal((await storage.statObject(objectKey))?.sizeBytes, 12);
});
