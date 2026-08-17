import type { AccountRepository } from "../auth/account-repository.js";
import type { SessionRepository } from "../auth/session-repository.js";
import type { InvitationRepository } from "../accounts/invitation-repository.js";
import type { FolderRepository, StoredFileRepository } from "../drive/repositories.js";
import type { RecycleRepository } from "../drive/recycle-repository.js";
import type { FavoriteRepository } from "../favorites/favorite-repository.js";

export interface RepositorySet {
  accounts: AccountRepository;
  sessions: SessionRepository;
  invitations: InvitationRepository;
  folders: FolderRepository;
  files: StoredFileRepository;
  recycle: RecycleRepository;
  favorites: FavoriteRepository;
}

export interface Persistence {
  repositories: RepositorySet;
  runInTransaction<T>(work: (repositories: RepositorySet) => T): T;
  isReady(): boolean;
  close(): void;
}
