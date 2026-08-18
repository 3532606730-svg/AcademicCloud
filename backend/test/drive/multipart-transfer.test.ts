import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import { ReliabilityMaintenance } from "../../src/maintenance/reliability-maintenance.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { MULTIPART_PART_SIZE_BYTES, multipartUploadVersion } from "../../src/transfer/multipart-transfer.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-19T04:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

function fixture(context: TestContext, storage = new InMemoryStorageAdapter(() => NOW)) {
  const { persistence } = createTestPersistence(context);
  for (const [id, role] of [["owner-1", "owner"], ["member-2", "member"]] as const) {
    persistence.repositories.accounts.create({
      id,
      loginName: id,
      passwordHash: "hash",
      role,
      state: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  return { persistence, storage, service: new DriveService(persistence, storage, () => NOW) };
}

test("multipart upload retains completed parts, resumes only missing parts, and finalizes exactly once", async (context) => {
  const { persistence, storage, service } = fixture(context);
  const sizeBytes = MULTIPART_PART_SIZE_BYTES + 5;
  const created = await service.createMultipartUpload("owner-1", {
    folderId: null,
    displayName: "large.pdf",
    mediaType: "application/pdf",
    sizeBytes,
    checksum: { algorithm: "md5", value: MD5 },
  });
  assert.equal(created.transfer.totalParts, 2);
  assert.equal(created.transfer.completedBytes, 0);
  assert.equal(service.pendingUploadKind("owner-1", created.file.id), "multipart");
  assert.equal(persistence.repositories.files.findById("member-2", created.file.id), null);

  const upload = persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id)!;
  const firstAuthorization = await service.createMultipartPartAuthorization("owner-1", created.file.id, {
    version: multipartUploadVersion(upload),
    partNumber: 1,
    sizeBytes: MULTIPART_PART_SIZE_BYTES,
    contentMd5: MD5,
  });
  assert.equal(firstAuthorization.method, "PUT");
  assert.equal(firstAuthorization.headers["Content-Length"], String(MULTIPART_PART_SIZE_BYTES));
  await assert.rejects(
    service.createMultipartPartAuthorization("member-2", created.file.id, {
      version: multipartUploadVersion(upload), partNumber: 1, sizeBytes: MULTIPART_PART_SIZE_BYTES, contentMd5: MD5,
    }),
    (error) => error instanceof DriveError && error.code === "not_found",
  );
  await assert.rejects(
    service.createMultipartPartAuthorization("owner-1", created.file.id, {
      version: multipartUploadVersion(upload), partNumber: 2, sizeBytes: 4, contentMd5: MD5,
    }),
    (error) => error instanceof DriveError && error.code === "upload_identity_mismatch",
  );

  storage.putMultipartPart(upload.providerUploadId, 1, MULTIPART_PART_SIZE_BYTES, "etag-1");
  const resumed = await service.getUploadStatus("owner-1", created.file.id);
  assert.equal(resumed.kind, "multipart");
  assert.deepEqual(resumed.kind === "multipart" ? resumed.completedParts.map((part) => part.partNumber) : [], [1]);
  assert.equal(resumed.kind === "multipart" ? resumed.completedBytes : 0, MULTIPART_PART_SIZE_BYTES);

  const paused = service.pauseMultipartUpload("owner-1", created.file.id, (resumed as typeof created.transfer).version);
  assert.equal(paused.state, "paused");
  await assert.rejects(
    service.createMultipartPartAuthorization("owner-1", created.file.id, {
      version: paused.version, partNumber: 2, sizeBytes: 5, contentMd5: MD5,
    }),
    (error) => error instanceof DriveError && error.code === "invalid_state",
  );
  const active = service.resumeMultipartUpload("owner-1", created.file.id, paused.version);
  assert.equal(active.state, "uploading");

  await assert.rejects(
    service.completeMultipartUpload("owner-1", created.file.id, active.version),
    (error) => error instanceof DriveError && error.code === "upload_incomplete",
  );
  const afterIncomplete = persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id)!;
  assert.equal(afterIncomplete.state, "uploading");
  storage.putMultipartPart(upload.providerUploadId, 2, 5, "etag-2");
  const completed = await service.completeMultipartUpload(
    "owner-1",
    created.file.id,
    multipartUploadVersion(afterIncomplete),
  );
  assert.equal(completed.state, "active");
  assert.equal(persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id), null);
  assert.equal(storage.hasMultipartUpload(upload.providerUploadId), false);
  assert.equal((await service.completeMultipartUpload("owner-1", created.file.id, "stale")).state, "active");

  const download = await service.createDownload("owner-1", created.file.id);
  assert.equal(download.acceptRanges, "bytes");
  assert.equal(download.sizeBytes, sizeBytes);
  assert.equal(download.etag, `multipart-${upload.providerUploadId}`);
});

test("lost provider completion response reconciles from exact object metadata", async (context) => {
  class LostResponseStorage extends InMemoryStorageAdapter {
    override async completeMultipartUpload(input: Parameters<InMemoryStorageAdapter["completeMultipartUpload"]>[0]) {
      await super.completeMultipartUpload(input);
      throw new Error("response lost");
    }
  }
  const storage = new LostResponseStorage(() => NOW);
  const { persistence, service } = fixture(context, storage);
  const created = await service.createMultipartUpload("owner-1", {
    folderId: null,
    displayName: "lost.pdf",
    mediaType: "application/pdf",
    sizeBytes: 3,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const upload = persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id)!;
  storage.putMultipartPart(upload.providerUploadId, 1, 3, "etag-1");
  const completed = await service.completeMultipartUpload("owner-1", created.file.id, multipartUploadVersion(upload));
  assert.equal(completed.state, "active");
  assert.equal(persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id), null);
});

test("abandon and bounded stale cleanup abort only the exact multipart upload", async (context) => {
  let now = NOW;
  const storage = new InMemoryStorageAdapter(() => now);
  const { persistence } = fixture(context, storage);
  const service = new DriveService(persistence, storage, () => now);
  const first = await service.createMultipartUpload("owner-1", {
    folderId: null, displayName: "first.pdf", mediaType: "application/pdf", sizeBytes: 3,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const second = await service.createMultipartUpload("owner-1", {
    folderId: null, displayName: "second.pdf", mediaType: "application/pdf", sizeBytes: 4,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const firstUpload = persistence.repositories.multipartUploads!.findByFileId("owner-1", first.file.id)!;
  const secondUpload = persistence.repositories.multipartUploads!.findByFileId("owner-1", second.file.id)!;
  await service.abandonUpload("owner-1", first.file.id, multipartUploadVersion(firstUpload));
  assert.equal(storage.hasMultipartUpload(firstUpload.providerUploadId), false);
  assert.equal(storage.hasMultipartUpload(secondUpload.providerUploadId), true);
  assert.equal(persistence.repositories.files.findById("owner-1", first.file.id), null);

  now = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1_000);
  const dry = await new ReliabilityMaintenance(persistence, storage, () => now).run({
    pendingAgeMilliseconds: 60 * 60 * 1_000,
  });
  assert.equal(dry.files.find((item) => item.fileId === second.file.id)?.outcome, "would_abort_stale_multipart");
  const applied = await new ReliabilityMaintenance(persistence, storage, () => now).run({
    apply: true,
    pendingAgeMilliseconds: 60 * 60 * 1_000,
  });
  assert.equal(applied.files.find((item) => item.fileId === second.file.id)?.outcome, "aborted_stale_multipart");
  assert.equal(storage.hasMultipartUpload(secondUpload.providerUploadId), false);
  assert.equal(persistence.repositories.files.findById("owner-1", second.file.id), null);
});

test("expired sessions fail closed for transfer work but remain exactly abandonable", async (context) => {
  let now = NOW;
  const storage = new InMemoryStorageAdapter(() => now);
  const { persistence } = fixture(context, storage);
  const service = new DriveService(persistence, storage, () => now);
  const created = await service.createMultipartUpload("owner-1", {
    folderId: null, displayName: "expired.pdf", mediaType: "application/pdf", sizeBytes: 3,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const upload = persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id)!;
  const version = multipartUploadVersion(upload);
  now = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1_000);

  await assert.rejects(
    service.getUploadStatus("owner-1", created.file.id),
    (error) => error instanceof DriveError && error.code === "invalid_state",
  );
  await assert.rejects(
    service.createMultipartPartAuthorization("owner-1", created.file.id, {
      version, partNumber: 1, sizeBytes: 3, contentMd5: MD5,
    }),
    (error) => error instanceof DriveError && error.code === "invalid_state",
  );
  await service.abandonUpload("owner-1", created.file.id, version);
  assert.equal(storage.hasMultipartUpload(upload.providerUploadId), false);
  assert.equal(persistence.repositories.files.findById("owner-1", created.file.id), null);
});

test("provider pagination outside the one-page 640-part contract fails closed", async (context) => {
  class UnexpectedPaginationStorage extends InMemoryStorageAdapter {
    override async listMultipartParts() {
      return { parts: [], nextPartNumberMarker: 1 };
    }
  }
  const { service } = fixture(context, new UnexpectedPaginationStorage(() => NOW));
  const created = await service.createMultipartUpload("owner-1", {
    folderId: null, displayName: "paged.pdf", mediaType: "application/pdf", sizeBytes: 3,
    checksum: { algorithm: "md5", value: MD5 },
  });
  await assert.rejects(
    service.getUploadStatus("owner-1", created.file.id),
    (error) => error instanceof DriveError && error.code === "upload_metadata_mismatch",
  );
});

test("abort failure restores a resumable CAS state and a later exact abandon succeeds", async (context) => {
  class OnceFailingAbortStorage extends InMemoryStorageAdapter {
    failAbort = true;
    override async abortMultipartUpload(input: Parameters<InMemoryStorageAdapter["abortMultipartUpload"]>[0]) {
      if (this.failAbort) {
        this.failAbort = false;
        throw new Error("provider abort unavailable");
      }
      await super.abortMultipartUpload(input);
    }
  }
  const storage = new OnceFailingAbortStorage(() => NOW);
  const { persistence, service } = fixture(context, storage);
  const created = await service.createMultipartUpload("owner-1", {
    folderId: null, displayName: "abort-retry.pdf", mediaType: "application/pdf", sizeBytes: 3,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const original = persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id)!;
  await assert.rejects(
    service.abandonUpload("owner-1", created.file.id, multipartUploadVersion(original)),
    (error) => error instanceof DriveError && error.code === "storage_unavailable",
  );
  const restored = persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id)!;
  assert.equal(restored.state, "uploading");
  assert.equal(restored.revision, 2);
  assert.equal(storage.hasMultipartUpload(original.providerUploadId), true);
  await service.abandonUpload("owner-1", created.file.id, multipartUploadVersion(restored));
  assert.equal(storage.hasMultipartUpload(original.providerUploadId), false);
});

test("completion CAS prevents a concurrent stale abandon from aborting provider state", async (context) => {
  let releaseCompletion!: () => void;
  let observeCompletion!: () => void;
  const completionStarted = new Promise<void>((resolve) => { observeCompletion = resolve; });
  const completionRelease = new Promise<void>((resolve) => { releaseCompletion = resolve; });
  class GatedCompletionStorage extends InMemoryStorageAdapter {
    override async completeMultipartUpload(input: Parameters<InMemoryStorageAdapter["completeMultipartUpload"]>[0]) {
      observeCompletion();
      await completionRelease;
      await super.completeMultipartUpload(input);
    }
  }
  const storage = new GatedCompletionStorage(() => NOW);
  const { persistence, service } = fixture(context, storage);
  const created = await service.createMultipartUpload("owner-1", {
    folderId: null, displayName: "completion-race.pdf", mediaType: "application/pdf", sizeBytes: 3,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const upload = persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id)!;
  const staleVersion = multipartUploadVersion(upload);
  storage.putMultipartPart(upload.providerUploadId, 1, 3, "etag-1");
  const completion = service.completeMultipartUpload("owner-1", created.file.id, staleVersion);
  await completionStarted;
  assert.equal(
    persistence.repositories.multipartUploads!.findByFileId("owner-1", created.file.id)?.state,
    "completing",
  );
  await assert.rejects(
    service.abandonUpload("owner-1", created.file.id, staleVersion),
    (error) => error instanceof DriveError && error.code === "concurrent_change",
  );
  assert.equal(storage.hasMultipartUpload(upload.providerUploadId), true);
  releaseCompletion();
  assert.equal((await completion).state, "active");
});

test("legacy pending uploads remain truthful one-final-reupload compatibility", async (context) => {
  const { persistence, storage, service } = fixture(context);
  const legacy = await service.createUpload("owner-1", {
    folderId: null, displayName: "legacy.pdf", mediaType: "application/pdf", sizeBytes: 3,
    checksum: { algorithm: "md5", value: MD5 },
  });
  assert.equal((await service.getUploadStatus("owner-1", legacy.file.id)).kind, "legacy");
  assert.equal((await service.renewUploadAuthorization("owner-1", legacy.file.id)).method, "POST");
  await service.abandonUpload("owner-1", legacy.file.id);
  assert.equal(persistence.repositories.files.findById("owner-1", legacy.file.id), null);
  assert.equal(await storage.statObject(legacy.file.objectKey), null);
});
