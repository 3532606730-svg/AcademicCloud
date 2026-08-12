import { resolve } from "node:path";

export interface SqliteConfig {
  databasePath: string;
  migrationsDirectory: string;
}

function readPath(name: string, value: string | undefined, fallback: string, workingDirectory: string): string {
  const candidate = value?.trim() || fallback;

  if (candidate.includes("\0")) {
    throw new Error(`${name} must not contain a null byte`);
  }

  return resolve(workingDirectory, candidate);
}

export function loadSqliteConfig(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
): SqliteConfig {
  return {
    databasePath: readPath(
      "DATABASE_PATH",
      environment.DATABASE_PATH,
      "../database/academiccloud.sqlite",
      workingDirectory,
    ),
    migrationsDirectory: readPath(
      "MIGRATIONS_DIRECTORY",
      environment.MIGRATIONS_DIRECTORY,
      "../database/migrations",
      workingDirectory,
    ),
  };
}
