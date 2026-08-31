// Check definitions and parsers for the production readiness auditor.
//
// SAFETY MODEL
// - Remote commands are FIXED static argument arrays (allowlist); no user
//   input is ever interpolated; no shell is used locally.
// - HTTP methods are GET/HEAD only; no authentication, no cookies stored.
// - SQLite access is a fixed read-only script (readonly:true,
//   fileMustExist:true) that returns aggregates only.
// - The environment file is read only through fixed grep patterns for the
//   approved non-secret keys; secret keys are reported PRESENT/ABSENT only.
// - Privileged file reads use `sudo -n` (non-interactive); if unavailable the
//   dependent checks become UNKNOWN, never prompted.

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { createCheck } from "./model.mjs";
import { sanitizeRemoteUrl } from "./safety.mjs";

// Current deployment constants (operational target data, not expectations).
export const TARGET = Object.freeze({
  appOrigin: "https://cloud.ajtlab.top",
  appHostname: "cloud.ajtlab.top",
  filesDomain: "files.ajtlab.top",
  apexDomain: "ajtlab.top",
  ossBucket: "ajt-academiccloud-kl-8f3c",
  ossRegion: "oss-ap-southeast-3",
  serviceName: "academiccloud",
  databasePath: "/var/lib/academiccloud/academiccloud.sqlite",
  backupDirectory: "/var/lib/academiccloud/backups",
  releaseRoot: "/opt/academiccloud/releases",
  currentReleaseLink: "/opt/academiccloud/current",
  envFilePath: "/etc/academiccloud/academiccloud.env",
  nginxSite: "/etc/nginx/sites-enabled/academiccloud",
  nginxSnippet: "/etc/nginx/snippets/academiccloud-security-headers.conf",
  renewalConfig: "/etc/letsencrypt/renewal/cloud.ajtlab.top.conf",
  agePublicKey: "/etc/academiccloud/academiccloud-backup-age.pub",
});

export const LIMITS = Object.freeze({
  memoryHeadroomKiB: 128 * 1024,
  diskHeadroomKiB: 10 * 1024 * 1024,
  serviceMemoryHighKiB: 320 * 1024,
  serviceMemoryMaxKiB: 384 * 1024,
  swapWarnKiB: 256 * 1024,
  certificateFailDays: 7,
  certificateUrgentDays: 14,
  certificateWarnDays: 30,
});

export const ALLOWED_ENV_KEYS = Object.freeze([
  "NODE_ENV", "HOST", "PORT", "LOG_LEVEL", "APP_ORIGIN", "DATABASE_PATH",
  "MIGRATIONS_DIRECTORY", "RULESET_ADMISSIONS_DIRECTORY", "STORAGE_PROVIDER", "OSS_ENDPOINT", "OSS_REGION",
  "OSS_BUCKET", "OSS_BROWSER_ENDPOINT", "OSS_UPLOAD_AUTHORIZATION_SECONDS",
  "OSS_DOWNLOAD_AUTHORIZATION_SECONDS", "OSS_REQUEST_TIMEOUT_MILLISECONDS",
]);

export const SECRET_ENV_KEYS = Object.freeze([
  "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET", "OSS_STS_TOKEN",
]);

const ENV_KEY_PATTERN = new RegExp(`^(${[...ALLOWED_ENV_KEYS, ...SECRET_ENV_KEYS].join("|")})=`);

// ---------------------------------------------------------------- parsers

export function parseMeminfo(text) {
  const fields = {};
  for (const line of String(text).split("\n")) {
    const match = /^(\w+):\s+(\d+)\s+kB$/.exec(line.trim());
    if (match) fields[match[1]] = Number(match[2]);
  }
  return fields;
}

export function parseDfPk(text) {
  const lines = String(text).trim().split("\n");
  const data = lines[lines.length - 1] ?? "";
  const parts = data.trim().split(/\s+/);
  if (parts.length < 4) return null;
  return { filesystem: parts[0], sizeKiB: Number(parts[1]), usedKiB: Number(parts[2]), availKiB: Number(parts[3]) };
}

export function parseSystemctlShow(text) {
  const properties = {};
  for (const line of String(text).split("\n")) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    properties[line.slice(0, index)] = line.slice(index + 1);
  }
  return properties;
}

export function parseListeners(text) {
  const listeners = [];
  for (const line of String(text).split("\n")) {
    // ss -lnt columns: State Recv-Q Send-Q LocalAddress:Port PeerAddress:Port
    const fields = line.trim().split(/\s+/);
    const local = fields[3];
    if (!local) continue;
    const match = /^(\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|localhost):(\d{1,5})$/.exec(local);
    if (match) listeners.push({ address: match[1], port: Number(match[2]) });
  }
  return listeners;
}

export function parseEnvSafe(text) {
  const values = {};
  const secrets = {};
  const allowed = new Set(ALLOWED_ENV_KEYS);
  for (const key of SECRET_ENV_KEYS) secrets[key] = "ABSENT";
  for (const line of String(text).split("\n")) {
    if (!ENV_KEY_PATTERN.test(line)) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    const value = line.slice(index + 1).trim();
    if (SECRET_ENV_KEYS.includes(key)) {
      secrets[key] = value === "1" || value === "true" || value.length > 0 ? "PRESENT" : "ABSENT";
      continue;
    }
    if (allowed.has(key)) values[key] = value;
  }
  return { values, secrets };
}

export function parseCspHeader(header) {
  const directives = {};
  const hostnames = new Set();
  if (!header) return { directives, hostnames: [], present: false };
  for (const part of header.split(";")) {
    const index = part.indexOf(" ");
    if (index < 0) continue;
    const name = part.slice(0, index).trim().toLowerCase();
    const sources = part.slice(index).trim().split(/\s+/).filter(Boolean);
    directives[name] = sources;
    for (const source of sources) {
      const match = /^https?:\/\/([^/\s*]+)$/.exec(source);
      if (match) hostnames.add(match[1]);
    }
  }
  return { directives, hostnames: [...hostnames].sort(), present: true };
}

// UX01 contract: the files domain must appear in BOTH img-src and frame-src.
// Presence in connect-src/default-src/script-src is NOT sufficient.
export function cspAllowsFiles(directives, filesDomainOrigin) {
  const imgSrcAllows = (directives["img-src"] ?? []).includes(filesDomainOrigin);
  const frameSrcAllows = (directives["frame-src"] ?? []).includes(filesDomainOrigin);
  return { imgSrcAllows, frameSrcAllows, satisfied: imgSrcAllows && frameSrcAllows };
}

export function parseJournalLines(text) {
  return String(text).split("\n").filter((line) => line.trim().length > 0).length;
}

export function parseMemoryEvents(text) {
  const events = {};
  for (const line of String(text).split("\n")) {
    const [key, value] = line.trim().split(/\s+/);
    if (key && value !== undefined && /^\d+$/.test(value)) events[key] = Number(value);
  }
  return events;
}

export function parseReleaseManifest(text) {
  try {
    const manifest = JSON.parse(text);
    return {
      sourceCommit: typeof manifest.sourceCommit === "string" ? manifest.sourceCommit : null,
      platform: typeof manifest.platform === "string" ? manifest.platform : null,
      architecture: typeof manifest.architecture === "string" ? manifest.architecture : null,
      nodeVersion: typeof manifest.nodeVersion === "string" ? manifest.nodeVersion : null,
      bibliographyRulesetAdmission:
        manifest.bibliographyRulesetAdmission?.current
        && Number.isSafeInteger(manifest.bibliographyRulesetAdmission.current.contractVersion)
        && typeof manifest.bibliographyRulesetAdmission.current.rulesetVersion === "string"
        && typeof manifest.bibliographyRulesetAdmission.current.promptVersion === "string"
          ? { current: { ...manifest.bibliographyRulesetAdmission.current } }
          : null,
    };
  } catch {
    return null;
  }
}

// Repository migration-set semantics match the real migration engine: the
// numeric filename prefix IS the version, and currentVersion is the HIGHEST
// applied version — never the file count.
export const MIGRATION_FILENAME_PATTERN = /^(\d{3,})_.+\.sql$/;

export function parseMigrationVersions(names) {
  const versions = [];
  const malformed = [];
  for (const name of names) {
    const match = MIGRATION_FILENAME_PATTERN.exec(name);
    if (match) {
      const version = Number(match[1]);
      if (Number.isSafeInteger(version) && version > 0) {
        versions.push(version);
        continue;
      }
    }
    malformed.push(name);
  }
  return {
    versions: [...versions].sort((left, right) => left - right),
    maxVersion: versions.length > 0 ? Math.max(...versions) : null,
    malformed,
  };
}

export function classifyDrift(localHead, productionCommit) {
  if (!localHead || !productionCommit) return { status: "UNKNOWN", summary: "drift cannot be computed" };
  if (localHead === productionCommit) return { status: "PASS", summary: "repository HEAD equals production runtime" };
  return { status: "WARN", summary: "repository HEAD differs from production runtime (development ahead; expected until the next reviewed deployment)" };
}

export function certificateStatus(daysRemaining) {
  if (!Number.isFinite(daysRemaining)) return "UNKNOWN";
  if (daysRemaining <= LIMITS.certificateFailDays) return "FAIL";
  if (daysRemaining <= LIMITS.certificateWarnDays) return "WARN";
  return "PASS";
}

export function certificateUrgency(daysRemaining) {
  if (!Number.isFinite(daysRemaining)) return "unknown";
  if (daysRemaining <= LIMITS.certificateFailDays) return "critical-7-day";
  if (daysRemaining <= LIMITS.certificateUrgentDays) return "urgent-14-day";
  if (daysRemaining <= LIMITS.certificateWarnDays) return "warning-30-day";
  return "healthy";
}

// ---------------------------------------------------------------- remote check definitions
// FIXED allowlist. Every entry is reviewed static argv. Tests enforce the
// mutation denylist over these definitions.

const FIXED_REMOTE = {
  hostIdentity: [
    ["hostname"],
    ["grep", "PRETTY_NAME", "/etc/os-release"],
    ["uname", "-r"],
    ["uname", "-m"],
    ["nproc"],
    ["uptime", "-p"],
    ["stat", "-c", "%y", "/proc/1"],
  ],
  meminfo: [["cat", "/proc/meminfo"]],
  disk: [["df", "-Pk", "/"]],
  listeners: [["ss", "-lnt"]],
  serviceShow: [["systemctl", "show", "academiccloud", "--property=LoadState", "--property=ActiveState", "--property=SubState", "--property=UnitFileState", "--property=MainPID", "--property=NRestarts", "--property=User", "--property=Group", "--property=WorkingDirectory", "--property=ExecStart", "--property=MemoryCurrent", "--property=MemoryPeak", "--property=MemoryHigh", "--property=MemoryMax", "--property=TasksCurrent", "--property=TasksMax", "--property=Restart", "--property=RestartUSec", "--property=StartLimitIntervalUSec", "--property=StartLimitBurst", "--property=EnvironmentFiles"]],
  failedUnits: [["systemctl", "--failed", "--no-legend", "--no-pager"]],
  health: [["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "http://127.0.0.1:3000/api/health"]],
  ready: [["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "http://127.0.0.1:3000/api/ready"]],
  releaseTarget: [["readlink", "-f", "/opt/academiccloud/current"]],
  releaseList: [["ls", "-1", "/opt/academiccloud/releases"]],
  releaseWritable: [["sudo", "-n", "-u", "academiccloud", "test", "-w", "/opt/academiccloud/current"]],
  releaseManifest: [["sudo", "-n", "node", "-e", "const fs=require('fs');const m=JSON.parse(fs.readFileSync('/opt/academiccloud/current/ARTIFACT-MANIFEST.json','utf8'));console.log(JSON.stringify({sourceCommit:m.sourceCommit,platform:m.platform,architecture:m.architecture,nodeVersion:m.nodeVersion,bibliographyRulesetAdmission:m.bibliographyRulesetAdmission}));"]],
  nginxSiteExists: [["readlink", "-f", "/etc/nginx/sites-enabled/academiccloud"]],
  nginxSiteHash: [["sha256sum", "/etc/nginx/sites-enabled/academiccloud"]],
  nginxSnippetHash: [["sha256sum", "/etc/nginx/snippets/academiccloud-security-headers.conf"]],
  nginxSummary: [["grep", "-hE", "server_name|root |proxy_pass|ssl_protocols|client_max_body_size|return 301", "/etc/nginx/sites-enabled/academiccloud"]],
  cspLive: [["grep", "-h", "Content-Security-Policy", "/etc/nginx/snippets/academiccloud-security-headers.conf"]],
  hstsLive: [["grep", "-h", "Strict-Transport-Security", "/etc/nginx/snippets/academiccloud-security-headers.conf"]],
  envAllowed: [["sudo", "-n", "grep", "-E", `^(${ALLOWED_ENV_KEYS.join("|")})=`, "/etc/academiccloud/academiccloud.env"]],
  envSecretKeyId: [["sudo", "-n", "grep", "-cE", "^OSS_ACCESS_KEY_ID=", "/etc/academiccloud/academiccloud.env"]],
  envSecretKeySecret: [["sudo", "-n", "grep", "-cE", "^OSS_ACCESS_KEY_SECRET=", "/etc/academiccloud/academiccloud.env"]],
  envSecretSts: [["sudo", "-n", "grep", "-cE", "^OSS_STS_TOKEN=", "/etc/academiccloud/academiccloud.env"]],
  dbAudit: [["sudo", "-n", "node", "-e", `
const Database = require('/opt/academiccloud/current/node_modules/better-sqlite3');
const db = new Database('/var/lib/academiccloud/academiccloud.sqlite', { readonly: true, fileMustExist: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
const integrity = db.prepare('PRAGMA integrity_check').all().map(r => Object.values(r)[0]).join('|');
const fkRows = db.prepare('PRAGMA foreign_key_check').all().length;
const schemaVersion = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get().v;
const rulesetAdmissions = tables.includes('scholarly_bibliographic_ruleset_registry')
  ? db.prepare('SELECT contract_version AS contractVersion, ruleset_version AS rulesetVersion, prompt_version AS promptVersion FROM scholarly_bibliographic_ruleset_registry ORDER BY contract_version, ruleset_version').all()
  : [];
const counts = {};
for (const t of ['accounts','sessions','folders','files']) {
  if (tables.includes(t)) counts[t] = db.prepare('SELECT COUNT(*) AS c FROM ' + t).get().c;
}
const states = {};
if (tables.includes('files')) {
  for (const s of ['pending_upload','active','deleted','purging','purged']) {
    states[s] = db.prepare('SELECT COUNT(*) AS c FROM files WHERE state = ?').get(s).c;
  }
}
console.log(JSON.stringify({ integrity, fkRows, schemaVersion, rulesetAdmissions, counts, states }));
db.close();
`.replace(/\s+/g, " ").trim()]],
  backupFileCount: [["find", "/var/lib/academiccloud/backups", "-maxdepth", "1", "-type", "f", "-printf", "%T@\\n"]],
  backupAgeCount: [["find", "/var/lib/academiccloud/backups", "-maxdepth", "1", "-type", "f", "-name", "*.age", "-printf", "%T@\\n"]],
  backupManifestCount: [["find", "/var/lib/academiccloud/backups", "-maxdepth", "1", "-type", "f", "-name", "*.txt", "-printf", "%T@\\n"]],
  ageKeyStat: [["stat", "-c", "%U:%G %a", "/etc/academiccloud/academiccloud-backup-age.pub"]],
  certbotVersion: [["certbot", "--version"]],
  certbotTimerEnabled: [["systemctl", "is-enabled", "certbot.timer"]],
  certbotTimerActive: [["systemctl", "is-active", "certbot.timer"]],
  renewalConfig: [["test", "-f", "/etc/letsencrypt/renewal/cloud.ajtlab.top.conf"]],
  // Aggregation happens REMOTELY (fixed static pipelines, no user input, no
  // mutation): only numeric/small structural results cross SSH — raw
  // journal/cron/timer lines never enter the Node process.
  timers: [["sh", "-c", "systemctl list-timers --all --no-legend --no-pager | grep -ci academiccloud"]],
  cronAcademiccloud: [["sh", "-c", "grep -riE academiccloud /etc/cron.d /etc/cron.daily /etc/cron.weekly /etc/crontab 2>/dev/null | wc -l"]],
  // `-q` suppresses journalctl's piped "-- No entries --" placeholder, which
  // would otherwise be counted as one line by `wc -l` (false positive error).
  journalErrors: [["bash", "-o", "pipefail", "-c", "journalctl -q -u academiccloud --since=-24h -p err --no-pager --output=cat | awk 'END { print NR + 0 }'"]],
  journalKernelOom: [["bash", "-o", "pipefail", "-c", "journalctl -q -k -b --no-pager --output=cat | awk 'BEGIN { IGNORECASE=1 } /out of memory|oom-kill/ { count += 1 } END { print count + 0 }'"]],
  cgroupMemoryEvents: [["cat", "/sys/fs/cgroup/system.slice/academiccloud.service/memory.events"]],
  nginx5xx: [["grep", "-cE", "status=5[0-9][0-9]", "/var/log/academiccloud/nginx-access.log"]],
};

export const REMOTE_CHECK_DEFINITIONS = FIXED_REMOTE;
export { FIXED_REMOTE };

export function remoteCommandStrings() {
  return Object.values(FIXED_REMOTE).flat().map((argv) => argv.join(" "));
}

// ---------------------------------------------------------------- repo checks

export async function runRepoChecks({ runLocalCommand = null, repositoryPath = process.cwd(), now = () => new Date() } = {}) {
  const checks = [];
  const exec = runLocalCommand;
  const gitDirExists = existsSync(resolve(repositoryPath, ".git"));
  checks.push(createCheck({
    id: "GIT_REPOSITORY", category: "repo", requirement: "required",
    status: gitDirExists ? "PASS" : "FAIL",
    summary: gitDirExists ? "Git repository present" : "No .git directory found",
    evidence: {}, provenance: "LOCAL_FILESYSTEM", observedAt: now().toISOString(),
  }));

  const git = async (id, category, requirement, args, parse) => {
    if (!exec) return;
    const result = await exec("git", args);
    if (result.kind === "TIMEOUT" || result.kind === "COMMAND_FAILED") {
      checks.push(createCheck({
        id, category, requirement, status: "UNKNOWN",
        summary: `git ${args[0]} unavailable`, evidence: {}, provenance: "LOCAL_COMMAND",
        detail: result.kind, observedAt: now().toISOString(),
      }));
      return;
    }
    parse(result.stdout.trim());
  };

  await git("GIT_BRANCH", "repo", "required", ["branch", "--show-current"], (branch) => {
    checks.push(createCheck({
      id: "GIT_BRANCH", category: "repo", requirement: "required",
      status: branch ? "PASS" : "FAIL",
      summary: `current branch: ${branch || "(none)"}`,
      evidence: { branch }, provenance: "LOCAL_COMMAND", observedAt: now().toISOString(),
    }));
  });

  await git("GIT_HEAD", "repo", "required", ["rev-parse", "HEAD"], (head) => {
    checks.push(createCheck({
      id: "GIT_HEAD", category: "repo", requirement: "required",
      status: /^[0-9a-f]{40}$/.test(head) ? "PASS" : "FAIL",
      summary: `HEAD ${head}`,
      evidence: { head }, provenance: "LOCAL_COMMAND", observedAt: now().toISOString(),
    }));
  });

  await git("GIT_WORKTREE_CLEAN", "repo", "required", ["status", "--porcelain"], (status) => {
    const lines = status.split("\n").filter((line) => line.trim().length > 0);
    checks.push(createCheck({
      id: "GIT_WORKTREE_CLEAN", category: "repo", requirement: "required",
      status: lines.length === 0 ? "PASS" : "FAIL",
      summary: lines.length === 0 ? "working tree clean" : `working tree has ${lines.length} change(s)`,
      evidence: { changedEntryCount: lines.length }, provenance: "LOCAL_COMMAND", observedAt: now().toISOString(),
    }));
  });

  await git("GIT_REMOTE_SAFE", "repo", "advisory", ["remote", "get-url", "origin"], (raw) => {
    const sanitized = sanitizeRemoteUrl(raw);
    checks.push(createCheck({
      id: "GIT_REMOTE_SAFE", category: "repo", requirement: "advisory",
      status: sanitized?.transport === "unrecognized" ? "WARN" : "PASS",
      summary: `origin remote sanitized (${sanitized?.transport})`,
      evidence: { remote: sanitized ?? { transport: "absent" } }, provenance: "LOCAL_COMMAND", observedAt: now().toISOString(),
    }));
  });

  checks.push(createCheck({
    id: "GIT_PRODUCTION_WORKFLOW_PRESENT", category: "repo", requirement: "advisory",
    status: existsSync(resolve(repositoryPath, ".github/workflows/production-build.yml")) ? "PASS" : "FAIL",
    summary: "production-build workflow present",
    evidence: {}, provenance: "LOCAL_FILESYSTEM", observedAt: now().toISOString(),
  }));

  const migrationsDir = resolve(repositoryPath, "database/migrations");
  const migrations = existsSync(migrationsDir) ? readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort() : [];
  const migrationSet = parseMigrationVersions(migrations);
  checks.push(createCheck({
    id: "GIT_MIGRATION_FILES", category: "repo", requirement: "required",
    status: migrations.length >= 1 && migrationSet.malformed.length === 0 ? "PASS" : "FAIL",
    summary: migrationSet.malformed.length > 0
      ? `${migrationSet.malformed.length} malformed migration filename(s)`
      : `${migrations.length} migration file(s), max version ${migrationSet.maxVersion ?? "n/a"}`,
    evidence: {
      count: migrations.length,
      names: migrations,
      versions: migrationSet.versions,
      maxVersion: migrationSet.maxVersion,
      malformed: migrationSet.malformed,
    },
    provenance: "LOCAL_FILESYSTEM", observedAt: now().toISOString(),
  }));

  const doingDir = resolve(repositoryPath, "tasks/doing");
  const doingCount = existsSync(doingDir) ? readdirSync(doingDir).filter((name) => name.endsWith(".md")).length : 0;
  checks.push(createCheck({
    id: "GIT_CURRENT_TASK_PRESENT", category: "repo", requirement: "advisory",
    status: doingCount > 0 ? "PASS" : "WARN",
    summary: `${doingCount} task card(s) under tasks/doing`,
    evidence: { count: doingCount }, provenance: "LOCAL_FILESYSTEM", observedAt: now().toISOString(),
  }));

  checks.push(createCheck({
    id: "GIT_PRODUCTION_GATE_DOC_PRESENT", category: "repo", requirement: "advisory",
    status: existsSync(resolve(repositoryPath, "docs/deployment/l1-ux01-production-gate.md")) ? "PASS" : "WARN",
    summary: "production gate checklist document present",
    evidence: {}, provenance: "LOCAL_FILESYSTEM", observedAt: now().toISOString(),
  }));

  return checks;
}
