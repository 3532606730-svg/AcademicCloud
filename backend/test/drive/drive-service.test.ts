import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { NewAccount } from "../../src/auth/account.js";
import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-12T08:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

class ControlledStorage extends InMemoryStorageAdapter {
  failDelete = false;
  failAuthorization = false;
  failStat = false;
  readonly deleteCalls: string[] = [];

  override async createUploadAuthorization(
    input: Parameters<InMemoryStorageAdapter["createUploadAuthorization"]>[0],
  ) {
    if (this.failAuthorization) throw new Error("signing failed");
    return super.createUploadAuthorization(input);
  }

  override async deleteObject(objectKey: string): Promise<void> {
    this.deleteCalls.push(objectKey);
    if (this.failDelete) throw new Error("provider unavailable");
    await super.deleteObject(objectKey);
  }

  override async statObject(objectKey: string) {
    if (this.failStat) throw new Error("provider unavailable");
    return super.statObject(objectKey);
  }
}

function account(id: string): NewAccount {
  return {
    id,
    loginName: id,
    passwordHash: "test",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function fixture(context: TestContext) {
  const { persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create(account("owner-1"));
  persistence.repositories.accounts.create(account("owner-2"));
  const storage = new ControlledStorage(() => NOW);
  const service = new DriveService(persistence, storage, () => NOW);
  return { persistence, storage, service };
}

async function createAndUpload(service: DriveService, storage: ControlledStorage, ownerId = "owner-1") {
  const result = await service.createUpload(ownerId, {
    folderId: null,
    displayName: "paper.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1024,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const objectKey = result.upload.fields.key!;
  storage.putObject({
    objectKey,
    sizeBytes: 1024,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  return { ...result, objectKey };
}

test("folder workflows are owner scoped, metadata-only, and reject non-empty deletion", async (context) => {
  const { service, storage } = fixture(context);
  const parent = service.createFolder("owner-1", "Sources", null);
  const child = service.createFolder("owner-1", "Primary", parent.id);

  assert.deepEqual(service.listEntries("owner-1", parent.id).folders.map((item) => item.id), [child.id]);
  assert.throws(() => service.listEntries("owner-2", parent.id), (error) => error instanceof DriveError && error.code === "not_found");
  assert.throws(() => service.deleteFolder("owner-1", parent.id), (error) => error instanceof DriveError && error.code === "folder_not_empty");

  service.deleteFolder("owner-1", child.id);
  const restored = service.restoreFolder("owner-1", child.id);
  assert.equal(restored.state, "active");
  assert.equal(storage.deleteCalls.length, 0);
  const renamed = service.updateFolder("owner-1", child.id, { name: "Edited", parentId: null });
  assert.equal(renamed.name, "Edited");
  assert.equal(renamed.parentId, null);

  const grandchild = service.createFolder("owner-1", "Grandchild", child.id);
  assert.throws(
    () => service.updateFolder("owner-1", child.id, { parentId: grandchild.id }),
    (error) => error instanceof DriveError && error.code === "invalid_move",
  );
});

test("upload reserves a name, binds checksum and no-overwrite fields, then verifies metadata", async (context) => {
  const { service, storage } = fixture(context);
  const pending = await service.createUpload("owner-1", {
    folderId: null,
    displayName: "paper.pdf",
    mediaType: "APPLICATION/PDF",
    sizeBytes: 1024,
    checksum: { algorithm: "md5", value: MD5 },
  });

  assert.equal(pending.file.state, "pending_upload");
  assert.match(pending.upload.fields.key!, /^objects\//);
  assert.equal(pending.upload.fields["Content-MD5"], MD5);
  assert.equal(pending.file.checksum, MD5);
  assert.throws(
    () => service.createFolder("owner-1", "bad/name", null),
    /safe name/,
  );
  await assert.rejects(service.completeUpload("owner-1", pending.file.id), (error) => error instanceof DriveError && error.code === "upload_incomplete");

  const objectKey = pending.upload.fields.key!;
  storage.putObject({
    objectKey,
    sizeBytes: 999,
    etag: null,
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  await assert.rejects(service.completeUpload("owner-1", pending.file.id), (error) => error instanceof DriveError && error.code === "upload_metadata_mismatch");

  storage.putObject({
    objectKey,
    sizeBytes: 1024,
    etag: null,
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  const active = await service.completeUpload("owner-1", pending.file.id);
  assert.equal(active.state, "active");
  assert.equal((await service.completeUpload("owner-1", pending.file.id)).state, "active");
});

test("renew recovers pending uploads without exposing another owner", async (context) => {
  const { persistence, service, storage } = fixture(context);
  const pending = await service.createUpload("owner-1", {
    folderId: null,
    displayName: "retry.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1,
    checksum: { algorithm: "md5", value: MD5 },
  });

  assert.equal((await service.renewUploadAuthorization("owner-1", pending.file.id)).fields.key, pending.upload.fields.key);
  const renewed = persistence.repositories.files.findById("owner-1", pending.file.id)!;
  assert.equal(renewed.revision, pending.file.revision + 1);
  storage.failAuthorization = true;
  await assert.rejects(
    service.renewUploadAuthorization("owner-1", pending.file.id),
    (error) => error instanceof DriveError && error.code === "storage_unavailable",
  );
  assert.equal(
    persistence.repositories.files.findById("owner-1", pending.file.id)?.revision,
    renewed.revision + 1,
  );
  await assert.rejects(service.renewUploadAuthorization("owner-2", pending.file.id), (error) => error instanceof DriveError && error.code === "not_found");
});

test("authorization failure compensates the pending name reservation", async (context) => {
  const { persistence, service, storage } = fixture(context);
  storage.failAuthorization = true;

  await assert.rejects(
    service.createUpload("owner-1", {
      folderId: null,
      displayName: "retry.pdf",
      mediaType: "application/pdf",
      sizeBytes: 1,
      checksum: { algorithm: "md5", value: MD5 },
    }),
    (error) => error instanceof DriveError && error.code === "storage_unavailable",
  );
  assert.equal(persistence.repositories.files.listByFolder("owner-1", null, "pending_upload").length, 0);

  storage.failAuthorization = false;
  assert.equal((await service.createUpload("owner-1", {
    folderId: null,
    displayName: "retry.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1,
    checksum: { algorithm: "md5", value: MD5 },
  })).file.state, "pending_upload");
});

test("active files list, download, rename, move, soft-delete, and restore without moving bytes", async (context) => {
  const { service, storage } = fixture(context);
  const folder = service.createFolder("owner-1", "Destination", null);
  const uploaded = await createAndUpload(service, storage);
  const active = await service.completeUpload("owner-1", uploaded.file.id);
  const moved = service.updateFile("owner-1", active.id, { displayName: "renamed.pdf", folderId: folder.id });

  assert.equal(moved.objectKey, uploaded.objectKey);
  assert.equal(service.listEntries("owner-1", folder.id).files[0]?.displayName, "renamed.pdf");
  assert.match((await service.createDownload("owner-1", moved.id)).url, /^memory:\/\/download/);
  assert.match(
    decodeURIComponent((await service.createDownload("owner-1", moved.id, "inline")).url),
    /response-content-disposition=inline/,
  );
  await assert.rejects(service.createDownload("owner-2", moved.id), (error) => error instanceof DriveError && error.code === "not_found");

  service.deleteFile("owner-1", moved.id);
  assert.equal(service.listEntries("owner-1", folder.id).files.length, 0);
  assert.equal(service.listRecycle("owner-1").files[0]?.state, "deleted");
  assert.equal((await service.restoreFile("owner-1", moved.id)).state, "active");
  assert.equal(storage.deleteCalls.length, 0);
});

test("inline authorization is restricted to passive preview media types", async (context) => {
  const { persistence, service, storage } = fixture(context);
  const uploaded = await createAndUpload(service, storage);
  await service.completeUpload("owner-1", uploaded.file.id);
  const active = persistence.repositories.files.findById("owner-1", uploaded.file.id)!;
  persistence.repositories.files.update(
    { ...active, mediaType: "image/svg+xml" },
    "active",
    active.revision,
  );

  await assert.rejects(
    service.createDownload("owner-1", uploaded.file.id, "inline"),
    (error) => error instanceof DriveError && error.code === "invalid_state",
  );
  assert.match((await service.createDownload("owner-1", uploaded.file.id)).url, /^memory:\/\/download/);
});

test("inline download fails with preview_unavailable when no browser preview endpoint exists", async (context) => {
  const { service, storage } = fixture(context);
  const uploaded = await createAndUpload(service, storage);
  await service.completeUpload("owner-1", uploaded.file.id);

  Object.defineProperty(storage, "browserPreviewAvailable", { value: false });

  await assert.rejects(
    service.createDownload("owner-1", uploaded.file.id, "inline"),
    (error) => error instanceof DriveError && error.code === "preview_unavailable",
  );
  // Attachment downloads keep working without the custom domain.
  assert.match((await service.createDownload("owner-1", uploaded.file.id)).url, /^memory:\/\/download/);
});

test("permanent deletion persists purging intent and never purges on provider failure", async (context) => {
  const { persistence, service, storage } = fixture(context);
  const uploaded = await createAndUpload(service, storage);
  await service.completeUpload("owner-1", uploaded.file.id);
  service.deleteFile("owner-1", uploaded.file.id);
  storage.failDelete = true;

  await assert.rejects(service.permanentlyDeleteFile("owner-1", uploaded.file.id), (error) => error instanceof DriveError && error.code === "storage_unavailable");
  assert.equal(persistence.repositories.files.findById("owner-1", uploaded.file.id)?.state, "purging");

  storage.failDelete = false;
  await service.permanentlyDeleteFile("owner-1", uploaded.file.id);
  const purged = persistence.repositories.files.findById("owner-1", uploaded.file.id);
  assert.equal(purged?.state, "purged");
  assert.equal(purged?.purgedAt?.toISOString(), NOW.toISOString());
  assert.deepEqual(storage.deleteCalls, [uploaded.objectKey, uploaded.objectKey]);
});

test("provider mismatch never reads or deletes an object through the wrong adapter", async (context) => {
  const { persistence, service, storage } = fixture(context);
  const uploaded = await createAndUpload(service, storage);
  await service.completeUpload("owner-1", uploaded.file.id);
  service.deleteFile("owner-1", uploaded.file.id);
  Object.defineProperty(storage, "provider", { value: "other-provider" });
  const wrongProviderService = new DriveService(persistence, storage, () => NOW);

  await assert.rejects(wrongProviderService.restoreFile("owner-1", uploaded.file.id), (error) => error instanceof DriveError && error.code === "storage_unavailable");
  await assert.rejects(wrongProviderService.permanentlyDeleteFile("owner-1", uploaded.file.id), (error) => error instanceof DriveError && error.code === "storage_unavailable");
  assert.equal(storage.deleteCalls.length, 0);
});

test("permanent deletion verifies exact object metadata before delete", async (context) => {
  const { persistence, service, storage } = fixture(context);
  const uploaded = await createAndUpload(service, storage);
  await service.completeUpload("owner-1", uploaded.file.id);
  service.deleteFile("owner-1", uploaded.file.id);
  storage.putObject({
    objectKey: uploaded.objectKey,
    sizeBytes: 1,
    etag: null,
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });

  await assert.rejects(
    service.permanentlyDeleteFile("owner-1", uploaded.file.id),
    (error) => error instanceof DriveError && error.code === "upload_metadata_mismatch",
  );
  assert.equal(storage.deleteCalls.length, 0);
  assert.equal(persistence.repositories.files.findById("owner-1", uploaded.file.id)?.state, "purging");
});

test("concurrent permanent-delete requests share one provider operation", async (context) => {
  const { persistence, service, storage } = fixture(context);
  const uploaded = await createAndUpload(service, storage);
  await service.completeUpload("owner-1", uploaded.file.id);
  service.deleteFile("owner-1", uploaded.file.id);
  let releaseDelete!: () => void;
  const deleteBarrier = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  const originalDelete = storage.deleteObject.bind(storage);
  storage.deleteObject = async (objectKey: string) => {
    await deleteBarrier;
    await originalDelete(objectKey);
  };

  const first = service.permanentlyDeleteFile("owner-1", uploaded.file.id);
  const second = service.permanentlyDeleteFile("owner-1", uploaded.file.id);
  releaseDelete();
  await Promise.all([first, second]);

  assert.deepEqual(storage.deleteCalls, [uploaded.objectKey]);
  assert.equal(persistence.repositories.files.findById("owner-1", uploaded.file.id)?.state, "purged");
});
