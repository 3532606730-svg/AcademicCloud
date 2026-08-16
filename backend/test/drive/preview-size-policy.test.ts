import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { NewAccount } from "../../src/auth/account.js";
import { DriveError, DriveService } from "../../src/drive/drive-service.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-12T08:00:00.000Z");
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";
const MIB = 1024 * 1024;

const PDF_LIMIT = 512 * MIB;
const IMAGE_LIMIT = 128 * MIB;
const TEXT_LIMIT = 16 * MIB;

class MutableStorage extends InMemoryStorageAdapter {
  constructor() {
    super(() => NOW);
  }
}

function fixture(context: TestContext) {
  const { persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({
    id: "owner-1",
    loginName: "owner-1",
    passwordHash: "test",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies NewAccount);
  const storage = new MutableStorage();
  const service = new DriveService(persistence, storage, () => NOW);
  return { persistence, storage, service };
}

async function createActiveFile(
  service: DriveService,
  storage: MutableStorage,
  input: { displayName: string; mediaType: string; sizeBytes: number },
) {
  const result = await service.createUpload("owner-1", {
    folderId: null,
    displayName: input.displayName,
    mediaType: input.mediaType,
    sizeBytes: input.sizeBytes,
    checksum: { algorithm: "md5", value: MD5 },
  });
  const objectKey = result.upload.fields.key!;
  storage.putObject({
    objectKey,
    sizeBytes: input.sizeBytes,
    etag: "etag",
    checksumAlgorithm: "md5",
    checksum: MD5,
    mediaType: input.mediaType,
    modifiedAt: NOW,
  });
  await service.completeUpload("owner-1", result.file.id);
  return result.file;
}

test("inline preview allows exactly the per-media-type limit", async (context) => {
  const { service, storage } = fixture(context);
  const file = await createActiveFile(service, storage, {
    displayName: "paper.pdf",
    mediaType: "application/pdf",
    sizeBytes: PDF_LIMIT,
  });
  const authorization = await service.createDownload("owner-1", file.id, "inline");
  assert.match(decodeURIComponent(authorization.url), /disposition=inline/);
});

test("one byte above the limit rejects inline with preview_too_large", async (context) => {
  const { service, storage } = fixture(context);
  const file = await createActiveFile(service, storage, {
    displayName: "paper.pdf",
    mediaType: "application/pdf",
    sizeBytes: PDF_LIMIT + 1,
  });
  await assert.rejects(
    () => service.createDownload("owner-1", file.id, "inline"),
    (error: unknown) => error instanceof DriveError && error.code === "preview_too_large",
  );
});

test("attachment download stays available above the inline limit", async (context) => {
  const { service, storage } = fixture(context);
  const file = await createActiveFile(service, storage, {
    displayName: "paper.pdf",
    mediaType: "application/pdf",
    sizeBytes: PDF_LIMIT + 1,
  });
  const authorization = await service.createDownload("owner-1", file.id);
  assert.match(decodeURIComponent(authorization.url), /disposition=attachment/);
});

test("image and text media use their own limits", async (context) => {
  const { service, storage } = fixture(context);

  const image = await createActiveFile(service, storage, {
    displayName: "photo.png",
    mediaType: "image/png",
    sizeBytes: IMAGE_LIMIT,
  });
  await service.createDownload("owner-1", image.id, "inline");

  const imageOver = await createActiveFile(service, storage, {
    displayName: "big.jpg",
    mediaType: "image/jpeg",
    sizeBytes: IMAGE_LIMIT + 1,
  });
  await assert.rejects(
    () => service.createDownload("owner-1", imageOver.id, "inline"),
    (error: unknown) => error instanceof DriveError && error.code === "preview_too_large",
  );

  const text = await createActiveFile(service, storage, {
    displayName: "notes.txt",
    mediaType: "text/plain",
    sizeBytes: TEXT_LIMIT,
  });
  await service.createDownload("owner-1", text.id, "inline");

  const textOver = await createActiveFile(service, storage, {
    displayName: "notes-big.txt",
    mediaType: "text/plain",
    sizeBytes: TEXT_LIMIT + 1,
  });
  await assert.rejects(
    () => service.createDownload("owner-1", textOver.id, "inline"),
    (error: unknown) => error instanceof DriveError && error.code === "preview_too_large",
  );
});

test("unsafe media types remain rejected independently of size", async (context) => {
  const { service, storage } = fixture(context);
  const svg = await createActiveFile(service, storage, {
    displayName: "diagram.svg",
    mediaType: "image/svg+xml",
    sizeBytes: 8,
  });
  await assert.rejects(
    () => service.createDownload("owner-1", svg.id, "inline"),
    (error: unknown) => error instanceof DriveError && error.code === "invalid_state",
  );
});
