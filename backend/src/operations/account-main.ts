import { existsSync } from "node:fs";

import { Argon2idPasswordHasher } from "../auth/password-hasher.js";
import { loadSqliteConfig } from "../persistence/sqlite/config.js";
import { openSqliteDatabase } from "../persistence/sqlite/database.js";
import { assertMigrationsCurrent } from "../persistence/sqlite/migrations.js";
import { SqlitePersistence } from "../persistence/sqlite/persistence.js";
import { parseAccountProvisionArguments } from "./account-options.js";
import { provisionAccount } from "./account-provision.js";

async function main(): Promise<void> {
  const options = parseAccountProvisionArguments(process.argv.slice(2));
  const sqliteConfig = loadSqliteConfig(process.env);
  const password = options.passwordSource.type === "stdin"
    ? await readPasswordFromStdin()
    : process.env[options.passwordSource.name];

  if (!password) {
    throw new Error("password input is missing");
  }

  if (options.passwordSource.type === "environment") {
    delete process.env[options.passwordSource.name];
  }

  if (!existsSync(sqliteConfig.databasePath)) {
    throw new Error("database must be migrated before account provisioning");
  }

  const database = openSqliteDatabase(sqliteConfig.databasePath);

  try {
    assertMigrationsCurrent(database, sqliteConfig.migrationsDirectory);
    const persistence = new SqlitePersistence(database);
    const account = await provisionAccount(
      persistence,
      new Argon2idPasswordHasher(),
      options.loginName,
      password,
    );
    process.stdout.write(`${JSON.stringify({ status: "ok", account })}\n`);
  } finally {
    database.close();
  }
}

async function readPasswordFromStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let input = "";

  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 1_026) throw new Error("password input is too long");
  }

  const password = input.endsWith("\r\n") ? input.slice(0, -2) : input.endsWith("\n") ? input.slice(0, -1) : input;
  if (password.includes("\n") || password.includes("\r")) {
    throw new Error("password input must contain one line");
  }

  return password;
}

main().catch(() => {
  process.stderr.write('{"error":"account_provision_failed"}\n');
  process.exitCode = 1;
});
