// production-readiness-audit.test.mjs
//
// Deterministic tests for the READ-ONLY production readiness auditor:
// CLI contract, result model, profiles, dependency propagation, parsers,
// secret-safety (adversarial + false-positive), mutation denylist, report
// rendering, and live-check evaluation against synthetic fixtures. No real
// production access and no real SSH anywhere in this suite.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ALLOWED_ENV_KEYS,
  SECRET_ENV_KEYS,
  certificateStatus,
  classifyDrift,
  cspAllowsFiles,
  parseCspHeader,
  parseDfPk,
  parseEnvSafe,
  parseJournalLines,
  parseListeners,
  parseMemoryEvents,
  parseMeminfo,
  parseReleaseManifest,
  parseSystemctlShow,
  remoteCommandStrings,
  runRepoChecks,
  TARGET,
} from "./lib/production-readiness/checks.mjs";
import { buildSshArgs, validateSshAlias, runLocalCommand } from "./lib/production-readiness/executors.mjs";
import { mapLimit, runLiveRemoteChecks, HEAVY_CHECK_MIN_MEM_AVAILABLE_KIB } from "./lib/production-readiness/live-checks.mjs";
import { computeOverall, createCheck, exitCodeFor, EXIT_CODES } from "./lib/production-readiness/model.mjs";
import { applyProfile, PROFILES } from "./lib/production-readiness/profiles.mjs";
import {
  evaluateCnameTargets,
  evaluateTlsEvidence,
  normalizeEndpoint,
  redirectsToOrigin,
} from "./lib/production-readiness/public-checks.mjs";
import { buildReport, renderReport } from "./lib/production-readiness/report.mjs";
import { assertSafeReport, findUnsafeValue, MUTATION_TOKENS, sanitizeRemoteUrl } from "./lib/production-readiness/safety.mjs";

const SCRIPT = fileURLToPath(new URL("./production-readiness-audit.mjs", import.meta.url));

// ---------------------------------------------------------------- CLI contract

test("--help prints the read-only contract", () => {
  const output = execFileSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8" });
  assert.match(output, /READ-ONLY/);
  assert.match(output, /--mode <repo\|public\|plan\|live>/);
  assert.match(output, /never deploys, repairs, restarts/);
});

test("plan mode makes no network calls and lists what live WOULD inspect", () => {
  const output = execFileSync(process.execPath, [SCRIPT, "--mode", "plan"], { encoding: "utf8" });
  assert.match(output, /Mode: plan/);
  assert.match(output, /no network, no SSH, no mutation/);
  assert.match(output, /Will NOT:/);
});

test("live mode without an ssh alias is a usage error", () => {
  assert.throws(() => {
    execFileSync(process.execPath, [SCRIPT, "--mode", "live"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }, (error) => /requires --ssh-alias/.test(String(error.stderr ?? "")));
});

test("invalid ssh aliases are rejected", () => {
  for (const alias of ["", "-o", "-oProxyCommand=x", "a b", "a;b", "a|b", "a&b", "a/b", "a\\b", "a\nb", "a'b"]) {
    assert.equal(validateSshAlias(alias), false, `must reject: ${JSON.stringify(alias)}`);
  }
  for (const alias of ["academiccloud-prod", "host_1.prod", "prod", "a1.b-c_d.e"]) {
    assert.equal(validateSshAlias(alias), true, `must accept: ${alias}`);
  }
});

test("ssh invocation never disables host checking or prompts, and the executable exists exactly once", () => {
  const args = buildSshArgs("academiccloud-prod", ["hostname"]);
  const joined = args.join(" ");
  assert.match(joined, /BatchMode=yes/);
  assert.match(joined, /StrictHostKeyChecking=yes/);
  assert.match(joined, /ConnectTimeout=10/);
  assert.doesNotMatch(joined, /StrictHostKeyChecking=no/);
  assert.doesNotMatch(joined, /UserKnownHostsFile=\/dev\/null/);
  // buildSshArgs returns ONLY options + remote args: the executable "ssh"
  // is supplied exactly once by runRemoteCheck — no "ssh ssh" double invocation.
  assert.equal(args.includes("ssh"), false);
  // Fixed remote arguments are POSIX-quoted for the remote login shell.
  assert.equal(args[args.length - 1], "'hostname'");
  const executorSource = readFileSync(new URL("./lib/production-readiness/executors.mjs", import.meta.url), "utf8");
  assert.equal((executorSource.match(/runExecFile\("ssh"/g) ?? []).length, 1, "ssh executable must appear exactly once");
});

// ---------------------------------------------------------------- mutation denylist

test("remote check allowlist contains no mutation operations", () => {
  const violations = [];
  for (const command of remoteCommandStrings()) {
    for (const token of MUTATION_TOKENS) {
      if (command.includes(token)) violations.push({ command, token });
    }
    assert.doesNotMatch(command, /curl\s+-X\s+(POST|PUT|PATCH|DELETE)/, command);
  }
  assert.deepEqual(violations, []);
});

test("database audit script is explicitly read-only", () => {
  const commands = remoteCommandStrings();
  const db = commands.find((command) => command.includes("better-sqlite3"));
  assert.ok(db, "db audit command exists");
  assert.match(db, /readonly: true, fileMustExist: true/);
  assert.doesNotMatch(db, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|VACUUM)\b/);
  const source = readFileSync(new URL("./lib/production-readiness/live-checks.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /--query|--sql/);
});

// ---------------------------------------------------------------- result model

test("check ids and statuses are validated", () => {
  assert.throws(() => createCheck({ id: "bad id", category: "x", status: "PASS", summary: "s" }), /invalid check id/);
  assert.throws(() => createCheck({ id: "OK", category: "x", status: "MAYBE", summary: "s" }), /invalid check status/);
  const check = createCheck({ id: "SAMPLE", category: "repo", status: "PASS", summary: "ok", evidence: {} });
  assert.equal(check.id, "SAMPLE");
});

test("READY / NOT_READY / INDETERMINATE are deterministic and separate from WARN", () => {
  const pass = createCheck({ id: "A", category: "x", requirement: "required", status: "PASS", summary: "s" });
  const fail = createCheck({ id: "B", category: "x", requirement: "required", status: "FAIL", summary: "s" });
  const unknown = createCheck({ id: "C", category: "x", requirement: "required", status: "UNKNOWN", summary: "s" });
  const warn = createCheck({ id: "D", category: "x", requirement: "advisory", status: "WARN", summary: "s" });

  assert.equal(computeOverall([pass, warn]).overall, "READY");
  assert.equal(computeOverall([pass, fail]).overall, "NOT_READY");
  assert.equal(computeOverall([pass, unknown]).overall, "INDETERMINATE");
  assert.equal(computeOverall([pass, unknown, fail]).overall, "NOT_READY");
  assert.equal(exitCodeFor("READY"), 0);
  assert.equal(exitCodeFor("NOT_READY"), EXIT_CODES.NOT_READY);
  assert.equal(exitCodeFor("INDETERMINATE"), EXIT_CODES.INDETERMINATE);
});

test("a required WARN/INFO never yields READY (READY means every required gate PASS)", () => {
  const pass = createCheck({ id: "A", category: "x", requirement: "required", status: "PASS", summary: "s" });
  for (const status of ["WARN", "INFO", "NOT_APPLICABLE"]) {
    const notPass = createCheck({ id: "B", category: "x", requirement: "required", status, summary: "s" });
    assert.equal(computeOverall([pass, notPass]).overall, "INDETERMINATE", `required ${status} must not be READY`);
  }
});

// ---------------------------------------------------------------- profiles

test("baseline treats an undeployed files domain as expected, ux01-ready does not", () => {
  const infoCheck = createCheck({
    id: "FILES_TLS_AVAILABLE", category: "tls", requirement: "informational", status: "INFO",
    summary: "files TLS unavailable", evidence: {},
  });
  const baseline = applyProfile(infoCheck, "baseline");
  assert.equal(baseline.status, "INFO");
  assert.equal(baseline.requirement, "informational");

  const ready = applyProfile(infoCheck, "ux01-ready");
  assert.equal(ready.status, "FAIL");
  assert.equal(ready.requirement, "required");
  assert.equal(computeOverall([ready]).overall, "NOT_READY");
  assert.equal(computeOverall([baseline]).overall, "READY");

  assert.deepEqual(PROFILES, ["baseline", "ux01-ready"]);
});

// ---------------------------------------------------------------- dependency propagation

const DOWN_SSH = async () => ({ ok: false, kind: "COMMAND_FAILED", stdout: "", stderr: "", exitCode: 255, durationMs: 1, limited: false });

test("SSH failure yields UNKNOWN (never FAIL) for dependent remote checks", async () => {
  const checks = await runLiveRemoteChecks({ runRemoteCheck: DOWN_SSH, sshAlias: "academiccloud-prod" });
  const connection = checks.find((check) => check.id === "SSH_CONNECTION");
  assert.equal(connection.status, "UNKNOWN");
  const service = checks.find((check) => check.id === "SERVICE_ACTIVE");
  assert.equal(service.status, "UNKNOWN");
  assert.equal(service.dependency, "SSH_CONNECTION");
  const overall = computeOverall(checks.map((check) => ({ ...check, requirement: check.requirement })));
  assert.equal(overall.overall, "INDETERMINATE");
});

// ---------------------------------------------------------------- parsers

test("meminfo / df / listeners / systemctl parsers", () => {
  assert.deepEqual(parseMeminfo("MemTotal:       916044 kB\nMemAvailable:   500000 kB\nSwapFree:     1048572 kB\n"), {
    MemTotal: 916044, MemAvailable: 500000, SwapFree: 1048572,
  });
  const disk = parseDfPk("Filesystem     1024-blocks     Used Available Capacity Mounted on\n/dev/vda1        20960256  6600000  13300000    34% /");
  assert.equal(disk.availKiB, 13300000);
  const show = parseSystemctlShow("ActiveState=active\nMainPID=1234\nNRestarts=0\nUnitFileState=disabled\n");
  assert.equal(show.ActiveState, "active");
  assert.equal(show.NRestarts, "0");
  const listeners = parseListeners("LISTEN 0 4096 127.0.0.1:3000 0.0.0.0:*\nLISTEN 0 4096 0.0.0.0:80 0.0.0.0:*");
  assert.deepEqual(listeners, [{ address: "127.0.0.1", port: 3000 }, { address: "0.0.0.0", port: 80 }]);
});

test("env safe parser collects only approved keys and never secret values", () => {
  const input = [
    "NODE_ENV=production",
    "APP_ORIGIN=https://cloud.ajtlab.top",
    "OSS_BROWSER_ENDPOINT=",
    "OSS_ACCESS_KEY_SECRET=super-secret-value",
    "PASSWORD=should-never-leak",
    "OSS_ENDPOINT=https://oss-ap-southeast-3.aliyuncs.com",
  ].join("\n");
  const parsed = parseEnvSafe(input);
  assert.equal(parsed.values.NODE_ENV, "production");
  assert.equal(parsed.values.APP_ORIGIN, "https://cloud.ajtlab.top");
  assert.equal(parsed.values.OSS_BROWSER_ENDPOINT, "");
  assert.equal(parsed.secrets.OSS_ACCESS_KEY_SECRET, "PRESENT");
  assert.equal(parsed.secrets.OSS_ACCESS_KEY_ID, "ABSENT");
  assert.equal(parsed.secrets.OSS_STS_TOKEN, "ABSENT");
  assert.equal("PASSWORD" in parsed.values, false);
  assert.equal(JSON.stringify(parsed).includes("super-secret-value"), false);
  assert.deepEqual([...ALLOWED_ENV_KEYS].filter((key) => key === "OSS_BROWSER_ENDPOINT"), ["OSS_BROWSER_ENDPOINT"]);
  assert.ok(SECRET_ENV_KEYS.includes("OSS_ACCESS_KEY_SECRET"));
});

test("CSP parser extracts directive structure and hostnames only", () => {
  const header = "default-src 'self'; img-src 'self' data: blob: https://bucket.oss-ap-southeast-3.aliyuncs.com; frame-src 'self' https://files.ajtlab.top";
  const parsed = parseCspHeader(header);
  assert.equal(parsed.present, true);
  assert.deepEqual(parsed.hostnames, ["bucket.oss-ap-southeast-3.aliyuncs.com", "files.ajtlab.top"]);
  assert.deepEqual(parseCspHeader(null).present, false);
});

test("journal / memory events / manifest / drift parsers", () => {
  assert.equal(parseJournalLines("one\ntwo\n\nthree\n"), 3);
  assert.deepEqual(parseMemoryEvents("oom 0\noom_kill 0\noom_group_kill 0\n"), { oom: 0, oom_kill: 0, oom_group_kill: 0 });
  const manifest = parseReleaseManifest(JSON.stringify({ sourceCommit: "a".repeat(40), platform: "linux", architecture: "x64", nodeVersion: "v24.19.0" }));
  assert.equal(manifest.sourceCommit, "a".repeat(40));
  assert.equal(parseReleaseManifest("not json"), null);
  assert.equal(classifyDrift("a".repeat(40), "a".repeat(40)).status, "PASS");
  assert.equal(classifyDrift("b".repeat(40), "a".repeat(40)).status, "WARN");
  assert.equal(classifyDrift(null, "a".repeat(40)).status, "UNKNOWN");
  assert.equal(certificateStatus(5), "FAIL");
  assert.equal(certificateStatus(20), "WARN");
  assert.equal(certificateStatus(45), "PASS");
});

// ---------------------------------------------------------------- secret safety

test("adversarial unsafe fixtures are detected", () => {
  const unsafe = [
    "OSS_ACCESS_KEY_SECRET=super-secret-value",
    "Authorization: Bearer abc123",
    "Cookie: __Host-ac_session=secret-session",
    "https://files.example.test/object?x-oss-signature=abc123",
    "objects/ab/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "$argon2id$v=19$m=65536,t=3,p=1$salt$hash",
    "passwordHash=abc123",
    "policy=eW91ci1zZWNyZXQtYmFzZTY0LXBvbGljeS1ibG9iLXZhbHVlLTEyMzQ1Ng==",
    "AGE-SECRET-KEY-1QWERTYUIOPASDFGH",
    "ghp_0123456789abcdefghijklmnopqrstuvw",
    "AKIAIOSFODNN7EXAMPLE",
  ];
  for (const value of unsafe) {
    assert.ok(findUnsafeValue(value), `must flag: ${value.slice(0, 30)}`);
  }
});

test("legitimate operational values are never redacted", () => {
  const safe = [
    "127.0.0.1:3000",
    "cloud.ajtlab.top",
    "files.ajtlab.top",
    "oss-ap-southeast-3",
    "active",
    "disabled",
    "schemaVersion=4",
    "HTTP 200",
    "TLSv1.3",
    "MemAvailable=505000",
    "a".repeat(40),
    "0.0.0.0:80",
    "releases",
    "EnvironmentFiles=/etc/academiccloud/academiccloud.env",
    "ExecStart={ path=/usr/bin/node ; argv[]=/usr/bin/node /opt/academiccloud/current/backend/dist/main.js }",
    "/opt/academiccloud/releases/e5217e8c73bab4941a56599b8be97a34ebf1e06b",
    "DNS:cloud.ajtlab.top",
  ];
  for (const value of safe) {
    assert.equal(findUnsafeValue(value), null, `must keep: ${value}`);
  }
});

test("serializer refuses unsafe evidence end-to-end without echoing it", () => {
  const check = createCheck({
    id: "LEAKY", category: "env", status: "PASS", summary: "leak",
    evidence: { secret: "OSS_ACCESS_KEY_SECRET=super-secret-value" },
  });
  assert.throws(
    () => buildReport({ mode: "repo", profile: "baseline", checks: [check], target: TARGET }),
    (error) => error.name === "REPORT_SAFETY_VIOLATION",
  );
});

test("safe reports serialize and sanitize remote URLs", () => {
  const check = createCheck({
    id: "OK", category: "repo", status: "PASS", summary: "fine",
    evidence: { remote: sanitizeRemoteUrl("git@github.com:owner/repo.git"), listener: "127.0.0.1:3000" },
  });
  const { report } = buildReport({ mode: "repo", profile: "baseline", checks: [check], target: TARGET });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.checks[0].evidence.remote.host, "github.com");
  assert.equal(sanitizeRemoteUrl("https://user:pass@github.com/owner/repo.git").password, undefined);
  assert.equal(sanitizeRemoteUrl("https://user:pass@github.com/owner/repo.git").host, "github.com");
  assert.equal(sanitizeRemoteUrl("garbage-url").transport, "unrecognized");
});

// ---------------------------------------------------------------- live fixture

const FIXTURE_OUTPUTS = {
  "hostname": "test-host",
  "grep PRETTY_NAME /etc/os-release": 'PRETTY_NAME="Ubuntu 24.04.2 LTS"',
  "uname -r": "6.8.0-63-generic",
  "uname -m": "x86_64",
  "nproc": "2",
  "uptime -p": "up 1 day",
  "stat -c %y /proc/1": "2026-08-15 00:31:26.000000000 +0800",
  "cat /proc/meminfo": "MemTotal:       916044 kB\nMemAvailable:   505000 kB\nSwapTotal:     1048572 kB\nSwapFree:     1048572 kB\n",
  "df -Pk /": "Filesystem     1024-blocks     Used Available Capacity Mounted on\n/dev/vda1        20960256  6600000  13300000    34% /",
  "ss -lnt": "LISTEN 0 4096 127.0.0.1:3000 0.0.0.0:*\nLISTEN 0 4096 0.0.0.0:80 0.0.0.0:*\nLISTEN 0 4096 0.0.0.0:443 0.0.0.0:*\nLISTEN 0 4096 0.0.0.0:22 0.0.0.0:*",
  "systemctl show academiccloud --property=LoadState --property=ActiveState --property=SubState --property=UnitFileState --property=MainPID --property=NRestarts --property=User --property=Group --property=WorkingDirectory --property=ExecStart --property=MemoryCurrent --property=MemoryPeak --property=MemoryHigh --property=MemoryMax --property=TasksCurrent --property=TasksMax --property=Restart --property=EnvironmentFiles":
    "LoadState=loaded\nActiveState=active\nSubState=running\nUnitFileState=disabled\nMainPID=44122\nNRestarts=0\nUser=academiccloud\nGroup=academiccloud\nWorkingDirectory=/opt/academiccloud/current/backend\nExecStart={ path=/usr/bin/node }\nMemoryCurrent=100528128\nMemoryPeak=160681984\nMemoryHigh=335544320\nMemoryMax=402653184\nTasksCurrent=4\nTasksMax=128\nRestart=on-failure\nEnvironmentFiles=/etc/academiccloud/academiccloud.env",
  "systemctl --failed --no-legend --no-pager": "",
  "curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3000/api/health": "200",
  "curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3000/api/ready": "200",
  "readlink -f /opt/academiccloud/current": "/opt/academiccloud/releases/e5217e8c73bab4941a56599b8be97a34ebf1e06b",
  "ls -1 /opt/academiccloud/releases": "639baa9596a17f4160521f31440d9e3ac3b12eda\ne5217e8c73bab4941a56599b8be97a34ebf1e06b",
  "readlink -f /etc/nginx/sites-enabled/academiccloud": "/etc/nginx/sites-available/academiccloud",
  "sha256sum /etc/nginx/sites-enabled/academiccloud": "0686a46171df93bead05ddbd2c9c2dbbbc5ba7846a118594c679971d19445447  /etc/nginx/sites-enabled/academiccloud",
  "sha256sum /etc/nginx/snippets/academiccloud-security-headers.conf": "d9a1125bb3e7492f03f4085162ce3a9c3b55048d6414a696f0d8df6a7ac9cad2  /etc/nginx/snippets/academiccloud-security-headers.conf",
  "grep -hE server_name|root |proxy_pass|ssl_protocols|client_max_body_size|return 301 /etc/nginx/sites-enabled/academiccloud":
    "server_name cloud.ajtlab.top;\nroot /opt/academiccloud/current/frontend/dist;\nproxy_pass http://127.0.0.1:3000;\nssl_protocols TLSv1.2 TLSv1.3;\nreturn 301 https://cloud.ajtlab.top$request_uri;",
  "grep -h Content-Security-Policy /etc/nginx/snippets/academiccloud-security-headers.conf":
    'add_header Content-Security-Policy "default-src \'self\'; img-src \'self\' https://ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com; frame-src \'self\'" always;',
  "grep -h Strict-Transport-Security /etc/nginx/snippets/academiccloud-security-headers.conf": "",
  "find /var/lib/academiccloud/backups -maxdepth 1 -type f -printf %T@\\n": "1780000000\n1780000001\n1780000002\n",
  "find /var/lib/academiccloud/backups -maxdepth 1 -type f -name *.age -printf %T@\\n": "1780000001\n1780000002\n",
  "find /var/lib/academiccloud/backups -maxdepth 1 -type f -name *.txt -printf %T@\\n": "1780000002\n",
  "stat -c %U:%G %a /etc/academiccloud/academiccloud-backup-age.pub": "root:root 600",
  "certbot --version": "certbot 2.9.0",
  "systemctl is-enabled certbot.timer": "disabled",
  "systemctl is-active certbot.timer": "inactive",
  "sh -c systemctl list-timers --all --no-legend --no-pager | grep -ci academiccloud": "0",
  "sh -c grep -riE academiccloud /etc/cron.d /etc/cron.daily /etc/cron.weekly /etc/crontab 2>/dev/null | wc -l": "0",
  "sh -c journalctl -u academiccloud --since=-24h -p err --no-pager | wc -l": "0",
  "sh -c journalctl -k -b --no-pager | grep -ciE 'out of memory|oom-kill'": "0",
  "cat /sys/fs/cgroup/system.slice/academiccloud.service/memory.events": "low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\noom_group_kill 0\n",
  "grep -cE status=5[0-9][0-9] /var/log/academiccloud/nginx-access.log": "0",
};

function fakeExecutorFor(outputs) {
  return async (_alias, args) => {
    const key = args.join(" ").replace(/\s+/g, " ").trim();
    for (const [pattern, output] of Object.entries(outputs)) {
      if (key.includes(pattern)) {
        return { ok: true, kind: "OK", stdout: output, stderr: "", exitCode: 0, durationMs: 1, limited: false };
      }
    }
    if (key.includes("sudo -n -u academiccloud test -w")) {
      return { ok: false, kind: "COMMAND_FAILED", stdout: "", stderr: "", exitCode: 1, durationMs: 1, limited: false };
    }
    if (key.includes("sudo -n node -e")) {
      if (key.includes("ARTIFACT-MANIFEST")) {
        return { ok: true, kind: "OK", stdout: JSON.stringify({ sourceCommit: "e5217e8c73bab4941a56599b8be97a34ebf1e06b", platform: "linux", architecture: "x64", nodeVersion: "v24.19.0" }), stderr: "", exitCode: 0, durationMs: 1, limited: false };
      }
      return {
        ok: true, kind: "OK", stdout: JSON.stringify({
          integrity: "ok", fkRows: 0, schemaVersion: 4,
          counts: { accounts: 1, sessions: 7, folders: 4, files: 6 },
          states: { pending_upload: 1, active: 5, deleted: 0, purging: 0, purged: 0 },
        }), stderr: "", exitCode: 0, durationMs: 1, limited: false,
      };
    }
    if (key.includes("sudo -n grep -E")) {
      return { ok: true, kind: "OK", stdout: "NODE_ENV=production\nAPP_ORIGIN=https://cloud.ajtlab.top\nOSS_BROWSER_ENDPOINT=\nOSS_BUCKET=ajt-academiccloud-kl-8f3c\nOSS_REGION=oss-ap-southeast-3\n", stderr: "", exitCode: 0, durationMs: 1, limited: false };
    }
    if (key.includes("sudo -n grep -cE")) {
      const count = key.includes("OSS_STS_TOKEN") ? "0" : "1";
      return { ok: true, kind: "OK", stdout: count, stderr: "", exitCode: 0, durationMs: 1, limited: false };
    }
    if (key.includes("test -f /etc/letsencrypt")) {
      return { ok: true, kind: "OK", stdout: "", stderr: "", exitCode: 0, durationMs: 1, limited: false };
    }
    if (key === "true") {
      return { ok: true, kind: "OK", stdout: "", stderr: "", exitCode: 0, durationMs: 1, limited: false };
    }
    return { ok: true, kind: "OK", stdout: "", stderr: "", exitCode: 0, durationMs: 1, limited: false };
  };
}

test("live checks evaluate a healthy synthetic baseline fixture deterministically", async () => {
  const repoChecks = [
    { id: "GIT_MIGRATION_FILES", category: "repo", evidence: { count: 4 } },
  ];
  const checks = await runLiveRemoteChecks({ runRemoteCheck: fakeExecutorFor(FIXTURE_OUTPUTS), sshAlias: "academiccloud-prod", repoChecks });
  const byId = new Map(checks.map((check) => [check.id, check]));

  assert.equal(byId.get("SSH_CONNECTION").status, "PASS");
  assert.equal(byId.get("SERVICE_ACTIVE").status, "PASS");
  assert.equal(byId.get("SERVICE_AUTOSTART_DISABLED").status, "WARN");
  assert.equal(byId.get("LISTENER_LOOPBACK_ONLY").status, "PASS");
  assert.equal(byId.get("RESOURCE_MEMORY_HEADROOM").status, "PASS");
  assert.equal(byId.get("RESOURCE_GUARD").status, "PASS");
  assert.equal(byId.get("HEALTH_LOOPBACK").status, "PASS");
  assert.equal(byId.get("DB_INTEGRITY").status, "PASS");
  assert.equal(byId.get("DB_FOREIGN_KEYS").status, "PASS");
  assert.equal(byId.get("DB_SCHEMA").status, "PASS");
  assert.equal(byId.get("RELEASE_SERVICE_WRITE_DENIED").status, "PASS");
  assert.equal(byId.get("BACKUP_PRESENT").status, "PASS");
  assert.equal(byId.get("CERTBOT_TIMER").status, "WARN");
  assert.equal(byId.get("FILES_BROWSER_ENDPOINT_CONFIGURED").status, "INFO");
  assert.equal(byId.get("ENV_SAFE_STATE").status, "PASS");
  assert.equal(byId.get("ENV_SAFE_STATE").evidence.secrets.OSS_ACCESS_KEY_ID, "PRESENT");
  assert.equal(byId.get("ENV_SAFE_STATE").evidence.secrets.OSS_STS_TOKEN, "ABSENT");
  assert.equal(byId.get("RELEASE_CURRENT").status, "PASS");

  const { report } = buildReport({ mode: "live", profile: "baseline", checks, target: TARGET });
  assert.equal(report.summary.overall, "READY");
  assert.equal(report.summary.warn, 3);
});

test("ux01-ready profile flips the undeployed files domain into required failures", async () => {
  const checks = await runLiveRemoteChecks({ runRemoteCheck: fakeExecutorFor(FIXTURE_OUTPUTS), sshAlias: "academiccloud-prod" });
  const { report } = buildReport({ mode: "live", profile: "ux01-ready", checks, target: TARGET });
  assert.equal(report.summary.overall, "NOT_READY");
  const endpoint = report.checks.find((check) => check.id === "FILES_BROWSER_ENDPOINT_CONFIGURED");
  assert.equal(endpoint.status, "FAIL");
  assert.equal(endpoint.requirement, "required");
});

// ---------------------------------------------------------------- repo checks + report

test("repo checks run locally with a fake git executor", async () => {
  const outputs = new Map([
    ["branch --show-current", "codex/prod-03c2"],
    ["rev-parse HEAD", "cd8ff25b02354fa70499c14c42a1f1c8f93e9d39"],
    ["status --porcelain", ""],
    ["remote get-url origin", "git@github.com:3532606730-svg/AcademicCloud.git"],
  ]);
  const fakeLocal = async (_executable, args) => {
    const key = args.join(" ");
    const output = outputs.get(key);
    if (output === undefined) return { ok: false, kind: "COMMAND_FAILED", stdout: "", stderr: "", exitCode: 1, durationMs: 1, limited: false };
    return { ok: true, kind: "OK", stdout: output, stderr: "", exitCode: 0, durationMs: 1, limited: false };
  };
  const checks = await runRepoChecks({ runLocalCommand: fakeLocal, repositoryPath: process.cwd() });
  const byId = new Map(checks.map((check) => [check.id, check]));
  assert.equal(byId.get("GIT_REPOSITORY").status, "PASS");
  assert.equal(byId.get("GIT_BRANCH").status, "PASS");
  assert.equal(byId.get("GIT_HEAD").status, "PASS");
  assert.equal(byId.get("GIT_WORKTREE_CLEAN").status, "PASS");
  assert.equal(byId.get("GIT_REMOTE_SAFE").evidence.remote.host, "github.com");
});

test("reports render deterministically in all formats", () => {
  const checks = [
    createCheck({ id: "B_CHECK", category: "repo", requirement: "required", status: "PASS", summary: "b" }),
    createCheck({ id: "A_CHECK", category: "repo", requirement: "advisory", status: "WARN", summary: "a" }),
  ];
  const { report } = buildReport({ mode: "repo", profile: "baseline", checks, target: TARGET });
  assert.deepEqual(report.checks.map((check) => check.id), ["A_CHECK", "B_CHECK"]);

  const json = renderReport(report, "json");
  assert.deepEqual(JSON.parse(json).summary.overall, "READY");

  const markdown = renderReport(report, "markdown");
  assert.match(markdown, /Overall: \*\*READY\*\*/);
  assert.match(markdown, /A_CHECK/);

  const both = renderReport(report, "both");
  assert.match(both, /```json/);
});

// ---------------------------------------------------------------- L1-OPS01R1 regressions

test("TLS is split: required validity gate + advisory expiry headroom", () => {
  const okEvidence = {
    ok: true, authorized: true, authorizationError: null, protocol: "TLSv1.3",
    subjectCn: "cloud.ajtlab.top", issuerCn: "YE1", altNames: "DNS:cloud.ajtlab.top",
    validFrom: "Aug 15 08:12:21 2026 GMT", validTo: new Date(Date.now() + 89 * 86_400_000).toISOString(),
  };
  const checks = evaluateTlsEvidence(okEvidence, "cloud.ajtlab.top");
  assert.equal(checks.find((check) => check.id === "TLS_CLOUD_VALID").status, "PASS");
  assert.equal(checks.find((check) => check.id === "TLS_CLOUD_EXPIRY_HEADROOM").status, "PASS");
  assert.equal(checks.find((check) => check.id === "TLS_CLOUD_VALID").requirement, "required");

  const expiring = evaluateTlsEvidence({
    ...okEvidence, validTo: new Date(Date.now() + 20 * 86_400_000).toISOString(),
  }, "cloud.ajtlab.top");
  assert.equal(expiring.find((check) => check.id === "TLS_CLOUD_VALID").status, "PASS");
  assert.equal(expiring.find((check) => check.id === "TLS_CLOUD_EXPIRY_HEADROOM").status, "WARN");

  const unauthorized = evaluateTlsEvidence({ ...okEvidence, authorized: false, authorizationError: "bad name" }, "cloud.ajtlab.top");
  assert.equal(unauthorized.find((check) => check.id === "TLS_CLOUD_VALID").status, "FAIL");
});

test("expected CNAME semantics: match, mismatch, and missing expectation", () => {
  const targets = ["pixie.porkbun.com."];
  assert.equal(evaluateCnameTargets(targets, "pixie.porkbun.com", "ux01-ready").status, "PASS");
  assert.equal(evaluateCnameTargets(targets, "OSS-TARGET.example", "ux01-ready").status, "FAIL");
  assert.equal(evaluateCnameTargets(targets, null, "ux01-ready").status, "UNKNOWN");
  assert.equal(evaluateCnameTargets(targets, null, "baseline").status, "INFO");
});

test("endpoint normalization: exact files-domain match only", () => {
  assert.equal(normalizeEndpoint("https://files.ajtlab.top/"), "https://files.ajtlab.top");
  assert.equal(normalizeEndpoint("https://files.ajtlab.top"), "https://files.ajtlab.top");
  assert.notEqual(normalizeEndpoint("https://evil.example"), "https://files.ajtlab.top");
});

test("CSP files-domain contract requires img-src AND frame-src", () => {
  const origin = "https://files.ajtlab.top";
  assert.equal(cspAllowsFiles({}, origin).satisfied, false, "none");
  assert.equal(cspAllowsFiles({ "connect-src": [origin] }, origin).satisfied, false, "connect-only");
  assert.equal(cspAllowsFiles({ "img-src": [origin] }, origin).satisfied, false, "img-only");
  assert.equal(cspAllowsFiles({ "frame-src": [origin] }, origin).satisfied, false, "frame-only");
  assert.equal(cspAllowsFiles({ "img-src": [origin], "frame-src": [origin] }, origin).satisfied, true, "both");
  assert.equal(cspAllowsFiles({ "default-src": [origin] }, origin).satisfied, false, "default-src does not count");
});

test("redirect origin uses exact URL origins, never prefixes", () => {
  assert.equal(redirectsToOrigin("https://cloud.ajtlab.top/", "https://cloud.ajtlab.top"), true);
  assert.equal(redirectsToOrigin("https://cloud.ajtlab.top.evil.example/", "https://cloud.ajtlab.top"), false);
  assert.equal(redirectsToOrigin("http://cloud.ajtlab.top/", "https://cloud.ajtlab.top"), false);
  assert.equal(redirectsToOrigin("not-a-url", "https://cloud.ajtlab.top"), false);
  assert.equal(redirectsToOrigin(null, "https://cloud.ajtlab.top"), false);
});

test("foreign-key violations flip DB_FOREIGN_KEYS to FAIL and NOT_READY", async () => {
  const outputs = { ...FIXTURE_OUTPUTS };
  const executor = fakeExecutorFor(outputs);
  const dbExecutor = async (alias, args) => {
    const key = args.join(" ").replace(/\s+/g, " ").trim();
    if (key.includes("sudo -n node -e") && !key.includes("ARTIFACT-MANIFEST")) {
      return { ok: true, kind: "OK", stdout: JSON.stringify({ integrity: "ok", fkRows: 3, schemaVersion: 4, counts: {}, states: {} }), stderr: "", exitCode: 0, durationMs: 1, limited: false };
    }
    return executor(alias, args);
  };
  const checks = await runLiveRemoteChecks({ runRemoteCheck: dbExecutor, sshAlias: "academiccloud-prod", repoChecks: [{ id: "GIT_MIGRATION_FILES", category: "repo", evidence: { count: 4 } }] });
  const byId = new Map(checks.map((check) => [check.id, check]));
  assert.equal(byId.get("DB_INTEGRITY").status, "PASS");
  assert.equal(byId.get("DB_FOREIGN_KEYS").status, "FAIL");
  const { report } = buildReport({ mode: "live", profile: "baseline", checks, target: TARGET });
  assert.equal(report.summary.overall, "NOT_READY");
});

test("schema expectation derives from repository migrations, not a constant", async () => {
  const base = { ...FIXTURE_OUTPUTS };
  const executor = fakeExecutorFor(base);
  const dbExecutor = async (alias, args) => {
    const key = args.join(" ").replace(/\s+/g, " ").trim();
    if (key.includes("sudo -n node -e") && !key.includes("ARTIFACT-MANIFEST")) {
      return { ok: true, kind: "OK", stdout: JSON.stringify({ integrity: "ok", fkRows: 0, schemaVersion: 4, counts: {}, states: {} }), stderr: "", exitCode: 0, durationMs: 1, limited: false };
    }
    return executor(alias, args);
  };
  const repoExpects4 = [{ id: "GIT_MIGRATION_FILES", category: "repo", evidence: { count: 4 } }];
  const repoExpects5 = [{ id: "GIT_MIGRATION_FILES", category: "repo", evidence: { count: 5 } }];

  const matchChecks = await runLiveRemoteChecks({ runRemoteCheck: dbExecutor, sshAlias: "x", repoChecks: repoExpects4 });
  assert.equal(matchChecks.find((check) => check.id === "DB_SCHEMA").status, "PASS");

  const driftChecks = await runLiveRemoteChecks({ runRemoteCheck: dbExecutor, sshAlias: "x", repoChecks: repoExpects5 });
  assert.equal(driftChecks.find((check) => check.id === "DB_SCHEMA").status, "FAIL");
});

test("release service-write denied is a separate required gate", async () => {
  const writableExecutor = async (alias, args) => {
    const key = args.join(" ");
    if (key.includes("sudo -n -u academiccloud test -w")) {
      return { ok: true, kind: "OK", stdout: "", stderr: "", exitCode: 0, durationMs: 1, limited: false };
    }
    return fakeExecutorFor(FIXTURE_OUTPUTS)(alias, args);
  };
  const checks = await runLiveRemoteChecks({ runRemoteCheck: writableExecutor, sshAlias: "x", repoChecks: [{ id: "GIT_MIGRATION_FILES", category: "repo", evidence: { count: 4 } }] });
  assert.equal(checks.find((check) => check.id === "RELEASE_SERVICE_WRITE_DENIED").status, "FAIL");
});

test("raw journal/cron output never crosses SSH (remote aggregation only)", () => {
  const commands = remoteCommandStrings();
  const journalErrors = commands.find((command) => command.includes("journalctl -u academiccloud"));
  assert.match(journalErrors, /\| wc -l$/, "journal errors must be aggregated remotely");
  const kernelOom = commands.find((command) => command.includes("journalctl -k"));
  assert.match(kernelOom, /grep -ciE/, "kernel OOM must be aggregated remotely");
  const cron = commands.find((command) => command.includes("cron.d"));
  assert.match(cron, /\| wc -l$/, "cron occurrences must be aggregated remotely");
  const timers = commands.find((command) => command.includes("list-timers"));
  assert.match(timers, /grep -ci academiccloud$/, "timer occurrences must be aggregated remotely");
});

test("resource guard skips heavy audits below the threshold and reports UNKNOWN", async () => {
  const lowMemory = {
    ...FIXTURE_OUTPUTS,
    "cat /proc/meminfo": `MemTotal:       916044 kB\nMemAvailable:   ${HEAVY_CHECK_MIN_MEM_AVAILABLE_KIB - 1} kB\nSwapTotal:     1048572 kB\nSwapFree:     1048572 kB\n`,
  };
  const checks = await runLiveRemoteChecks({ runRemoteCheck: fakeExecutorFor(lowMemory), sshAlias: "x", repoChecks: [{ id: "GIT_MIGRATION_FILES", category: "repo", evidence: { count: 4 } }] });
  const byId = new Map(checks.map((check) => [check.id, check]));
  assert.equal(byId.get("RESOURCE_GUARD").status, "WARN");
  assert.equal(byId.get("DB_INTEGRITY").status, "UNKNOWN");
  assert.equal(byId.get("DB_INTEGRITY").detail, "skipped by resource guard");
  assert.equal(byId.get("NO_ERROR_OOM_ACTIVITY").status, "UNKNOWN");
  const { report } = buildReport({ mode: "live", profile: "baseline", checks, target: TARGET });
  assert.equal(report.summary.overall, "INDETERMINATE");
});

test("SSH concurrency never exceeds 2", async () => {
  let concurrent = 0;
  let peak = 0;
  const slowFake = async (_alias, args) => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await new Promise((resolve) => setTimeout(resolve, 5));
    concurrent -= 1;
    return { ok: true, kind: "OK", stdout: args.join(" "), stderr: "", exitCode: 0, durationMs: 5, limited: false };
  };
  await runLiveRemoteChecks({ runRemoteCheck: slowFake, sshAlias: "x", repoChecks: [{ id: "GIT_MIGRATION_FILES", category: "repo", evidence: { count: 4 } }] });
  assert.ok(peak <= 2, `peak SSH concurrency ${peak} exceeded 2`);

  const items = Array.from({ length: 8 }, (_, index) => index);
  let localPeak = 0;
  let localConcurrent = 0;
  await mapLimit(items, 2, async (item) => {
    localConcurrent += 1;
    localPeak = Math.max(localPeak, localConcurrent);
    await new Promise((resolve) => setTimeout(resolve, 2));
    localConcurrent -= 1;
    return item;
  });
  assert.equal(localPeak, 2);
});

// ---------------------------------------------------------------- executor bounds

test("executor enforces timeouts, output caps, and real durations", async () => {
  const slow = await runLocalCommand(process.execPath, ["-e", "setTimeout(() => {}, 4000)"], { timeoutMs: 300 });
  assert.equal(slow.kind, "TIMEOUT");
  assert.ok(slow.durationMs >= 0, "duration must be a real measurement");

  const chatty = await runLocalCommand(process.execPath, ["-e", "process.stdout.write('x'.repeat(2000))"], { timeoutMs: 5000, maxStdoutBytes: 200 });
  assert.equal(chatty.kind, "OUTPUT_LIMIT_EXCEEDED");
  assert.equal(chatty.ok, false, "capped output must never look like success");
  assert.equal(chatty.stdout.length, 200);
  assert.ok(chatty.durationMs < 5000, "fast success duration must be far below the timeout");

  const quick = await runLocalCommand(process.execPath, ["-e", "process.stdout.write('ok')"], { timeoutMs: 5000 });
  assert.equal(quick.kind, "OK");
  assert.equal(quick.durationMs >= 0, true);
});
