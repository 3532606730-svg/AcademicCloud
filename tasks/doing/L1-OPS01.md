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

## Blockers

None.

## Last Verification

2026-08-16: `node --test scripts/production-readiness-audit.test.mjs` 24/24 PASS; `node --check` clean on all modules; safe CLI smokes (`--help`, `--mode plan`) run; **live mode NOT run** (not yet independently reviewed); `codex/prod-03c2` remote ref unchanged at `cd8ff25…`.

## Next Action

Push the isolated branch and stop for ChatGPT independent review; do NOT run
live mode, do NOT merge, do NOT integrate into PROD04B.
