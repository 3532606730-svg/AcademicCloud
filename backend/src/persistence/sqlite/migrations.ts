import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SqliteDatabase } from "./database.js";

const MIGRATION_FILENAME = /^(\d{3,})_([a-z0-9][a-z0-9_-]*)\.sql$/;

interface Migration {
  version: number;
  name: string;
  checksum: string;
  sql: string;
}

interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
}

export interface MigrationResult {
  appliedVersions: number[];
  currentVersion: number;
}

function readMigrations(directory: string): Migration[] {
  const migrations = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => {
      const match = MIGRATION_FILENAME.exec(entry.name);

      if (!match) {
        throw new Error(`Invalid migration filename: ${entry.name}`);
      }

      const version = Number(match[1]);
      const sql = readFileSync(join(directory, entry.name), "utf8");

      if (!Number.isSafeInteger(version) || version < 1) {
        throw new Error(`Invalid migration version in ${entry.name}`);
      }

      if (!sql.trim()) {
        throw new Error(`Migration is empty: ${entry.name}`);
      }

      return {
        version,
        name: entry.name,
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    })
    .sort((left, right) => left.version - right.version);

  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index]?.version === migrations[index - 1]?.version) {
      throw new Error(`Duplicate migration version: ${migrations[index]?.version}`);
    }
  }

  return migrations;
}

function ensureMigrationTable(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
}

function readAppliedMigrations(database: SqliteDatabase): AppliedMigration[] {
  return database
    .prepare<[], AppliedMigration>(
      "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
    )
    .all();
}

function validateAppliedMigrations(
  migrations: Migration[],
  applied: AppliedMigration[],
  directory: string,
): void {
  const migrationsByVersion = new Map(migrations.map((migration) => [migration.version, migration]));

  for (const record of applied) {
    const migration = migrationsByVersion.get(record.version);

    if (!migration) {
      throw new Error(`Applied migration ${record.version} is missing from ${directory}`);
    }

    if (migration.name !== record.name || migration.checksum !== record.checksum) {
      throw new Error(`Applied migration ${record.version} does not match its recorded checksum`);
    }
  }
}

export function runMigrations(database: SqliteDatabase, directory: string): MigrationResult {
  const migrations = readMigrations(directory);
  ensureMigrationTable(database);
  const applied = readAppliedMigrations(database);
  validateAppliedMigrations(migrations, applied, directory);

  const latestAppliedVersion = applied.at(-1)?.version ?? 0;
  const pending = migrations.filter((migration) => !applied.some((record) => record.version === migration.version));

  if (pending.some((migration) => migration.version < latestAppliedVersion)) {
    throw new Error("Pending migrations cannot be inserted below the current schema version");
  }

  const insertMigration = database.prepare<[number, string, string]>(`
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `);

  for (const migration of pending) {
    database.transaction(() => {
      database.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, migration.checksum);
    }).immediate();
  }

  return {
    appliedVersions: pending.map((migration) => migration.version),
    currentVersion: migrations.at(-1)?.version ?? 0,
  };
}

export function assertMigrationsCurrent(database: SqliteDatabase, directory: string): MigrationResult {
  const migrations = readMigrations(directory);
  const migrationTable = database
    .prepare<[string], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get("schema_migrations");

  if (!migrationTable) {
    throw new Error("Database schema is not initialized; run db:migrate before dry-run maintenance");
  }

  const applied = readAppliedMigrations(database);
  validateAppliedMigrations(migrations, applied, directory);
  const pending = migrations.filter(
    (migration) => !applied.some((record) => record.version === migration.version),
  );

  if (pending.length > 0) {
    throw new Error("Database schema is not current; run db:migrate before dry-run maintenance");
  }

  return { appliedVersions: [], currentVersion: migrations.at(-1)?.version ?? 0 };
}
