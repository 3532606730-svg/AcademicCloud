import type { AccountRepository } from "../auth/account-repository.js";
import type { FolderRepository, StoredFileRepository } from "../drive/repositories.js";

export interface RepositorySet {
  accounts: AccountRepository;
  folders: FolderRepository;
  files: StoredFileRepository;
}

export interface Persistence {
  repositories: RepositorySet;
  runInTransaction<T>(work: (repositories: RepositorySet) => T): T;
  close(): void;
}
