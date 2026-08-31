import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadSqliteConfig } from "../persistence/sqlite/config.js";
import {
  createVerifiedBackupGeneration,
  verifyBackupReceipt,
} from "./backup-receipt.js";
import {
  type BackupRetentionCandidate,
  planBackupRetention,
} from "./backup-retention.js";
import { runIsolatedRestoreDrill } from "./isolated-restore-drill.js";

type Command =
  | { operation: "backup-create"; backup: string; receipt: string; sourceCommit: string | null }
  | { operation: "receipt-verify"; backup: string; receipt: string }
  | { operation: "retention-plan"; input: string }
  | { operation: "restore-drill"; backup: string; receipt: string };

async function main(): Promise<void> {
  const command = parseArguments(process.argv.slice(2));
  let output: unknown;

  if (command.operation === "backup-create") {
    const sqliteConfig = loadSqliteConfig(process.env);
    output = {
      status: "ok",
      operation: command.operation,
      ...await createVerifiedBackupGeneration(
        sqliteConfig.databasePath,
        sqliteConfig.migrationsDirectory,
        command.backup,
        command.receipt,
        {
          sourceCommit: command.sourceCommit,
        },
      ),
    };
  } else if (command.operation === "receipt-verify") {
    const sqliteConfig = loadSqliteConfig(process.env);
    const verified = await verifyBackupReceipt(
      command.backup,
      sqliteConfig.migrationsDirectory,
      command.receipt,
    );
    output = { status: "ok", operation: command.operation, ...verified };
  } else if (command.operation === "retention-plan") {
    const input = parseRetentionInput(command.input);
    output = {
      status: "ok",
      operation: command.operation,
      ...planBackupRetention(input.backups, input.now),
    };
  } else {
    const sqliteConfig = loadSqliteConfig(process.env);
    output = {
      operation: command.operation,
      ...await runIsolatedRestoreDrill({
        backupPath: command.backup,
        receiptPath: command.receipt,
        migrationsDirectory: sqliteConfig.migrationsDirectory,
        rulesetAdmissionsDirectory: sqliteConfig.rulesetAdmissionsDirectory,
        liveDatabasePath: sqliteConfig.databasePath,
      }),
    };
  }

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

export function parseArguments(arguments_: readonly string[]): Command {
  const [operation, ...rawOptions] = arguments_;
  if (!operation || !["backup-create", "receipt-verify", "retention-plan", "restore-drill"].includes(operation)) {
    throw new Error("invalid recovery preparation operation");
  }

  const options = new Map<string, string>();
  for (const raw of rawOptions) {
    const match = /^(--[a-z-]+)=(.+)$/.exec(raw);
    if (!match || options.has(match[1]!)) throw new Error("invalid recovery preparation argument");
    options.set(match[1]!, match[2]!);
  }

  const exactOptions = (...allowed: string[]) => {
    if ([...options.keys()].some((key) => !allowed.includes(key))) {
      throw new Error("unexpected recovery preparation argument");
    }
  };
  const required = (name: string) => {
    const value = options.get(name);
    if (!value) throw new Error("missing recovery preparation argument");
    return value;
  };
  if (operation === "backup-create") {
    exactOptions("--backup", "--receipt", "--source-commit");
    const sourceCommit = options.get("--source-commit") ?? null;
    return {
      operation,
      backup: required("--backup"),
      receipt: required("--receipt"),
      sourceCommit,
    };
  }
  if (operation === "receipt-verify") {
    exactOptions("--backup", "--receipt");
    return {
      operation,
      backup: required("--backup"),
      receipt: required("--receipt"),
    };
  }
  if (operation === "retention-plan") {
    exactOptions("--input");
    return { operation, input: required("--input") };
  }

  exactOptions("--backup", "--receipt");
  return {
    operation: "restore-drill",
    backup: required("--backup"),
    receipt: required("--receipt"),
  };
}

function parseRetentionInput(path: string): { now: Date; backups: BackupRetentionCandidate[] } {
  const resolved = resolve(path);
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 1_000_000) {
    throw new Error("retention input must be a bounded regular non-symlink file");
  }

  let input: unknown;
  try {
    input = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    throw new Error("retention input is invalid JSON");
  }
  if (!isRecord(input) || !hasExactKeys(input, ["backups", "now"]) || typeof input.now !== "string" || !Array.isArray(input.backups)) {
    throw new Error("retention input shape is invalid");
  }
  const now = new Date(input.now);
  if (!Number.isFinite(now.getTime()) || now.toISOString() !== input.now) {
    throw new Error("retention input time is invalid");
  }

  const backups = input.backups.map((value): BackupRetentionCandidate => {
    if (
      !isRecord(value)
      || !hasAllowedCandidateKeys(value)
      || typeof value.name !== "string"
      || typeof value.createdAt !== "string"
      || typeof value.sha256 !== "string"
      || typeof value.verified !== "boolean"
      || (value.lastKnownGood !== undefined && typeof value.lastKnownGood !== "boolean")
    ) {
      throw new Error("retention candidate shape is invalid");
    }
    return {
      name: value.name,
      createdAt: value.createdAt,
      sha256: value.sha256,
      verified: value.verified,
      ...(value.lastKnownGood === undefined ? {} : { lastKnownGood: value.lastKnownGood }),
    };
  });

  return { now, backups };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function hasAllowedCandidateKeys(record: Record<string, unknown>): boolean {
  const keys = Object.keys(record);
  return keys.every((key) => ["name", "createdAt", "sha256", "verified", "lastKnownGood"].includes(key))
    && ["name", "createdAt", "sha256", "verified"].every((key) => keys.includes(key));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('{"error":"operations_preparation_failed"}\n');
    process.exitCode = 1;
  });
}
