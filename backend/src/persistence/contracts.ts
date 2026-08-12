import type { AccountRepository } from "../auth/account-repository.js";
import type { SessionRepository } from "../auth/session-repository.js";
import type { FolderRepository, StoredFileRepository } from "../drive/repositories.js";

export interface RepositorySet {
  accounts: AccountRepository;
  sessions: SessionRepository;
  folders: FolderRepository;
  files: StoredFileRepository;
}

export interface Persistence {
  repositories: RepositorySet;
  runInTransaction<T>(work: (repositories: RepositorySet) => T): T;
  close(): void;
}
