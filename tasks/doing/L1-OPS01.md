## Task ID

L1-OPS01 — Read-Only Production Readiness Auditor

## Goal

Build a reusable, repository-owned, READ-ONLY production readiness auditor
(`scripts/production-readiness-audit.mjs` + focused modules) that turns the
manual inspection workflow into deterministic, testable, secret-safe
automation for future deployments, pre/post-deployment checks, upgrades,
certificate work, DNS/custom-domain changes, backup verification, incident
triage, and release drift detection — on an isolated branch, never touching
`codex/prod-03c2`.

## Scope

- CLI with `--mode repo|public|plan|live` (default repo = zero network),
  `--profile baseline|ux01-ready`, `--format markdown|json|both`,
  `--output`, `--verbose`, strict `--ssh-alias` grammar
- fixed remote check allowlist (static argv, POSIX-quoted), mutation denylist
  test, bounded timeouts/output caps, dependency propagation (SSH failure ⇒
  dependent checks UNKNOWN)
- deterministic result model (PASS/FAIL/WARN/UNKNOWN/INFO/NOT_APPLICABLE;
  required/advisory/informational; READY/NOT_READY/INDETERMINATE; exit codes
  0/1/2/3; no fake percentages)
- structural secret safety: env values via fixed grep for approved keys,
  secret keys PRESENT/ABSENT only; SQLite `readonly:true` aggregates only;
  HTTP GET-only; final `assertSafeReport` serializer with adversarial +
  false-positive tests
- parsers: meminfo, df, listeners, systemctl show, env-safe, CSP, journal
  counts, memory.events, release manifest, drift classification, certificate
  thresholds
- profiles: baseline (files domain intentionally undeployed = INFO) vs
  ux01-ready (files DNS/TLS/env/CSP = required PASS)
- documentation, task card, package scripts (`ops:audit`, `test:ops-audit`)

## Non-goals

- any production mutation, live SSH, DNS/OSS/TLS/systemd/Nginx/DB changes
- product code changes, new dependencies, telemetry, history database
- PROD04B integration (the auditor does NOT become a dependency of the UX01
  production gate yet); PROD04B remains independently executable
- Layer 2 concepts

## Architecture

`scripts/production-readiness-audit.mjs` (CLI) +
`scripts/lib/production-readiness/`: `model.mjs` (status/aggregation/exit
codes), `profiles.mjs` (baseline/ux01-ready rules), `safety.mjs`
(`assertSafeReport`, mutation denylist, URL sanitizer), `executors.mjs`
(bounded execFile + strict ssh builder + alias grammar), `checks.mjs`
(FIXED_REMOTE allowlist, parsers, repo checks), `public-checks.mjs`
(DNS/TLS/HTTP-GET/CSP), `live-checks.mjs` (remote evaluation with dependency
propagation), `report.mjs` (deterministic markdown/json rendering + safety
gate).

## Threat model

No local shell for user input; alias grammar-validated; fixed POSIX-quoted
remote allowlist; denylist test; BatchMode + StrictHostKeyChecking=yes;
sudo -n non-interactive; GET-only HTTP; readonly SQLite; structural
secret-safe evidence; final serializer refusal (`REPORT_SAFETY_VIOLATION`
without echoing).

## Acceptance Criteria

- [x] isolated branch `codex/l1-ops01-readiness-auditor` created from exactly `cd8ff25…`; `codex/prod-03c2` untouched
- [x] default (repo) and plan modes make zero network calls; live mode implemented but NOT run against production
- [x] SSH input cannot inject options/commands; remote checks fixed allowlist; mutation denylist tests pass
- [x] HTTP methods GET/HEAD only; SQL read-only; env secret values never collected
- [x] final report safety assertion exists and is adversarially tested; safe values not over-redacted
- [x] deterministic result model, READY/NOT_READY/INDETERMINATE, exit codes locked by tests
- [x] parsers + profile semantics + dependency propagation tested with synthetic fixtures (24/24 tests)
- [x] docs + task card + package scripts added; branch pushed; no merge into production branch

## Completed

- Initial implementation (isolated branch, 24/24 tests, pushed as `8bc6a2b`).
- **L1-OPS01R1 review repairs**: fixed the double-`ssh` execution contract (`buildSshArgs` now returns options+quoted remote args only; the executable exists exactly once); READY now requires EVERY required gate PASS (required WARN/INFO/UNKNOWN ⇒ INDETERMINATE); TLS split into required `TLS_CLOUD_VALID` + advisory `TLS_CLOUD_EXPIRY_HEADROOM`; `--expected-files-cname` with exact normalized matching (missing expectation under ux01-ready ⇒ UNKNOWN); `OSS_BROWSER_ENDPOINT` must equal exactly `https://files.ajtlab.top`; CSP files-domain contract requires img-src AND frame-src; `DB_INTEGRITY`/`DB_FOREIGN_KEYS` split with an FK-violation fixture proving NOT_READY; expected schema derives from the repository migration count (no hard-coded v4); `RELEASE_SERVICE_WRITE_DENIED` is its own required gate; raw journal/cron/timer output is aggregated remotely (`sh -c` fixed pipelines with `wc -l`/`grep -c`, still denylist-covered) and never crosses SSH; 256 MiB resource guard skips heavy read-only audits (UNKNOWN, never PASS); SSH concurrency capped at 2 (`mapLimit`); executor now reports `OUTPUT_LIMIT_EXCEEDED` (never truncated success) with real `durationMs`; redirect origin uses exact URL origins (spoof-proof). Tests expanded 24 → **36/36** including all the above regressions. `FIRST_LIVE_AUDITOR_RUN=false`.

- **L1-OPS01R2 final false-confidence repairs**: profile completeness (missing required checks materialize as deterministic UNKNOWN — repo/public modes under ux01-ready can never READY); migration version semantics corrected on both sides (repository = max numeric filename prefix via `parseMigrationVersions`, never the file count; live = `MAX(version)` from `schema_migrations`, matching the real migration engine); resource guard fails closed (heavy read-only audits run only with KNOWN sufficient memory evidence; unknown memory ⇒ UNKNOWN + skipped commands, proven via executor call history); `NO_ERROR_OOM_ACTIVITY` fails closed (PASS requires error count + kernel OOM + cgroup `oom_kill` all known and clean; any definite failure ⇒ FAIL; any missing source ⇒ UNKNOWN; nginx 5xx reported separately); `--expected-files-cname` accepts one trailing FQDN dot. Tests 36 → **42/42**. `FIRST_LIVE_AUDITOR_RUN=false`.

## Blockers

None.

## Last Verification

2026-08-16: `node --test scripts/production-readiness-audit.test.mjs` **42/42 PASS**; `node --check` clean on all modules; mutation denylist + adversarial secret-safety tests green; safe smokes (`--help`, `--mode plan`, `--mode repo`) run; **live mode NOT run**; `codex/prod-03c2` untouched during Workstream A.

## Next Action

Push the L1-OPS01R2 repairs on the isolated branch and stop for ChatGPT final closeout review; do NOT run live mode, do NOT merge, do NOT integrate into PROD04B.
