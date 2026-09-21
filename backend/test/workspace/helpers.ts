import type { TestContext } from "node:test";
import { DriveService } from "../../src/drive/drive-service.js";
import { LibraryService } from "../../src/library/library-service.js";
import { SqliteWorkspaceRepository } from "../../src/persistence/sqlite/workspace-repository.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createObjectKey } from "../../src/storage/object-key.js";
import { WorkspaceService } from "../../src/workspace/service.js";
import { createTestPersistence } from "../persistence/helpers.js";

export const NOW = new Date("2026-09-15T10:00:00Z");
export const OWNER = { id: "workspace-owner", loginName: "workspace-owner", role: "owner" as const };
export const MEMBER = { id: "workspace-member", loginName: "workspace-member", role: "member" as const };
export const OTHER = { id: "workspace-other", loginName: "workspace-other", role: "member" as const };
export const CHECKSUM = "AAAAAAAAAAAAAAAAAAAAAA==";

export function fixture(context: TestContext) {
  const { database, persistence, temporaryDirectory } = createTestPersistence(context);
  for (const actor of [OWNER, MEMBER, OTHER]) persistence.repositories.accounts.create({
    ...actor, passwordHash: "test:workspace-password", state: "active", createdAt: NOW, updatedAt: NOW,
  });
  const storage = new InMemoryStorageAdapter(() => NOW);
  const drive = new DriveService(persistence, storage, () => NOW);
  const libraries = new LibraryService(persistence, drive, () => NOW);
  const repository = new SqliteWorkspaceRepository(database);
  let serial = 0;
  const workspace = new WorkspaceService(persistence, repository, () => NOW, () => `research-${String(++serial).padStart(6, "0")}`);
  function file(id: string, accountId = MEMBER.id, mediaType = "application/pdf", libraryId?: string) {
    const domain = libraryId ? `library:${libraryId}` : `account:${accountId}`;
    const objectKey = createObjectKey();
    const time = NOW.toISOString();
    database.prepare(`INSERT INTO files (id, owner_domain_id, uploaded_by_account_id, display_name, storage_provider, object_key,
      media_type, size_bytes, checksum_algorithm, checksum, state, revision, created_at, updated_at, activated_at)
      VALUES (?, ?, ?, ?, 'memory', ?, ?, 42, 'md5', ?, 'active', 1, ?, ?, ?)`)
      .run(id, domain, accountId, `${id}.pdf`, objectKey, mediaType, CHECKSUM, time, time, time);
    storage.putObject({ objectKey, mediaType, sizeBytes: 42, checksumAlgorithm: "md5", checksum: CHECKSUM, etag: id, modifiedAt: NOW });
    if (libraryId) {
      database.prepare(`INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(`record-${id}`, domain, accountId, id, time, time);
      database.prepare(`INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
        VALUES (?, ?, ?, 'detached', ?, ?)`).run(`artifact-${id}`, domain, `record-${id}`, time, time);
      database.prepare(`INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(`version-${id}`, domain, `artifact-${id}`, id, time, time);
      database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run(`artifact-${id}`);
    }
    return persistence.repositories.files.findCurrentDocumentSource(id)!;
  }
  function sharedFile(id = "shared-source") {
    const library = libraries.createLibrary(OWNER, "Research group");
    libraries.addMember(OWNER, library.id, MEMBER.id, "member");
    return { library, source: file(id, OWNER.id, "application/pdf", library.id) };
  }
  return { database, persistence, temporaryDirectory, storage, drive, libraries, repository, workspace, file, sharedFile };
}
