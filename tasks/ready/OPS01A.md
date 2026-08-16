# OPS01A — Operations Observability & Recovery Preparation

## Task ID
OPS01A — Operations Observability & Recovery Preparation

## Goal
Turn the repository's existing deployment/backup/recovery foundation into lightweight, testable operational checks and recovery-preparation tooling that can later be activated under a separate production gate, without adding a heavy monitoring stack or mutating production during this task.

## Scope
Repository/local preparation only:

### Lightweight operations status
Provide a repository-owned command/tool equivalent to `ops:check` that can report safe, machine-readable/concise status for applicable checks such as:
- application health/readiness;
- SQLite readability/schema currency/integrity where safe;
- backup freshness/last-known successful backup metadata when available;
- disk free-space threshold;
- memory/swap threshold;
- certificate expiry for configured public hostnames using read-only inspection;
- service/restart-policy configuration checks where applicable.

The tool must distinguish healthy/warning/critical/unknown rather than fabricating success for unavailable data.

### Backup pipeline preparation
Build on the existing consistent SQLite online backup/verification foundation:
- verify backup integrity, migrations, foreign keys, hash/manifest identity;
- support encrypted/off-host pipeline preparation through existing approved mechanisms where repository tooling already permits it without credentials;
- backup failure must never delete/overwrite the last known good backup;
- do not commit backup contents/secrets.

### Backup freshness
- define/test a bounded freshness policy;
- expose stale/unknown status;
- no production schedule activation in this task.

### Retention planner
Prepare a **dry-run** retention planner/policy, for example a documented model equivalent to:
- 7 daily;
- 4 weekly;
- 6 monthly;

The exact final policy may follow existing runbook conventions. The planner must explain what it would keep/delete and have deterministic tests.

No real backup deletion/pruning is authorized.

### Certificate expiry monitoring
Read-only expiry checks for the relevant production hostnames/configuration, including the separate lifecycle realities of:
- `cloud.ajtlab.top` (Nginx/Certbot path);
- `files.ajtlab.top` (OSS custom-domain TLS path).

Prefer warning thresholds such as 30/14/7 days if consistent with the runbook. Do not renew/replace certificates or mutate OSS/TLS configuration.

### Restore drill tooling
Provide or strengthen isolated restore rehearsal tooling:
- restore into a temporary/local isolated location;
- verify hash/integrity/foreign keys/migrations;
- start or exercise the compiled application against restored state where existing architecture supports it;
- verify health/readiness;
- clean up task-owned temporary state;
- never point the drill at the production database for write operations.

### systemd/timer/restart preparation
- audit existing `Restart=`/resource/security policy for safe crash recovery and restart-storm behavior;
- prepare tested service/timer templates for future backup/health/expiry checks if useful;
- keep them inactive/uninstalled during this task;
- do not introduce resident Prometheus/Grafana/Loki/Elastic or another monitoring service.

### Resource/disk/log audit
- verify logrotate and bounded log-growth assumptions;
- inspect SQLite/WAL/release/output/backup disk-growth risks;
- expose actionable warning status rather than automatic destructive cleanup.

## Non-goals
- No production SSH or live server command execution.
- No production DB/OSS access or mutation.
- No enabling/installing timers or services.
- No `systemctl enable --now` or production autostart change.
- No destructive backup pruning.
- No production restore/DB repair.
- No certificate issuance/renewal/replacement.
- No HSTS enablement.
- No Nginx/DNS/TLS/OSS/env mutation.
- No deployment or main merge.
- No heavy monitoring stack or new resident service.
- No automatic repair of corruption or unknown production state.
- No new paid service/dependency unless separately Owner-approved.

Operational safety model:

```text
SAFE AUTOMATION/PREPARATION
- read/verify
- health checks
- backup creation/verification tooling
- expiry checks
- log rotation policy
- crash-restart policy review
- isolated restore rehearsal
- deterministic retention dry-run

HUMAN-GATED RECOVERY/MUTATION
- production restore
- DB repair
- destructive pruning
- release rollback
- certificate replacement
- DNS/OSS/Nginx/systemd production changes
```

If corruption is detected, correct behavior is alert/fail closed—not automatic repair.

## Acceptance Criteria
- Repository-owned operations checks have deterministic tests and explicit unknown/failure states.
- Existing 1 GiB-class host/resource limits are respected; no unnecessary permanent service/dependency is added.
- Backup verification/freshness logic cannot destroy the last good backup.
- Retention is dry-run only and deterministic.
- Certificate checks understand both `cloud` and `files` lifecycle paths without mutating either.
- Restore drill is isolated, cleans up task-owned state, and verifies database/application integrity.
- Any service/timer templates are inactive repository artifacts only and have syntax/contract tests where possible.
- No production endpoint/contact is needed for task success; tests use local/injected fixtures unless a purely public TLS-read check is explicitly safe and still not necessary.
- `DEPENDENCY_DELTA=0` unless the task stops for Owner approval before adding anything.
- Canonical tests/typecheck/build/acceptance/diff/secret checks pass as applicable.
- Dedicated adversarial review checks accidental production mutation paths, destructive cleanup, false-green health status, secret leakage, and restore-target safety.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`
- production/recovery runbooks and existing deployment ADRs

## Relevant Modules / Files
- existing backup/restore scripts and acceptance tooling
- `docs/deployment/*`
- `deployment/systemd/*`
- `deployment/logrotate/*`
- health/readiness implementation/tests
- new operations scripts/tests only where they fit existing repository boundaries

## Current State
Conditional Ready, not started. AcademicCloud already has substantial operational primitives (backup/restore verification, immutable production artifacts, Nginx/systemd templates, logrotate, health/readiness, production runbooks), but routine health/freshness/expiry/rehearsal checks are not yet unified into a lightweight autonomous operations-preparation layer.

## Completed
None for OPS01A.

## Remaining
- recover existing operational tooling/runbooks;
- identify gaps without duplicating existing commands;
- implement read/verify/dry-run tooling only;
- adversarially test failure/destructive-target boundaries;
- run applicable full gates;
- reconcile documentation and checkpoint.

## Blockers
Do not begin until Core Drive and L2-ACCOUNTS01 are green and checkpointed. If safe execution/review capacity is insufficient, defer this task. Any live production mutation, credential requirement, new paid service, destructive retention, or production restore is a mandatory stop/gate rather than part of OPS01A.

## Last Verification
2026-08-17 planning reconciliation: OPS01A approved as a conditional cross-cutting repository/local task. No OPS01A implementation or production activation has occurred.

## Next Action
If selected after Accounts I, move to `tasks/doing/`, recover the existing deployment/backup/recovery tools first, and implement only missing lightweight read/verify/rehearsal capabilities. Stop before production activation.
