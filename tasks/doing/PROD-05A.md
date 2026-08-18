## Task ID

PROD-05A — First-Use Polish and Shared Library Release

## Goal

Deploy the smallest independently green production release containing the completed first-use polish, `RF-LIBRARY01`, and `RF-LIBRARY02`: exact code-bearing checkpoint `ec6a79aedb201bd6164a7c68f859c1aa492c218a`, unless repository or artifact evidence proves that checkpoint invalid. Transition production exactly from schema v8 to v15 with migrations 009–015 and stop after evidence-backed reconciliation.

## Scope

- Recover repository and live production truth; fail closed unless production is exact release `34a2eada158dcf08783dc9538d853f9361425e8a`, schema history 1–8, integrity `ok`, and foreign-key check empty.
- Run one exact-checkpoint Linux x64 / Node 24 artifact build and independent artifact verification; do not select newer documentation-only HEAD.
- Perform read-only host/release/database/resource preflight without changing DNS, TLS, Nginx, systemd policy, autostart, or unrelated infrastructure.
- Create and verify one fresh consistent schema-v8 rollback backup, encrypt it, and bind it to verifiable off-host evidence before migration.
- Perform one isolated schema-v8→v15 rehearsal using the exact candidate artifact, applying exactly migrations 009–015 with restart/runtime, integrity, foreign-key, and zero-redeploy-migration checks.
- Stage and deploy the immutable exact candidate; migrate production once from v8 to v15; verify health/readiness, exact migration history/checksums, integrity, foreign keys, listener, and resource safety.
- Run minimal release-specific acceptance for first-use polish, Member archival/admin polish, Library membership/holdings authorization, explicit contribution review, non-disclosure, and stable ownership promotion using only synthetic state that is safe and reversible.
- Reconcile repository/runbook/task truth, record the exact rollback pair and production evidence, create/push the production checkpoint, and stop.

## Non-goals

- No `PROD-03C2`, permanent delete, reboot, autostart change, backup pruning, destructive restore, reverse SQL, or real-data destructive test.
- No DNS, TLS, Nginx, systemd policy, firewall, certificate, HSTS, OSS policy, credential, paid infrastructure, or unrelated host mutation.
- No main merge, newer docs-only HEAD deployment, migration 016 or later, `RF-META01`, `RF-LIBRARY03`, `RF-LIBRARY04`, OCR, full-text indexing, embeddings, retrieval, or RAG.
- No broad replay of historical PROD-04A acceptance, dependency campaigns, benchmarks, or unrelated production verification after the release-specific evidence is green.
- No inspection, authentication, disablement, archival, mutation, or use of the Owner's real Member account or its private data. Global Owner authority must not be used as a browse-all shortcut.

## Acceptance Criteria

- [ ] Repository history proves `ec6a79aedb201bd6164a7c68f859c1aa492c218a` is the smallest code-bearing checkpoint containing all requested work and that later HEAD changes are documentation-only.
- [ ] One exact-head Linux x64 / Node 24 artifact workflow and its independent download/runtime verification pass for `ec6a79a…`; archive, manifest, runtime evidence, source identity, and hashes are recorded.
- [ ] Read-only live preflight proves exact current release `34a2eada…`, schema/history 1–8, integrity `ok`, zero foreign-key violations, expected protected paths/listener/service/resource state, and no material anomaly.
- [ ] One fresh verified schema-v8 backup is encrypted and has off-host evidence; rollback is the inseparable pair `34a2eada…` plus that exact backup.
- [ ] One isolated v8→v15 rehearsal applies exactly `[9,10,11,12,13,14,15]`, applies zero migrations on redeploy, passes compiled runtime/health, integrity, foreign-key, and rollback-source immutability checks, and uses no real OSS or Member-private data.
- [ ] Production selects only `ec6a79a…`; live migration history is exactly 1–15 with migrations 009–015 added and nothing later.
- [ ] Post-deploy health/readiness, `integrity_check`, `foreign_key_check`, exact release/public-asset identity, loopback listener, service/cgroup/resource, and rollback evidence are green.
- [ ] Minimal synthetic smoke proves release-specific first-use/admin/Library/contribution authorization, promotion, non-disclosure, and recoverability without touching the Owner's real Member or leaving irreversible test junk.
- [ ] Durable repository state records the exact release/schema/artifact/backup/off-host/smoke evidence; the completed task checkpoint is pushed and synchronized; work stops with parked tasks unchanged.

## Relevant ADRs

- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-015-governance-audit-event-model.md`
- `docs/decisions/ADR-016-explicit-resource-ownership-domains.md`
- `docs/decisions/ADR-018-scholarly-resource-artifact-version-identity.md`
- `docs/decisions/ADR-019-member-account-archival-lifecycle.md`
- `docs/decisions/ADR-020-shared-library-authorization.md`
- `docs/decisions/ADR-021-library-contribution-promotion.md`

## Relevant Modules / Files

- `docs/deployment/production-runbook.md`
- `docs/deployment/backup-recovery.md`
- `docs/deployment/encrypted-backup.md`
- `.github/workflows/production-build.yml`
- `scripts/production-artifact.mjs`
- `database/migrations/009_governance_audit.sql` through `015_library_contributions.sql`
- `tasks/done/PROD-04A.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`

## Current State

Active under the Owner-opened production window of 2026-08-18. Repository recovery is green: clean synchronized branch at documentation-only HEAD `e9b2308…`; exact requested code-bearing checkpoint `ec6a79a…` contains the completed first-use polish and Library contribution line; the only two later commits are task/status documentation. Durable production truth remains `34a2eada…` / schema v8 pending live read-only confirmation.

## Completed

- Recovered clean Git state, current branch/origin synchronization, recent task checkpoints, schema head 015, production runbook, backup/rollback rules, and completed PROD-04A evidence.
- Compared `34a2eada…→ec6a79a…` and `ec6a79a…→HEAD`; no code-bearing checkpoint later than `ec6a79a…` is required by current evidence.
- Confirmed the bounded production window excludes all parked product work, `PROD-03C2`, permanent deletion, infrastructure policy changes, main merge, and real Member access.

## Remaining

- Build/verify the exact Linux artifact and complete read-only live preflight.
- Create/verify/encrypt/publish the fresh rollback backup and rehearse v8→v15 once.
- Deploy, migrate, verify, run minimal synthetic acceptance, reconcile durable state, push the production checkpoint, and stop.

## Blockers

None before read-only preflight. Any material migration, integrity, authorization, rollback, artifact-identity, or production-truth mismatch blocks mutation and requires STOP.

## Last Verification

2026-08-18 repository recovery: working tree clean; branch `codex/project-memory-reconcile-20260817` synchronized with origin at `e9b2308bc44f7a815212df70658864afe299c06b`; exact candidate `ec6a79aedb201bd6164a7c68f859c1aa492c218a` is present and pushed in branch ancestry; later commits `6224557…` and `e9b2308…` are documentation-only; migrations present are exactly 001–015. Recorded production truth is `34a2eada…`, schema v8/history 1–8, pending live read-only confirmation.

## Next Action

Commit/push this bounded task activation, create one exact-candidate artifact run, then perform read-only production preflight. Do not mutate production until artifact, rollback, integrity, and rehearsal gates are green.
