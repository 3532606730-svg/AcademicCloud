import { loadSqliteConfig } from "./config.js";
import { openSqliteDatabase } from "./database.js";
import { initializeDatabase } from "./initialize.js";

const config = loadSqliteConfig();
const database = openSqliteDatabase(config.databasePath);
try {
  process.stdout.write(`${JSON.stringify(initializeDatabase(database, config))}\n`);
} finally {
  database.close();
}
