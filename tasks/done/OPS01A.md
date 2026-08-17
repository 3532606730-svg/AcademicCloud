# OPS01A — Operations Observability & Recovery Preparation

## Task ID
OPS01A — Operations Observability & Recovery Preparation

## Goal
Turn the repository's existing deployment/backup/recovery foundation into lightweight, testable operational checks and recovery-preparation tooling that can later be activated only under a separate production gate, without adding a heavy monitoring stack or mutating production during this task.

## Scope
Repository/local preparation only:
- lightweight operations/readiness status with explicit healthy/warning/critical/unknown semantics;
- verified SQLite backup identity/receipt/freshness tooling;
- deterministic backup-retention dry-run planning;
- certificate/disk/memory/swap/restart/log-growth readiness contracts;
- isolated restore rehearsal;
- inactive systemd/journald operational templates where justified;
- production artifact/runtime inclusion and verification of the new repository tooling.

## Non-goals
- No production SSH or live server command execution as part of acceptance.
- No production DB/OSS access or mutation.
- No enabling/installing timers, services, or journald configuration.
- No destructive backup pruning.
- No production restore/DB repair.
- No certificate issuance/renewal/replacement.
- No HSTS/Nginx/DNS/TLS/OSS/env mutation.
- No deployment or main merge.
- No heavy resident monitoring stack.
- No automatic corruption repair.
- No new paid service/dependency.

## Acceptance Criteria
- Repository-owned operations checks have deterministic tests and explicit unknown/failure states.
- Existing small-host resource limits are respected; no unnecessary permanent service/dependency is added.
- Backup verification/freshness logic cannot overwrite/destroy the last known good backup and cannot re-date an arbitrary legacy backup.
- Backup verification does not pollute the selected backup directory with SQLite WAL/SHM companions.
- Retention remains dry-run only, deterministic, and conservative on ambiguous/unverified records.
- Certificate/readiness checks understand the separate `cloud.ajtlab.top` and `files.ajtlab.top` lifecycle paths without mutation.
- Restore drill uses only verified task-owned temporary state, opens no listener, uses memory storage, cleans up exact owned state, and proves source/copy unchanged.
- Service/log templates remain inactive repository artifacts.
- No production endpoint/contact is necessary for task success; the default auditor is zero-network.
- Dependency and migration delta are zero.
- Applicable tests/typecheck/build/compiled acceptance/artifact verification pass.
- Independent adversarial review covers accidental production mutation, destructive cleanup, false-green status, secret leakage, filesystem races, and restore-target safety.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`
- production/recovery runbooks and existing deployment ADRs.

## Relevant Modules / Files
- `backend/src/operations/backup-receipt.ts`
- `backend/src/operations/backup-retention.ts`
- `backend/src/operations/database-backup.ts`
- `backend/src/operations/isolated-restore-drill.ts`
- `backend/src/operations/recovery-main.ts`
- `backend/test/operations/operations-preparation.test.ts`
- `scripts/production-readiness-audit.mjs`
- `scripts/lib/production-readiness/*`
- `scripts/production-readiness-audit.test.mjs`
- `scripts/production-artifact.mjs`
- `deployment/systemd/academiccloud.service`
- `deployment/journald/90-academiccloud-retention.conf`
- `docs/operations/*`
- `docs/deployment/*`

## Current State
**Complete in repository development; independently accepted.** No OPS01A repository artifact has been activated on production. Production remains on the previously accepted UX01 generation.

The code-bearing review checkpoint is `34a2eada158dcf08783dc9538d853f9361425e8a`, whose parent is the independently green Password Change checkpoint `6ef6fb612d2bdac808e3682eb5bcae6bdb3a0de3`.

## Completed
- Added a default zero-network repository readiness auditor plus explicit plan/public/live read-only modes. Live mode requires an explicit validated SSH alias, strict host-key checking, bounded output/time, fixed allowlisted checks, and no apply/fix path.
- Added report secret-safety filtering and tests that prevent unsafe evidence from being serialized as a successful report.
- Added verified backup generation receipts bound to backup creation time, SHA-256, byte count, schema version, aggregate counts, optional source commit, and explicit `offHostStatus: unknown`.
- Prevented legacy/arbitrary snapshots from receiving a newly dated freshness receipt.
- Moved SQLite backup verification to a 0600 copy inside a validated task-owned 0700 OS-temporary directory so the selected backup/store is not polluted by verifier WAL/SHM companions.
- Added deterministic 7-daily / 4-weekly / 6-monthly retention planning. Invalid, duplicate, future, or unverified evidence is held; the command has no deletion/apply path.
- Added isolated restore rehearsal that verifies the receipt, rejects the configured live DB as source, uses an exclusive task-owned temporary copy, composes the app with `InMemoryStorageAdapter`, exercises health/readiness by injection with no listener, runs maintenance dry-run, re-verifies source/copy unchanged, and validates cleanup ownership.
- Added bounded restart-storm policy to the repository systemd template while retaining prior hardening/resource limits.
- Added an explicitly inactive future journald-retention template.
- Added operations documentation, recovery CLI contracts, compiled acceptance coverage, deployment artifact inclusion, and deterministic tests.
- Added no database migration and no dependency.
- Performed no production contact/mutation, timer/service activation, destructive pruning, restore, certificate action, main merge, or deployment.

## Remaining
None inside OPS01A repository/local scope.

Future activation—production health checks, backup scheduling/off-host delivery, service/timer/journald installation, live certificate operations, retention apply, or production restore—remains separately Owner-gated.

## Blockers
None for repository-development closure.

## Last Verification
2026-08-17 final acceptance evidence:

- Codex local full verification before handoff: backend `189/189` PASS; frontend `136/136` PASS; readiness-auditor tests `48/48` PASS; acceptance tools `25/25` PASS; workspace typecheck PASS; `git diff --check` PASS; independent read-only Reviewer PASS with no blocker or medium finding.
- ChatGPT independently reviewed the exact `6ef6fb6…34a2eada` OPS01A change scope: 31 changed paths, no migration, no dependency addition, and the critical backup/retention/restore/auditor safety boundaries matched the task contract. Verdict: **PASS / APPROVE-WITH-NIT**, no blocker or medium finding.
- Non-blocking wording nit only: the readiness-auditor help text says the tool “never writes anything” even though the explicit `--output` option may create a no-clobber local report under `output/operations`; this does not mutate an inspected/production system and does not block closure.
- Independent exact-head GitHub validation used draft PR #3 solely to trigger the existing Linux production-build workflow for `34a2eada…`. Workflow run `31997033717` passed the Linux x64 / Node 24 job including clean dependency install, full tests, typecheck, production build, compiled acceptance, dependency audits, Argon2 benchmark, deterministic production artifact packaging, and extracted runtime verification.
- The second fresh-runner job independently downloaded the uploaded artifact and verified its archive/checksum/manifest/native/runtime/compiled-acceptance contract: PASS.
- PR #3 was validation-only; no merge or deployment was authorized.

## Next Action
Proceed to the separately Owner-approved Pre-OCR Research Foundation planning task `RF-PLAN01`. Recover from repository memory, materialize bounded task cards/queue from `ROADMAP.md` and ADR-014, checkpoint planning, and continue only inside that approved repository/local program. Stop before OCR execution or any production Owner gate.
