import { loadSqliteConfig } from "../persistence/sqlite/config.js";
import { parseBackupArguments } from "./backup-options.js";
import { createDatabaseBackup, verifyDatabaseBackup } from "./database-backup.js";

async function main(): Promise<void> {
  const command = parseBackupArguments(process.argv.slice(2));
  const sqliteConfig = loadSqliteConfig(process.env);
  const summary = command.operation === "create"
    ? await createDatabaseBackup(
        sqliteConfig.databasePath,
        sqliteConfig.migrationsDirectory,
        command.path,
      )
    : await verifyDatabaseBackup(command.path, sqliteConfig.migrationsDirectory);

  process.stdout.write(`${JSON.stringify({ status: "ok", operation: command.operation, ...summary })}\n`);
}

main().catch(() => {
  process.stderr.write('{"error":"backup_operation_failed"}\n');
  process.exitCode = 1;
});
