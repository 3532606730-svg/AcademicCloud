## Task ID

PROD-05A — First-Use Polish and Shared Library Release

## Goal

Deploy the smallest independently green production release containing the completed first-use polish, `RF-LIBRARY01`, and `RF-LIBRARY02`: exact code-bearing checkpoint `ec6a79aedb201bd6164a7c68f859c1aa492c218a`, unless repository or artifact evidence proves that checkpoint invalid. Transition production exactly from schema v8 to v15 with migrations 009–015 and stop after evidence-backed reconciliation.

## Scope

- Recover repository and live production truth; fail closed unless production is exact release `34a2eada158dcf08783dc9538d853f9361425e8a`, schema history 1–8, integrity `ok`, and foreign-key check empty.
- Run one Linux x64 / Node 24 artifact build and independent artifact verification from the requested `ec6a79a…` product/runtime baseline; if the exact workflow exposes stale verification assertions, repair only that verification boundary and record the resulting exact release without selecting newer documentation-only HEAD.
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

- [x] Repository history proves `ec6a79aedb201bd6164a7c68f859c1aa492c218a` is the smallest product/runtime checkpoint containing all requested work and that the later pre-window HEAD changes are documentation-only.
- [x] Exact-workflow attempts at `ec6a79a…` and its first verification-only repair exposed stale schema-head expectations; the bounded final candidate `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` differs from `ec6a79a…` only in eight verification files and has no runtime, migration, dependency, or infrastructure delta.
- [x] GitHub Actions run `32098001755` built and independently re-downloaded/verified exact `25cdab1…` on fresh Linux x64 / Node 24 runners. GitHub artifact SHA-256 is `fec93dda3ee779ae6261aed489018fd2d5f2b1151fc82a0785a5d6e7ada7a036`; release archive SHA-256 is `bf3728a9f65a40829521a35eef4f0267cd7362b90844f91a9cbb6b517d681d77`.
- [x] Read-only live preflight proved exact prior release `34a2eada…`, schema/history 1–8 with matching checksums, integrity `ok`, zero foreign-key violations, expected protected paths/listener/service/resource state, and no material anomaly.
- [x] Fresh schema-v8 backup `academiccloud-pre-prod05a-20260818T041406Z.sqlite` was created/verified at 212,992 bytes and SHA-256 `873374176280848ae9cd6747a01dcdf19f0423ce32c8fea7f30c042ba1199b17`; its age ciphertext and receipt are off-host in private `AcademicCloud-Backups` commit `b0238baa8bb5e5f44c5ceaf1d37ca3a80e0f9420`.
- [x] One isolated v8→v15 rehearsal applied exactly `[9,10,11,12,13,14,15]`, applied zero migrations on the second pass, ran the exact compiled production composition with in-memory storage, passed health/readiness, integrity, foreign keys, Library authorization/contribution promotion, lineage/provenance, and source-backup immutability, then removed the isolated synthetic stage.
- [x] Production selected exact release `25cdab1…`; the one production migration invocation added only 009–015 and live history/checksums are exactly 1–15.
- [x] Post-deploy health/readiness, public assets, `integrity_check`, `foreign_key_check`, loopback listener, service/cgroup/resource, rollback evidence, and unchanged environment/systemd/Nginx configuration are green.
- [x] Release-specific synthetic Library/contribution authorization was confined to the isolated backup copy; live smoke was read-only/unauthenticated, live Library tables remain empty, preexisting aggregates are unchanged, and no real Member account or private data was inspected or used.
- [x] Durable repository/runbook/task truth records the exact release/schema/artifact/backup/off-host/smoke evidence; parked tasks remain unchanged and execution returns to STOP.

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

Complete. Production runs exact release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` at schema v15/history 1–15. The requested product/runtime baseline remains `ec6a79aedb201bd6164a7c68f859c1aa492c218a`; the deployed exact release adds only the verification repairs required for the exact Linux artifact workflow to represent repository schema head 015 correctly. No unrelated product or infrastructure work entered the release.

## Completed

- Recovered clean Git state, current branch/origin synchronization, recent task checkpoints, schema head 015, production runbook, backup/rollback rules, and completed PROD-04A evidence.
- Compared `34a2eada…→ec6a79a…` and `ec6a79a…→` the pre-window HEAD; no later product/runtime checkpoint is required by current evidence.
- Confirmed the bounded production window excludes all parked product work, `PROD-03C2`, permanent deletion, infrastructure policy changes, main merge, and real Member access.
- Repaired only stale schema-head expectations discovered by the exact artifact workflow; final candidate `25cdab1…` has the same product runtime, migrations, dependencies, and infrastructure as `ec6a79a…`.
- Passed GitHub Actions run `32098001755`: backend `251/251`, frontend `165/165`, production build, Linux native-module/runtime checks, compiled acceptance, artifact publication, and independent fresh-runner download/verification.
- Completed read-only production preflight, created the fresh bound schema-v8 rollback generation, encrypted and pushed it off-host, and proved the off-host ciphertext/receipt hashes at backup repository commit `b0238ba…`.
- Rehearsed v8→v15 once with exact 009–015/zero second pass and completed full synthetic Library authorization/submission/approval acceptance on the isolated copy using in-memory storage. Removed the rehearsal stage exactly.
- Stopped the service, atomically selected `25cdab1…`, applied exactly migrations 009–015 once, restarted without changing enablement or policy, and retained prior release `34a2eada…` for the rollback pair.
- Verified live schema/history/checksums 1–15, integrity `ok`, zero foreign-key violations, unchanged preexisting aggregates, zero live Library rows/test junk, health/readiness/public assets, anonymous Library denial, zero restarts, zero post-release app/OOM findings, unchanged infrastructure hashes, and loopback-only API binding.
- Removed artifact/rehearsal staging while retaining the exact release, plaintext rollback backup, receipt, ciphertext, and off-host evidence.

## Remaining

None. The bounded production window is exhausted.

## Blockers

None. Two initial exact-workflow runs failed safely on stale verification assertions; the repairs were verification-only and the final exact artifact passed. A rehearsal fixture typo was confined to the disposable isolated copy and repaired without another migration rehearsal or any live-data effect.

## Last Verification

2026-08-18 post-deploy verification: production release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`; schema v15/history 1–15 with exact checksums; `integrity_check=ok`; `foreign_key_check=0`; service active/autostart disabled/`NRestarts=0`; API bound only to `127.0.0.1:3000`; public health/readiness 200 with `no-store`; anonymous Library list/create 401 with `no-store`; preexisting counts preserved at accounts 5, folders 4, files 32, sessions 18, invitations 5, announcements 1; live libraries/memberships/contributions all 0. Environment, systemd, Nginx site, and security-header hashes match preflight. No post-release app error, failed unit, or kernel OOM finding.

## Next Action

STOP. Await explicit Owner direction. Do not select parked Pre-OCR work, run `PROD-03C2`, permanently delete, alter infrastructure/autostart, merge main, or test with any real Member account.
