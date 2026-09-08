import type { SqliteConfig } from "./config.js";
import type { SqliteDatabase } from "./database.js";
import { assertMigrationsCurrent, runMigrations } from "./migrations.js";
import { initializeLibrarySearchProjection } from "./search-projection.js";
import {
  assertRulesetAdmissionsCurrent,
  assertRuntimeRulesetIdentity,
  readRulesetAdmissionManifest,
  runRulesetAdmissions,
} from "./ruleset-admissions.js";

/** Explicit fresh-install/upgrade path. Production service startup remains read-only. */
export function initializeDatabase(database: SqliteDatabase, config: SqliteConfig) {
  const manifest = readRulesetAdmissionManifest(config.rulesetAdmissionsDirectory);
  assertRuntimeRulesetIdentity(manifest.current);
  const migrations = runMigrations(database, config.migrationsDirectory);
  const admissions = runRulesetAdmissions(database, config.rulesetAdmissionsDirectory);
  assertMigrationsCurrent(database, config.migrationsDirectory);
  assertRulesetAdmissionsCurrent(database, config.rulesetAdmissionsDirectory, manifest);
  const searchProjection = initializeLibrarySearchProjection(database);
  return { migrations, admissions, searchProjection };
}
