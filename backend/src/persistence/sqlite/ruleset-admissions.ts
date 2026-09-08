import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { INTELLIGENT_BIBLIOGRAPHY_PIPELINE_VERSION, INTELLIGENT_BIBLIOGRAPHY_PROMPT_VERSION } from "@academiccloud/compute-contracts";

import type { SqliteDatabase } from "./database.js";

const ADMISSION_FILENAME = /^\d{3,}_[a-z0-9][a-z0-9_-]*\.sql$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

export interface BibliographicRulesetIdentity {
  contractVersion: number;
  rulesetVersion: string;
  promptVersion: string;
}

interface RulesetAdmission extends BibliographicRulesetIdentity {
  filename: string;
  sha256: string;
}

export interface RulesetAdmissionManifest {
  schemaVersion: 1;
  current: BibliographicRulesetIdentity;
  admissions: RulesetAdmission[];
}

export interface RulesetAdmissionResult {
  admitted: string[];
  alreadyAdmitted: string[];
  current: BibliographicRulesetIdentity;
}

interface RegistryRow {
  contract_version: number;
  ruleset_version: string;
  prompt_version: string;
}

interface SchemaState {
  migrationCount: number;
  migrationVersion: number;
  sqliteSchemaVersion: number;
}

export function readRulesetAdmissionManifest(directory: string): RulesetAdmissionManifest {
  const raw: unknown = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
  if (!isObject(raw) || raw.schemaVersion !== 1 || !isIdentity(raw.current) || !Array.isArray(raw.admissions)) {
    throw new Error("Ruleset admission manifest is invalid");
  }
  const current = copyIdentity(raw.current);

  const admissions = raw.admissions.map((value, index) => {
    if (!isObject(value)
      || typeof value.filename !== "string"
      || !ADMISSION_FILENAME.test(value.filename)
      || typeof value.sha256 !== "string"
      || !SHA256.test(value.sha256)
      || !isIdentity(value)) {
      throw new Error(`Ruleset admission manifest entry ${index} is invalid`);
    }
    return {
      filename: value.filename,
      sha256: value.sha256,
      contractVersion: value.contractVersion,
      rulesetVersion: value.rulesetVersion,
      promptVersion: value.promptVersion,
    };
  });

  const filenames = new Set(admissions.map((entry) => entry.filename));
  const rulesets = new Set(admissions.map((entry) => entry.rulesetVersion));
  if (filenames.size !== admissions.length || rulesets.size !== admissions.length || admissions.length === 0) {
    throw new Error("Ruleset admission manifest contains duplicate or empty admissions");
  }

  const diskSqlFiles = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  const declaredSqlFiles = [...filenames].sort();
  if (JSON.stringify(diskSqlFiles) !== JSON.stringify(declaredSqlFiles)) {
    throw new Error("Ruleset admission SQL assets do not exactly match the manifest");
  }

  for (const admission of admissions) {
    const sql = readFileSync(join(directory, admission.filename));
    const sha256 = createHash("sha256").update(sql).digest("hex");
    if (sha256 !== admission.sha256) {
      throw new Error(`Ruleset admission checksum mismatch: ${admission.filename}`);
    }
  }

  if (!admissions.some((entry) => identitiesEqual(entry, current))) {
    throw new Error("Current ruleset identity is not declared by an admission asset");
  }

  return {
    schemaVersion: 1,
    current,
    admissions,
  };
}

export function runRulesetAdmissions(
  database: SqliteDatabase,
  directory: string,
): RulesetAdmissionResult {
  const manifest = readRulesetAdmissionManifest(directory);
  assertRuntimeRulesetIdentity(manifest.current);
  const before = readSchemaState(database);
  const admitted: string[] = [];
  const alreadyAdmitted: string[] = [];

  for (const admission of manifest.admissions) {
    const sql = readFileSync(join(directory, admission.filename), "utf8");
    const outcome = database.transaction(() => {
      const existing = readRegistryRow(database, admission.rulesetVersion);
      if (existing) {
        assertRegistryIdentity(existing, admission);
        return "already" as const;
      }

      database.exec(sql);
      const inserted = readRegistryRow(database, admission.rulesetVersion);
      if (!inserted) {
        throw new Error(`Ruleset admission did not create ${admission.rulesetVersion}`);
      }
      assertRegistryIdentity(inserted, admission);
      return "admitted" as const;
    }).immediate();

    (outcome === "admitted" ? admitted : alreadyAdmitted).push(admission.rulesetVersion);
  }

  const after = readSchemaState(database);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("Ruleset admission must not change physical schema or migration history");
  }
  assertRulesetAdmissionsCurrent(database, directory, manifest);
  return { admitted, alreadyAdmitted, current: manifest.current };
}

export function assertRulesetAdmissionsCurrent(
  database: SqliteDatabase,
  directory: string,
  existingManifest?: RulesetAdmissionManifest,
): BibliographicRulesetIdentity {
  const manifest = existingManifest ?? readRulesetAdmissionManifest(directory);
  assertRuntimeRulesetIdentity(manifest.current);
  for (const admission of manifest.admissions) {
    const row = readRegistryRow(database, admission.rulesetVersion);
    if (!row) {
      throw new Error(`Bibliographic ruleset admission is not current: ${admission.rulesetVersion}`);
    }
    assertRegistryIdentity(row, admission);
  }
  return manifest.current;
}

/** Runtime authority is compiled into Core; a self-consistent historical manifest is not sufficient. */
export function assertRuntimeRulesetIdentity(identity: BibliographicRulesetIdentity): void {
  if (identity.contractVersion !== 1
    || identity.rulesetVersion !== INTELLIGENT_BIBLIOGRAPHY_PIPELINE_VERSION
    || identity.promptVersion !== INTELLIGENT_BIBLIOGRAPHY_PROMPT_VERSION) {
    throw new Error("Bibliographic ruleset manifest does not match the current runtime");
  }
}

/** Bounded live readiness check; callers cache the verified release manifest at startup. */
export function assertRuntimeRulesetReady(database: SqliteDatabase, expected: BibliographicRulesetIdentity): void {
  assertRuntimeRulesetIdentity(expected);
  const row = readRegistryRow(database, expected.rulesetVersion);
  if (!row) throw new Error("Bibliographic runtime admission is missing");
  assertRegistryIdentity(row, expected);
}

function readRegistryRow(database: SqliteDatabase, rulesetVersion: string): RegistryRow | undefined {
  return database.prepare<[string], RegistryRow>(`
    SELECT contract_version, ruleset_version, prompt_version
      FROM scholarly_bibliographic_ruleset_registry
     WHERE ruleset_version = ?
  `).get(rulesetVersion);
}

function assertRegistryIdentity(row: RegistryRow, expected: BibliographicRulesetIdentity): void {
  if (row.contract_version !== expected.contractVersion
    || row.ruleset_version !== expected.rulesetVersion
    || row.prompt_version !== expected.promptVersion) {
    throw new Error(`Conflicting bibliographic ruleset admission: ${expected.rulesetVersion}`);
  }
}

function readSchemaState(database: SqliteDatabase): SchemaState {
  const migration = database.prepare<[], { migration_count: number; migration_version: number }>(`
    SELECT COUNT(*) AS migration_count, COALESCE(MAX(version), 0) AS migration_version
      FROM schema_migrations
  `).get();
  const schema = database.prepare<[], { schema_version: number }>("PRAGMA schema_version").get();
  if (!migration || !schema) throw new Error("Unable to read database schema state");
  return {
    migrationCount: migration.migration_count,
    migrationVersion: migration.migration_version,
    sqliteSchemaVersion: schema.schema_version,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentity(value: unknown): value is BibliographicRulesetIdentity {
  return isObject(value)
    && Number.isSafeInteger(value.contractVersion)
    && Number(value.contractVersion) > 0
    && typeof value.rulesetVersion === "string"
    && /^l1-intelligent-library01-v\d+$/u.test(value.rulesetVersion)
    && typeof value.promptVersion === "string"
    && /^l1-intelligent-library01-prompt-v\d+$/u.test(value.promptVersion);
}

function identitiesEqual(left: BibliographicRulesetIdentity, right: BibliographicRulesetIdentity): boolean {
  return left.contractVersion === right.contractVersion
    && left.rulesetVersion === right.rulesetVersion
    && left.promptVersion === right.promptVersion;
}

function copyIdentity(value: BibliographicRulesetIdentity): BibliographicRulesetIdentity {
  return {
    contractVersion: value.contractVersion,
    rulesetVersion: value.rulesetVersion,
    promptVersion: value.promptVersion,
  };
}
