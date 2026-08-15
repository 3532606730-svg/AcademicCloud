# Production Readiness Auditor — Operator / Developer Guide

`scripts/production-readiness-audit.mjs` is the repository-owned, **read-only**,
fail-closed production readiness auditor for AcademicCloud. It converts the
manual inspection workflow into deterministic, testable automation and answers:

> What is the current AcademicCloud production state, what is known with
> evidence, what is unknown, and is it safe to begin a separately authorized
> production transaction?

## Purpose and scope

Reusable for: pre/post-deployment checks, server upgrades, certificate renewal
work, DNS/custom-domain changes, backup verification, incident triage, release
drift detection, and future Layer 2 preparation. Layer 1 operational scope
only; the tool knows nothing about future Layer 2 business concepts.

## Read-only guarantee / threat model

- Local commands run through `execFile` with **argument arrays** — no local
  shell, no shell-concatenation of user input.
- The only user-controlled value that reaches SSH is the alias, validated
  against `^[A-Za-z0-9][A-Za-z0-9._-]*$`; it can never become an SSH option or
  command fragment.
- Remote checks are a **fixed, reviewed allowlist** (`checks.mjs`
  `FIXED_REMOTE`) of static argument arrays, POSIX-quoted for the remote login
  shell. There is deliberately no `--remote-command`, `--exec`, `--query`, or
  `--sql` option, and a mutation-denylist test fails the suite if a future
  check ever adds `systemctl start/stop/…`, `nginx -s reload`, `certbot
  renew`, `rm/mv/chmod/…`, SQL writes, `ossutil` mutations, or non-GET curl.
- SSH is always `BatchMode=yes` + `StrictHostKeyChecking=yes` + bounded
  `ConnectTimeout`; host verification is never disabled and passwords are
  never prompted. Privileged reads use `sudo -n` only; if unavailable the
  dependent checks become `UNKNOWN`.
- HTTP is **GET only** (no auth, no cookies stored, no redirects followed);
  the SQLite audit is a fixed script opened with
  `readonly: true, fileMustExist: true` returning aggregates only; the
  environment file is read through fixed `grep` patterns for the approved
  non-secret keys with secret keys reported `PRESENT`/`ABSENT` only.
- A final **report safety assertion** recursively rejects any serialized
  string matching private-key PEMs, bearer tokens, session cookies, AccessKey
  values, signed-URL parameters, object-key paths, Argon2 hashes, or policy
  blobs. On violation the tool prints only `REPORT_SAFETY_VIOLATION` and
  never the unsafe content.

## Modes

| Mode | Network | What it does |
|---|---|---|
| `repo` (default) | **none** | local Git/branch/worktree/remote-sanitized + repository production-file presence |
| `public` | DNS/TLS/HTTP-GET only | repo + safe public observations (DNS, TLS metadata, HTTP status, CSP) |
| `plan` | **none** | prints exactly what live mode WOULD inspect, and what it will never do |
| `live` | SSH read-only | repo + public + fixed remote checks (requires `--ssh-alias`) |

Live mode must never be run against production until ChatGPT has reviewed the
tool and a later task authorizes `FIRST_LIVE_AUDITOR_RUN=true`.

## Profiles

`baseline` (default): production healthy even though the files custom domain
is intentionally undeployed (`FILES_*` checks are informational/INFO).
`ux01-ready`: the files domain, TLS, `OSS_BROWSER_ENDPOINT`, and CSP inclusion
are **required PASS** — the profile for pre/post Transaction-B gates.

## Exit codes

`0` READY · `1` tool/usage error · `2` NOT_READY (required FAIL) ·
`3` INDETERMINATE (no FAIL, but required UNKNOWN). WARN never changes the
overall result. No probability or score is ever computed.

## Status and evidence semantics

`PASS / FAIL / WARN / UNKNOWN / INFO / NOT_APPLICABLE` with
`required / advisory / informational` levels. `UNKNOWN` is never conflated
with `FAIL` and never converted into `PASS`. Dependency propagation: if
`SSH_CONNECTION` fails, dependent remote checks report `UNKNOWN
(depends on SSH_CONNECTION)` — one outage, not 25 fake failures. Every check
records provenance (`LOCAL_COMMAND`, `PUBLIC_DNS`, `PUBLIC_HTTPS`,
`PUBLIC_TLS`, `REMOTE_SSH`, `REMOTE_SQLITE_READONLY`, …) and `observedAt`;
repository-recorded facts are never blurred with live evidence.

## Usage examples

```powershell
node scripts/production-readiness-audit.mjs                     # repo mode
node scripts/production-readiness-audit.mjs --mode public       # + public observations
node scripts/production-readiness-audit.mjs --mode plan         # human-reviewable plan
node scripts/production-readiness-audit.mjs --format json --output tmp/production-readiness/report.json
node scripts/production-readiness-audit.mjs --mode live --ssh-alias academiccloud-prod --profile baseline
node scripts/production-readiness-audit.mjs --mode live --ssh-alias academiccloud-prod --profile ux01-ready
```

`--verbose` adds timings/check counts but never raw unsafe output.

## Requirements

- Operator side: Node.js 24, `git` on PATH (repo mode), an already-configured
  strict SSH alias (live mode). No new dependencies.
- Remote side: standard Ubuntu tooling, `sudo -n` for the privileged
  read-only checks, and the release's own `node_modules/better-sqlite3` for
  the read-only database audit.

## Known limitations

- A/AAAA checks use the system resolver (`getaddrinfo`); CNAME/NS/CAA use
  Node's direct resolver. In operator networks that block direct DNS
  queries, the CNAME/NS/CAA checks degrade to `UNKNOWN` (never FAIL) while
  A/AAAA and all other checks keep working.
- DNS TTLs are not reported (the implementation method does not expose them).
- Live OSS console-level facts (Block Public Access, versioning, encryption,
  bucket policy) are NOT claimed by the auditor; only unauthenticated public
  observations (e.g. anonymous listing 403) are live-verified, and the
  report distinguishes evidence provenance accordingly.

## Generated reports

Reports go to stdout unless `--output` is given. Never commit live reports;
stage them under an ignored directory such as `tmp/production-readiness/`.
The JSON format is `schemaVersion: 1`; incompatible future changes must bump
the version. Check IDs are stable so reports can be diffed externally.

## Adding a new check safely

1. Add a fixed static argv entry to `FIXED_REMOTE` (or a pure parser/check in
   `public-checks.mjs` / `checks.mjs`) — never accept user input into it.
2. Evaluate it in `live-checks.mjs` with aggregate-only parsing and a
   `dependency: "SSH_CONNECTION"` fallback.
3. Add profile rules only if the state is stage-dependent.
4. Extend `scripts/production-readiness-audit.test.mjs`: parser fixture,
   mutation-denylist confirmation (automatic), and any new secret-safety
   fixture.

## Testing

```powershell
npm.cmd run test:ops-audit
```

The suite uses synthetic fixtures only — no real SSH, no real production, no
real network — and locks: CLI contract, alias grammar, SSH option safety,
mutation denylist, SQL read-only set, secret-safety (adversarial +
false-positive), parser determinism, profile semantics, dependency
propagation, READY/NOT_READY/INDETERMINATE logic, report determinism, timeout
and output caps.
