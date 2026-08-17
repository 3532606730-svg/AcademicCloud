import type { Persistence, RepositorySet } from "../contracts.js";
import { SqliteAccountRepository } from "./account-repository.js";
import { SqliteInvitationRepository } from "./invitation-repository.js";
import { SqliteAnnouncementRepository } from "./announcement-repository.js";
import type { SqliteDatabase } from "./database.js";
import { openSqliteDatabase } from "./database.js";
import { SqliteFavoriteRepository } from "./favorite-repository.js";
import { SqliteFolderRepository } from "./folder-repository.js";
import { SqliteRecycleRepository } from "./recycle-repository.js";
import { SqliteSessionRepository } from "./session-repository.js";
import { SqliteStoredFileRepository } from "./stored-file-repository.js";
import { SqliteAuditRepository } from "./audit-repository.js";
import { SqliteScholarlyRepository } from "./scholarly-repository.js";
import { SqliteLibraryRepository } from "./library-repository.js";
import { SqliteContributionRepository } from "./contribution-repository.js";

export class SqlitePersistence implements Persistence {
  readonly repositories: RepositorySet;
  readonly #database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.#database = database;
    this.repositories = {
      accounts: new SqliteAccountRepository(database),
      sessions: new SqliteSessionRepository(database),
      invitations: new SqliteInvitationRepository(database),
      announcements: new SqliteAnnouncementRepository(database),
      folders: new SqliteFolderRepository(database),
      files: new SqliteStoredFileRepository(database),
      recycle: new SqliteRecycleRepository(database),
      favorites: new SqliteFavoriteRepository(database),
      audit: new SqliteAuditRepository(database),
      research: new SqliteScholarlyRepository(database),
      libraries: new SqliteLibraryRepository(database),
      contributions: new SqliteContributionRepository(database),
    };
  }

  runInTransaction<T>(work: (repositories: RepositorySet) => T): T {
    return this.#database.transaction(() => work(this.repositories)).immediate();
  }

  isReady(): boolean {
    return this.#database.prepare<[], { ready: number }>("SELECT 1 AS ready").get()?.ready === 1;
  }

  close(): void {
    this.#database.close();
  }
}

export function openSqlitePersistence(filename: string): SqlitePersistence {
  return new SqlitePersistence(openSqliteDatabase(filename));
}
