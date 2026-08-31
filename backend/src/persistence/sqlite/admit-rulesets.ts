import { loadSqliteConfig } from "./config.js";
import { openSqliteDatabase } from "./database.js";
import { assertMigrationsCurrent } from "./migrations.js";
import { runRulesetAdmissions } from "./ruleset-admissions.js";

const config = loadSqliteConfig();
const database = openSqliteDatabase(config.databasePath);

try {
  assertMigrationsCurrent(database, config.migrationsDirectory);
  const result = runRulesetAdmissions(database, config.rulesetAdmissionsDirectory);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  database.close();
}
