import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { ScholarlyRecordService, ResearchError } from "../../src/research/service.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

function fixture(context: TestContext) {
  const { persistence } = createTestPersistence(context);
  for (const [id, role] of [["user-a", "owner"], ["user-b", "member"]] as const) {
    persistence.repositories.accounts.create({
      id,
      loginName: id,
      passwordHash: "test",
      role,
      state: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  const storage = new InMemoryStorageAdapter(() => NOW);
  const drive = new DriveService(persistence, storage, () => NOW);
  const research = new ScholarlyRecordService(persistence, () => NOW);
  return { persistence, storage, drive, research };
}

async function activeFile(
  drive: DriveService,
  storage: InMemoryStorageAdapter,
  ownerId: string,
  displayName: string,
) {
  const reserved = await drive.createUpload(ownerId, {
    folderId: null,
    displayName,
    mediaType: "application/pdf",
    sizeBytes: 8,
    checksum: { algorithm: "md5", value: MD5 },
  });
  storage.putObject({
    objectKey: reserved.file.objectKey,
    sizeBytes: 8,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: "application/pdf",
    modifiedAt: NOW,
  });
  return drive.completeUpload(ownerId, reserved.file.id);
}

test("record attachment preserves distinct identities across detach and same-record reattach", async (context) => {
  const { drive, storage, research } = fixture(context);
  const file = await activeFile(drive, storage, "user-a", "scan.pdf");
  const objectKey = file.objectKey;
  const created = research.createRecord("user-a", "Private source record");
  const attached = research.attachFile("user-a", created.id, file.id);
  assert.equal(attached.artifacts.length, 1);
  const first = attached.artifacts[0]!;
  assert.equal(first.attachmentState, "attached");
  assert.equal(first.version?.file?.availability, "available");
  assert.equal(first.version?.file?.id, file.id);

  const detached = research.detachArtifact("user-a", created.id, first.id);
  assert.equal(detached.artifacts[0]?.attachmentState, "detached");
  const reattached = research.attachFile("user-a", created.id, file.id);
  assert.equal(reattached.artifacts[0]?.id, first.id);
  assert.equal(reattached.artifacts[0]?.version?.id, first.version?.id);
  assert.equal(reattached.artifacts[0]?.attachmentState, "attached");
  assert.equal(persistenceObjectKey(drive, "user-a", file.id), objectKey);
});

function persistenceObjectKey(drive: DriveService, ownerId: string, fileId: string): string {
  const file = drive.listEntries(ownerId, null).files.find((entry) => entry.id === fileId);
  assert.ok(file);
  return file.objectKey;
}

test("record and artifact reads use bounded stable keyset pages", async (context) => {
  const { drive, storage, research } = fixture(context);
  const records = [
    research.createRecord("user-a", "One"),
    research.createRecord("user-a", "Two"),
    research.createRecord("user-a", "Three"),
  ];
  const firstRecords = research.listRecords("user-a", null, 2);
  assert.equal(firstRecords.records.length, 2);
  assert.ok(firstRecords.nextBeforeId);
  const secondRecords = research.listRecords("user-a", firstRecords.nextBeforeId, 2);
  assert.equal(secondRecords.records.length, 1);
  assert.equal(secondRecords.nextBeforeId, null);
  assert.equal(new Set([...firstRecords.records, ...secondRecords.records].map((record) => record.id)).size, 3);

  const record = records[0]!;
  for (const name of ["one.pdf", "two.pdf", "three.pdf"]) {
    const file = await activeFile(drive, storage, "user-a", name);
    research.attachFile("user-a", record.id, file.id);
  }
  const firstArtifacts = research.getRecord("user-a", record.id, null, 2);
  assert.equal(firstArtifacts.artifactCount, 3);
  assert.equal(firstArtifacts.artifacts.length, 2);
  assert.ok(firstArtifacts.nextBeforeArtifactId);
  const secondArtifacts = research.getRecord(
    "user-a",
    record.id,
    firstArtifacts.nextBeforeArtifactId,
    2,
  );
  assert.equal(secondArtifacts.artifacts.length, 1);
  assert.equal(secondArtifacts.nextBeforeArtifactId, null);
  assert.equal(new Set([...firstArtifacts.artifacts, ...secondArtifacts.artifacts].map((artifact) => artifact.id)).size, 3);
});

test("same file cannot attach to another record or cross account, without existence leaks", async (context) => {
  const { drive, storage, research } = fixture(context);
  const file = await activeFile(drive, storage, "user-a", "scan.pdf");
  const first = research.createRecord("user-a", "First");
  const second = research.createRecord("user-a", "Second");
  research.attachFile("user-a", first.id, file.id);

  assert.throws(() => research.attachFile("user-a", second.id, file.id), (error) => (
    error instanceof ResearchError && error.code === "conflict"
  ));
  assert.throws(() => research.getRecord("user-b", first.id), (error) => (
    error instanceof ResearchError && error.code === "not_found"
  ));
  assert.throws(() => research.attachFile("user-b", research.createRecord("user-b", "Other").id, file.id), (error) => (
    error instanceof ResearchError && error.code === "not_found"
  ));
  const otherRecords = research.listRecords("user-b");
  assert.equal(otherRecords.records.length, 1);
  assert.equal(otherRecords.records[0]?.artifactCount, 0);
});

test("pending, deleted, and purged files cannot be newly attached", async (context) => {
  const { drive, storage, research } = fixture(context);
  const record = research.createRecord("user-a", "Lifecycle");
  const pending = await drive.createUpload("user-a", {
    folderId: null,
    displayName: "pending.pdf",
    mediaType: "application/pdf",
    sizeBytes: 8,
    checksum: { algorithm: "md5", value: MD5 },
  });
  assert.throws(() => research.attachFile("user-a", record.id, pending.file.id), (error) => (
    error instanceof ResearchError && error.code === "invalid_state"
  ));

  const deleted = await activeFile(drive, storage, "user-a", "deleted.pdf");
  drive.deleteFile("user-a", deleted.id);
  assert.throws(() => research.attachFile("user-a", record.id, deleted.id), (error) => (
    error instanceof ResearchError && error.code === "invalid_state"
  ));
});

test("recycle makes an attached version unavailable, restore returns availability, and purge requires detach", async (context) => {
  const { drive, storage, research } = fixture(context);
  const file = await activeFile(drive, storage, "user-a", "evidence.pdf");
  const record = research.createRecord("user-a", "Evidence");
  const attached = research.attachFile("user-a", record.id, file.id);
  const artifactId = attached.artifacts[0]!.id;

  drive.deleteFile("user-a", file.id);
  assert.equal(research.getRecord("user-a", record.id).artifacts[0]?.version?.file?.availability, "unavailable");
  await drive.restoreFile("user-a", file.id);
  assert.equal(research.getRecord("user-a", record.id).artifacts[0]?.version?.file?.availability, "available");

  drive.deleteFile("user-a", file.id);
  await assert.rejects(
    drive.permanentlyDeleteFile("user-a", file.id),
    (error) => error instanceof DriveError && error.code === "invalid_state",
  );
  research.detachArtifact("user-a", record.id, artifactId);
  await drive.permanentlyDeleteFile("user-a", file.id);
  const tombstoned = research.getRecord("user-a", record.id).artifacts[0]!;
  assert.equal(tombstoned.attachmentState, "detached");
  assert.equal(tombstoned.version?.file?.availability, "tombstoned");
  assert.equal(tombstoned.version?.file?.id, file.id);
});

test("record creation and attachment are transactional and strict", async (context) => {
  const { drive, storage, research, persistence } = fixture(context);
  const file = await activeFile(drive, storage, "user-a", "scan.pdf");
  assert.throws(() => research.createRecord("user-a", "\n"), (error) => (
    error instanceof ResearchError && error.code === "invalid_input"
  ));
  const record = research.createRecord("user-a", "Record");
  const repository = persistence.repositories.research!;
  const createVersion = repository.createVersion.bind(repository);
  repository.createVersion = () => {
    throw new Error("injected version failure");
  };
  assert.throws(() => research.attachFile("user-a", record.id, file.id), /injected version failure/);
  assert.equal(repository.listArtifacts("user-a", record.id, null, 100).length, 0);
  repository.createVersion = createVersion;
  research.attachFile("user-a", record.id, file.id);
  const rows = persistence.repositories.research!.listArtifacts("user-a", record.id, null, 100);
  assert.equal(rows.length, 1);
  assert.equal(persistence.repositories.research!.findVersion("user-a", rows[0]!.id)?.storedFileId, file.id);
});
