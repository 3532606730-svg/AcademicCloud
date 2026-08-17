import type { AccountRepository } from "../auth/account-repository.js";
import type { SessionRepository } from "../auth/session-repository.js";
import type { InvitationRepository } from "../accounts/invitation-repository.js";
import type { AnnouncementRepository } from "../announcements/announcement-repository.js";
import type { FolderRepository, StoredFileRepository } from "../drive/repositories.js";
import type { RecycleRepository } from "../drive/recycle-repository.js";
import type { FavoriteRepository } from "../favorites/favorite-repository.js";
import type { AuditRepository } from "../audit/audit-repository.js";
import type { ScholarlyRepository } from "../research/repositories.js";
import type { LibraryRepository } from "../library/repositories.js";

export interface RepositorySet {
  accounts: AccountRepository;
  sessions: SessionRepository;
  invitations: InvitationRepository;
  announcements: AnnouncementRepository;
  folders: FolderRepository;
  files: StoredFileRepository;
  recycle: RecycleRepository;
  favorites: FavoriteRepository;
  audit: AuditRepository;
  research?: ScholarlyRepository;
  libraries: LibraryRepository;
}

export interface Persistence {
  repositories: RepositorySet;
  runInTransaction<T>(work: (repositories: RepositorySet) => T): T;
  isReady(): boolean;
  close(): void;
}
