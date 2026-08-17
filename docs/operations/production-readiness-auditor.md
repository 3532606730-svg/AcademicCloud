# Production Readiness Auditor — Operator / Developer Guide

`scripts/production-readiness-audit.mjs` is the repository-owned, read-only,
fail-closed AcademicCloud readiness auditor. It reports what is known, what is
unknown, and whether every required gate has evidence. It never deploys,
repairs, restarts, enables, reloads, renews, prunes, restores, or authenticates
to the application.

The auditor was used as a read-only preflight during the accepted UX01 work.
OPS01A ports its reviewed implementation into the current repository and
updates its assumptions. This task uses only its zero-network modes and
synthetic tests; it does not run `public` or `live` against production.

## Modes

| Mode | Network | Behavior |
|---|---|---|
| `repo` (default) | none | Local Git/repository checks only |
| `plan` | none | Prints the fixed live inspection plan and mutation exclusions |
| `public` | explicit DNS/TLS/GET | Public unauthenticated observations only |
| `live` | explicit public + strict SSH | Fixed read-only remote allowlist; requires `--ssh-alias` |

`public` and `live` are capabilities for a later Owner-approved operations
window. Their presence is not authorization to use them.

## Profiles

- `post-ux01` is the default current profile. Both `cloud.ajtlab.top` and
  `files.ajtlab.top` are treated as deployed lifecycles. Required evidence for
  the files DNS/CSP/browser endpoint and independent files TLS validity/expiry
  cannot be omitted without making the result indeterminate.
- `ux01-ready` is retained for the historical cutover gate.
- `baseline` is retained only for historical pre-files-domain comparisons; it
  is not the current production expectation.

No Alibaba or DNS target is hard-coded as console truth. If a required mode
does not collect a required check, the report materializes it as `UNKNOWN`.

## Status and exit contract

Checks use stable `PASS | FAIL | WARN | UNKNOWN | INFO | NOT_APPLICABLE`
statuses and `required | advisory | informational` levels. These map to the
OPS01A vocabulary as follows:

- `PASS` → healthy;
- `WARN` → warning;
- `FAIL` → critical;
- `UNKNOWN` → unknown.

Overall results are deterministic:

- exit `0`, `READY`: every required check is exactly `PASS`;
- exit `2`, `NOT_READY`: at least one required check is `FAIL`;
- exit `3`, `INDETERMINATE`: no required failure, but at least one required
  check is `WARN`, `UNKNOWN`, `INFO`, or not applicable;
- exit `1`: usage/tool/report-safety failure.

There is no score or probability. Required unknown evidence never becomes
healthy.

## Read-only and secret-safety model

- Local commands use `execFile` with argument arrays and no local shell.
- The only user-controlled SSH value is a conservative alias. SSH always uses
  `BatchMode=yes`, `StrictHostKeyChecking=yes`, a bounded connect timeout, and
  a fixed static command allowlist. Remote concurrency is at most two.
- Privileged reads use `sudo -n`; unavailable evidence becomes `UNKNOWN`
  rather than prompting.
- HTTP observations are GET-only, unauthenticated, and do not retain cookies.
- SQLite inspection is read-only and returns aggregate counts only.
- Raw logs do not cross SSH; fixed remote commands return bounded numeric
  aggregates.
- A mutation-denylist test rejects restart/reload/enable, package install,
  filesystem mutation, SQL writes, OSS mutation, and non-read-only HTTP.
- A final serializer gate rejects credential material, private keys, session
  cookies, signed URLs, object keys, password hashes, and age private keys.

## Resource and lifecycle checks

The live capability keeps the accepted 1 GiB-host boundaries:

- required `MemAvailable >= 128 MiB`;
- a 256 MiB heavy-check guard; below it, integrity/journal work is skipped and
  reported unknown;
- independent SwapFree evidence: missing/zero is not PASS, below 256 MiB is a
  warning;
- root/data/backup disk observations; exact live 320/384 MiB cgroup policy and
  current/peak usage; complete high/max/OOM event evidence; and bounded
  journal/Nginx aggregates where unavailable/malformed evidence is unknown and
  known 5xx or cgroup pressure is at least warning;
- live service policy including `Restart=on-failure`, restart delay,
  restart-storm limits, 320/384 MiB cgroup limits, listener/release, and Nginx
  observations. The checked-in Nginx logrotate contract is verified separately
  by repository artifact tests; the live auditor does not claim to inspect its
  installed policy.

Certificates are independent:

- `cloud.ajtlab.top`: Nginx/Certbot leaf plus a separate Certbot-renewal
  lifecycle check;
- `files.ajtlab.top`: Alibaba OSS custom-domain leaf plus a separate manual or
  managed redeployment lifecycle.

Both TLS leaves have authorization/hostname evidence and exact 30/14/7-day
bands: warning at 30 days, urgent warning at 14, critical at 7. A currently
valid leaf does not prove renewal automation is closed.

## Backup evidence is not inferred from filenames

Legacy remote file counts are deliberately `UNKNOWN`; an arbitrary `.sqlite`,
`.age`, timer, or cron entry does not prove a verified backup or cadence. Use
the versioned receipt and recovery-preparation commands documented in
`OPS01A-operations-preparation.md`. Off-host state remains unknown unless an
explicit non-secret destination receipt proves the encrypted generation;
presence of the public age recipient is not proof.

## Usage

```powershell
npm.cmd run ops:check
npm.cmd run ops:check:plan
node scripts/production-readiness-audit.mjs --mode repo --profile post-ux01 --format json
```

Future explicit operations windows may use `public` or `live` only after
recovering the current task/production gate. Live mode requires an already
configured strict SSH alias; it never accepts a raw host or remote command.

Reports go to stdout by default. Optional `--output` is allowed only for a new
file below ignored `output/operations/`, uses exclusive creation, and refuses
overwrite. Never commit live reports.

## Testing

```powershell
npm.cmd run test:ops-auditor
```

The suite is synthetic and zero-network. It covers CLI/alias/SSH safety,
mutation denial, report secret rejection, required-unknown propagation,
resource guards, swap, both certificate lifecycles and 30/14/7 boundaries,
profile completeness, migration derivation, fixed remote aggregation,
timeouts/output caps, and no-clobber report output.
