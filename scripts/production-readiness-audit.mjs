#!/usr/bin/env node
// production-readiness-audit.mjs
//
// READ-ONLY production readiness auditor for AcademicCloud.
//
// Modes:
//   repo    local repository only (DEFAULT; zero network)
//   public  repo + public DNS/TLS/HTTP(GET) observations (no SSH)
//   plan    print what live mode WOULD inspect (zero network)
//   live    repo + public + bounded read-only SSH checks (requires --ssh-alias)
//
// This tool NEVER deploys, repairs, restarts, enables, reloads, renews,
// deletes, or writes anything. There is deliberately no --fix/--apply mode.

import { writeFileSync } from "node:fs";

import { TARGET } from "./lib/production-readiness/checks.mjs";
import { runLocalCommand, runRemoteCheck, validateSshAlias } from "./lib/production-readiness/executors.mjs";
import { runLiveRemoteChecks } from "./lib/production-readiness/live-checks.mjs";
import { EXIT_CODES } from "./lib/production-readiness/model.mjs";
import { PROFILES } from "./lib/production-readiness/profiles.mjs";
import { normalizeHostname, runPublicChecks } from "./lib/production-readiness/public-checks.mjs";
import { buildReport, renderReport } from "./lib/production-readiness/report.mjs";
import { runRepoChecks } from "./lib/production-readiness/checks.mjs";

const USAGE = `AcademicCloud Production Readiness Auditor — READ-ONLY

Usage:
  node scripts/production-readiness-audit.mjs [options]

Options:
  --mode <repo|public|plan|live>   default: repo
  --profile <baseline|ux01-ready>  default: baseline
  --format <markdown|json|both>    default: markdown
  --ssh-alias <alias>              live mode only; conservative grammar
  --expected-files-cname <host>    ux01-ready DNS expectation (safe hostname)
  --output <path>                  write report to file (optional)
  --verbose                        show timings and check counts
  --help                           this help

This tool never deploys, repairs, restarts, enables, reloads, renews, deletes,
or writes anything. There is deliberately no --fix/--apply mode. Live mode uses
strict non-interactive SSH with a fixed read-only check allowlist and an
already-configured alias.

Exit codes:
  0  audit completed; required gates READY
  1  tool/usage error
  2  required gate FAIL (NOT_READY)
  3  no FAIL but a required gate UNKNOWN (INDETERMINATE)
`;

function fail(message) {
  process.stderr.write(`audit error: ${message}\n`);
  process.exitCode = EXIT_CODES.TOOL_ERROR;
  return null;
}

function parseArgs(argv) {
  const options = {
    mode: "repo",
    profile: "baseline",
    format: "markdown",
    sshAlias: null,
    expectedFilesCname: null,
    output: null,
    verbose: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === "--help" || raw === "-h") {
      options.help = true;
      continue;
    }
    if (raw === "--verbose") {
      options.verbose = true;
      continue;
    }
    if (!raw.startsWith("--")) {
      return fail(`unknown argument ${raw}`);
    }
    let name = raw;
    let value = null;
    const equals = raw.indexOf("=");
    if (equals > 0) {
      value = raw.slice(equals + 1);
      name = raw.slice(0, equals);
    }
    const takeValue = () => {
      if (value !== null) return value;
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) return null;
      index += 1;
      return next;
    };
    switch (name) {
      case "--mode": {
        const mode = takeValue();
        if (mode === null || !["repo", "public", "plan", "live"].includes(mode)) return fail(`invalid --mode ${mode}`);
        options.mode = mode;
        break;
      }
      case "--profile": {
        const profile = takeValue();
        if (profile === null || !PROFILES.includes(profile)) return fail(`invalid --profile ${profile}`);
        options.profile = profile;
        break;
      }
      case "--format": {
        const format = takeValue();
        if (format === null || !["markdown", "json", "both"].includes(format)) return fail(`invalid --format ${format}`);
        options.format = format;
        break;
      }
      case "--ssh-alias": {
        const alias = takeValue();
        if (alias === null || !validateSshAlias(alias)) return fail("invalid --ssh-alias (allowed: [A-Za-z0-9][A-Za-z0-9._-]*)");
        options.sshAlias = alias;
        break;
      }
      case "--expected-files-cname": {
        const hostname = takeValue();
        if (hostname === null || !/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(hostname)) {
          return fail("invalid --expected-files-cname (must be a plain hostname)");
        }
        options.expectedFilesCname = normalizeHostname(hostname);
        break;
      }
      case "--output": {
        const output = takeValue();
        if (output === null) return fail("--output requires a path");
        options.output = output;
        break;
      }
      default:
        return fail(`unknown argument ${name}`);
    }
  }
  if (options.mode === "live" && !options.sshAlias) {
    return fail("--mode live requires --ssh-alias <alias>");
  }
  return options;
}

function planText(options) {
  return `Production Readiness Audit Plan

Mode: plan (no network, no SSH, no mutation)

Local repository checks: 9
Public checks (DNS/TLS/HTTP-GET): ~13
SSH read-only remote checks (live mode): ~30
Privileged read-only checks (sudo -n): environment safe fields, release
  writability test, SQLite read-only aggregates
Database read-only checks: integrity, foreign keys, schema version, safe counts

Will NOT:
- authenticate to the application
- create sessions or store cookies
- write the database
- restart/reload/enable services
- change Nginx configuration
- change DNS or call Porkbun APIs
- call privileged OSS APIs or use AccessKeys
- print credentials, signed URLs, object keys, filenames, or hashes

SSH alias (live mode): ${options.sshAlias ?? "(not provided)"}
Profile: ${options.profile}
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) return;
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const started = Date.now();

  if (options.mode === "plan") {
    process.stdout.write(planText(options));
    return;
  }

  let checks = [];
  checks.push(...await runRepoChecks({ runLocalCommand }));

  if (options.mode === "public" || options.mode === "live") {
    checks.push(...await runPublicChecks({ expectedFilesCname: options.expectedFilesCname, profile: options.profile }));
  }

  if (options.mode === "live") {
    checks.push(...await runLiveRemoteChecks({ runRemoteCheck, sshAlias: options.sshAlias, repoChecks: checks, profile: options.profile }));
  }

  let outcome;
  try {
    outcome = buildReport({ mode: options.mode, profile: options.profile, checks, target: TARGET });
  } catch (error) {
    if (error?.name === "REPORT_SAFETY_VIOLATION") {
      process.stderr.write("audit error: REPORT_SAFETY_VIOLATION\n");
      process.exitCode = EXIT_CODES.TOOL_ERROR;
      return;
    }
    throw error;
  }

  let output;
  try {
    output = renderReport(outcome.report, options.format);
  } catch (error) {
    process.stderr.write(`audit error: ${error?.message ?? "report rendering failed"}\n`);
    process.exitCode = EXIT_CODES.TOOL_ERROR;
    return;
  }

  if (options.output) {
    writeFileSync(options.output, output, "utf8");
    if (!options.verbose) process.stdout.write(`report written to ${options.output}\n`);
  }
  if (options.output && options.verbose) {
    process.stdout.write(`report written to ${options.output}\n`);
    process.stdout.write(output);
  } else if (!options.output) {
    process.stdout.write(output);
    process.stdout.write("\n");
  }

  if (options.verbose) {
    process.stderr.write(`audit duration ${Date.now() - started} ms; checks ${checks.length}\n`);
  }

  process.exitCode = outcome.exitCode;
}

main().catch((error) => {
  process.stderr.write(`audit error: ${error?.message ?? "unexpected failure"}\n`);
  process.exitCode = EXIT_CODES.TOOL_ERROR;
});
