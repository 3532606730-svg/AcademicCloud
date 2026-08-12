import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";

export type SqliteDatabase = BetterSqlite3.Database;

export function openSqliteDatabase(filename: string): SqliteDatabase {
  const resolvedFilename = filename === ":memory:" ? filename : resolve(filename);

  if (resolvedFilename !== ":memory:") {
    mkdirSync(dirname(resolvedFilename), { recursive: true });
  }

  const database = new Database(resolvedFilename, { timeout: 5_000 });

  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = FULL");
  database.pragma("trusted_schema = OFF");

  return database;
}

export function openSqliteDatabaseReadOnly(filename: string): SqliteDatabase {
  const resolvedFilename = resolve(filename);
  const database = new Database(resolvedFilename, {
    fileMustExist: true,
    readonly: true,
    timeout: 5_000,
  });

  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.pragma("query_only = ON");
  database.pragma("trusted_schema = OFF");

  return database;
}
