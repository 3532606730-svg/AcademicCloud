import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import { catalogSourceIdentity } from "../../src/drive/source-identity.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { LibraryService } from "../../src/library/library-service.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-09-15T10:00:00Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

function fixture(context: TestContext) {
  const { database, persistence } = createTestPersistence(context);
  for (const id of ["owner-source", "other-source"]) persistence.repositories.accounts.create({
    id, loginName: id, role: "owner", state: "active", passwordHash: "hash", createdAt: NOW, updatedAt: NOW,
  });
  const storage = new InMemoryStorageAdapter(() => NOW);
  const drive = new DriveService(persistence, storage, () => NOW);
  return { database, persistence, storage, drive };
}

async function pendingUpload(f: ReturnType<typeof fixture>, name = "document.pdf") {
  const result = await f.drive.createUpload("owner-source", {
    folderId: null, displayName: name, mediaType: "application/pdf", sizeBytes: 1024,
    checksum: { algorithm: "md5", value: MD5 },
  });
  f.storage.putObject({ objectKey: result.file.objectKey, mediaType: "application/pdf", sizeBytes: 1024,
    etag: "etag", checksumAlgorithm: "md5", checksum: MD5, modifiedAt: NOW });
  return result.file;
}

test("source generation starts at activation and survives metadata edits, recycle and restore", async (context) => {
  const f = fixture(context);
  const file = await pendingUpload(f);
  const current = () => f.persistence.repositories.files.findCurrentDocumentSource(file.id);
  assert.equal(current(), null);
  const activated = await f.drive.completeUpload("owner-source", file.id);
  const source = current()!;
  assert.ok(source.sourceId);
  assert.equal(source.resourceId, file.id);
  const download = await f.drive.createDownload("owner-source", file.id, "inline");
  assert.deepEqual(download.source, { resourceId: file.id, sourceId: source.sourceId });
  assert.deepEqual(Object.keys(download.source).sort(), ["resourceId", "sourceId"]);
  const renamed = f.drive.updateFile("owner-source", file.id, { displayName: "renamed.pdf" });
  assert.notDeepEqual(catalogSourceIdentity(renamed), catalogSourceIdentity(activated));
  const folder = f.drive.createFolder("owner-source", "Research", null);
  f.drive.updateFile("owner-source", file.id, { folderId: folder.id });
  assert.deepEqual(current(), source);
  f.drive.deleteFile("owner-source", file.id);
  assert.equal(current(), null);
  await f.drive.restoreFile("owner-source", file.id);
  assert.deepEqual(current(), source);
  await f.drive.completeUpload("owner-source", file.id);
  assert.deepEqual(current(), source);
});

test("byte replacement creates a new immutable generation and rolls back atomically", async (context) => {
  const f = fixture(context);
  const file = await pendingUpload(f);
  await f.drive.completeUpload("owner-source", file.id);
  const sourceA = f.persistence.repositories.files.findCurrentDocumentSource(file.id)!;
  f.database.prepare("UPDATE files SET checksum = ? WHERE id = ?").run("AAAAAAAAAAAAAAAAAAAAAA==", file.id);
  const sourceB = f.persistence.repositories.files.findCurrentDocumentSource(file.id)!;
  assert.notEqual(sourceA.sourceId, sourceB.sourceId);
  assert.throws(() => f.database.prepare("UPDATE document_sources SET checksum = 'changed' WHERE id = ?").run(sourceA.sourceId), /immutable/);
  assert.throws(() => f.database.prepare("DELETE FROM document_sources WHERE id = ?").run(sourceA.sourceId), /immutable/);
  assert.throws(() => f.database.prepare("DELETE FROM document_current_sources WHERE file_id = ?").run(file.id), /cannot be removed/);
  assert.throws(() => f.database.prepare("UPDATE document_current_sources SET source_id = ? WHERE file_id = ?").run(sourceA.sourceId, file.id), /does not match/);
  assert.throws(() => f.persistence.runInTransaction(() => {
    f.database.prepare("UPDATE files SET size_bytes = 2048 WHERE id = ?").run(file.id);
    throw new Error("rollback source replacement");
  }), /rollback source/);
  assert.deepEqual(f.persistence.repositories.files.findCurrentDocumentSource(file.id), sourceB);
  f.database.prepare("UPDATE files SET checksum = ? WHERE id = ?").run(MD5, file.id);
  const returned = f.persistence.repositories.files.findCurrentDocumentSource(file.id)!;
  assert.notEqual(returned.sourceId, sourceA.sourceId);
  assert.equal(returned.checksum, sourceA.checksum);
  assert.equal(f.database.prepare<[], { count: number }>("SELECT count(*) AS count FROM document_sources").get()!.count, 3);
  assert.deepEqual(f.database.prepare("PRAGMA foreign_key_check").all(), []);
});

test("source identity cannot cross files and remains stable on Library ownership promotion", async (context) => {
  const f = fixture(context);
  const first = await pendingUpload(f, "first.pdf");
  const second = await pendingUpload(f, "second.pdf");
  await f.drive.completeUpload("owner-source", first.id);
  await f.drive.completeUpload("owner-source", second.id);
  const source = f.persistence.repositories.files.findCurrentDocumentSource(first.id)!;
  assert.throws(() => f.database.prepare("UPDATE document_current_sources SET source_id = ? WHERE file_id = ?").run(source.sourceId, second.id), /does not match/);
  const lookup = context.mock.method(f.persistence.repositories.files, "findCurrentDocumentSource");
  await assert.rejects(f.drive.createDownload("other-source", first.id), (error) => error instanceof DriveError && error.code === "not_found");
  assert.equal(lookup.mock.callCount(), 0, "unauthorized requests must not even fetch source identity");
  const libraries = new LibraryService(f.persistence, f.drive, () => NOW);
  await libraries.completeDefaultUpload({ id: "owner-source", loginName: "owner-source", role: "owner" }, first.id);
  assert.deepEqual(f.persistence.repositories.files.findCurrentDocumentSource(first.id), source);
  await assert.rejects(f.drive.createDownload("other-source", first.id), (error) => error instanceof DriveError && error.code === "not_found");
});

test("in-flight signing rejects a changed source but permits a metadata-only rename", async (context) => {
  const f = fixture(context);
  const file = await pendingUpload(f);
  await f.drive.completeUpload("owner-source", file.id);
  const original = f.storage.createDownloadAuthorization.bind(f.storage);
  f.storage.createDownloadAuthorization = async (input) => {
    f.drive.updateFile("owner-source", file.id, { displayName: "renamed.pdf" });
    return original(input);
  };
  const before = f.persistence.repositories.files.findCurrentDocumentSource(file.id)!;
  assert.equal((await f.drive.createDownload("owner-source", file.id)).source.sourceId, before.sourceId);
  f.storage.createDownloadAuthorization = async (input) => {
    f.database.prepare("UPDATE files SET checksum = ? WHERE id = ?").run("AAAAAAAAAAAAAAAAAAAAAA==", file.id);
    return original(input);
  };
  await assert.rejects(f.drive.createDownload("owner-source", file.id), (error) => error instanceof DriveError && error.code === "concurrent_change");
});

test("in-flight signing does not disclose authorization after the source becomes unavailable", async (context) => {
  const f = fixture(context);
  const file = await pendingUpload(f);
  await f.drive.completeUpload("owner-source", file.id);
  const original = f.storage.createDownloadAuthorization.bind(f.storage);
  f.storage.createDownloadAuthorization = async (input) => {
    f.drive.deleteFile("owner-source", file.id);
    return original(input);
  };
  await assert.rejects(f.drive.createDownload("owner-source", file.id), (error) => error instanceof DriveError && error.code === "concurrent_change");
  assert.equal(f.persistence.repositories.files.findCurrentDocumentSource(file.id), null);
  assert.equal(f.database.prepare<[], { n: number }>("SELECT count(*) AS n FROM document_sources").get()!.n, 1);
});
