import { AuthService } from "../auth/auth-service.js";
import { Argon2idPasswordHasher } from "../auth/password-hasher.js";
import { AccountAdministrationService } from "../accounts/account-administration-service.js";
import { AnnouncementService } from "../announcements/announcement-service.js";
import { DriveService } from "../drive/drive-service.js";
import { FavoriteService } from "../favorites/favorite-service.js";
import { AuditService } from "../audit/audit-service.js";
import { ScholarlyRecordService } from "../research/service.js";
import { LibraryService } from "../library/library-service.js";
import { CredentialResetService } from "../auth/credential-reset-service.js";
import type { SqliteConfig } from "../persistence/sqlite/config.js";
import { openSqliteDatabase } from "../persistence/sqlite/database.js";
import { assertMigrationsCurrent, runMigrations } from "../persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../persistence/sqlite/persistence.js";
import type { StorageAdapter } from "../storage/storage-adapter.js";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";

export async function createApplication(
  config: AppConfig,
  sqliteConfig: SqliteConfig,
  storage: StorageAdapter,
) {
  const database = openSqliteDatabase(sqliteConfig.databasePath);

  try {
    // Reviewed production model: backup -> stop -> release switch -> explicit
    // db:migrate:prod -> start. Production startup therefore NEVER applies
    // migrations — it fails closed when the schema is missing or not current.
    // Development/test keep the convenient automatic migration path.
    if (config.environment === "production") {
      assertMigrationsCurrent(database, sqliteConfig.migrationsDirectory);
    } else {
      runMigrations(database, sqliteConfig.migrationsDirectory);
    }
    const persistence = new SqlitePersistence(database);
    const passwordHasher = new Argon2idPasswordHasher();
    const authService = new AuthService({
      persistence,
      passwordHasher,
    });
    const accountAdministrationService = new AccountAdministrationService({ persistence, passwordHasher });
    const credentialResetService = new CredentialResetService({ persistence, passwordHasher });
    const announcementService = new AnnouncementService({ persistence });
    const driveService = new DriveService(persistence, storage);
    const libraryService = new LibraryService(persistence, driveService);
    const favoriteService = new FavoriteService(persistence);
    const auditService = new AuditService(persistence);
    const scholarlyRecordService = new ScholarlyRecordService(persistence);
    const app = await createApp({
      logger: { level: config.logLevel },
      auth: {
        service: authService,
        appOrigin: config.appOrigin,
        environment: config.environment,
      },
      accounts: { service: accountAdministrationService },
      credentialReset: { service: credentialResetService },
      announcements: { service: announcementService },
      drive: {
        service: driveService,
        completeUpload: (actor, fileId) => libraryService.completeDefaultUpload(actor, fileId),
      },
      favorites: { service: favoriteService },
      audit: { service: auditService },
      research: { service: scholarlyRecordService },
      libraries: { service: libraryService },
      readinessCheck: () => persistence.isReady(),
    });

    app.addHook("onClose", () => {
      persistence.close();
    });

    return app;
  } catch (error: unknown) {
    database.close();
    throw error;
  }
}
