import { loadSqliteConfig } from "../persistence/sqlite/config.js";
import { openSqliteDatabase, openSqliteDatabaseReadOnly } from "../persistence/sqlite/database.js";
import { assertMigrationsCurrent, runMigrations } from "../persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../persistence/sqlite/persistence.js";
import { loadConfig } from "../platform/config.js";
import { loadStorageAdapter } from "../storage/config.js";
import { parseMaintenanceArguments } from "./options.js";
import { ReliabilityMaintenance } from "./reliability-maintenance.js";

async function main(): Promise<void> {
  const maintenanceOptions = parseMaintenanceArguments(process.argv.slice(2));
  const environment = process.env;
  const appConfig = loadConfig(environment);
  const sqliteConfig = loadSqliteConfig(environment);
  const database = maintenanceOptions.apply
    ? openSqliteDatabase(sqliteConfig.databasePath)
    : openSqliteDatabaseReadOnly(sqliteConfig.databasePath);

  try {
    if (maintenanceOptions.apply) {
      runMigrations(database, sqliteConfig.migrationsDirectory);
    } else {
      assertMigrationsCurrent(database, sqliteConfig.migrationsDirectory);
    }
    const persistence = new SqlitePersistence(database);
    const storage = loadStorageAdapter(environment, appConfig.environment);
    const result = await new ReliabilityMaintenance(persistence, storage).run(
      maintenanceOptions,
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    database.close();
  }
}

main().catch(() => {
  process.stderr.write('{"error":"maintenance_failed"}\n');
  process.exitCode = 1;
});
