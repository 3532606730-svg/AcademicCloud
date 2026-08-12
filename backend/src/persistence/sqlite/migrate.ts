import { loadSqliteConfig } from "./config.js";
import { openSqliteDatabase } from "./database.js";
import { runMigrations } from "./migrations.js";

const config = loadSqliteConfig();
const database = openSqliteDatabase(config.databasePath);

try {
  const result = runMigrations(database, config.migrationsDirectory);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  database.close();
}
