import { AuthService } from "../auth/auth-service.js";
import { Argon2idPasswordHasher } from "../auth/password-hasher.js";
import { DriveService } from "../drive/drive-service.js";
import type { SqliteConfig } from "../persistence/sqlite/config.js";
import { openSqliteDatabase } from "../persistence/sqlite/database.js";
import { runMigrations } from "../persistence/sqlite/migrations.js";
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
    runMigrations(database, sqliteConfig.migrationsDirectory);
    const persistence = new SqlitePersistence(database);
    const authService = new AuthService({
      accounts: persistence.repositories.accounts,
      sessions: persistence.repositories.sessions,
      passwordHasher: new Argon2idPasswordHasher(),
    });
    const driveService = new DriveService(persistence, storage);
    const app = await createApp({
      logger: { level: config.logLevel },
      auth: {
        service: authService,
        appOrigin: config.appOrigin,
        environment: config.environment,
      },
      drive: { service: driveService },
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
