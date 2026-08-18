## Task ID

PROD-06A — First-Use Correction Production Release

## Goal

Deploy the smallest exact independently verified production release containing completed `RF-SHAREDDEFAULT01`, `L2-CREDENTIALRESET01`, and `L1-UX05`; transition production from exact schema v15/history 001–015 to schema v17/history 001–017 with migrations 016–017 only; reconcile durable evidence; and stop for independent review.

## Scope

- Treat exact code-bearing checkpoint `f7b9ef0475964f60f28a56450c6ef5e22a0df4c5` as the candidate unless repository/artifact evidence proves it invalid.
- Require the three prerequisite Epic checkpoints to be complete, independently green, pushed, synchronized, and consecutive in the candidate history.
- Build and independently re-download/verify one exact Linux x64 / Node 24 artifact through `.github/workflows/production-build.yml`; never build or install dependencies on production.
- Fail closed unless read-only production preflight proves exact installed release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`, schema/history 001–015 with exact checksums, integrity `ok`, zero foreign-key violations, and expected service/listener/resource/protected-path state.
- Before migration, create and verify a fresh consistent schema-v15 backup and bind its age-encrypted ciphertext plus non-secret receipt/manifest to verified off-host `AcademicCloud-Backups` evidence.
- Rehearse the exact production-backup v15→v17 transition once in isolation using the candidate artifact and memory storage; prove exact migrations `[16,17]`, empty second pass, restart/current-schema behavior, integrity, foreign keys, authorization/privacy, stable identity/object/provenance/Favorite/overlay preservation, and rollback compatibility.
- Stage and deploy only the verified immutable artifact, stop/switch/migrate/start once, and apply only append-only migrations 016–017.
- Verify exact schema/history/checksums, integrity, foreign keys, health/readiness, loopback-only API binding, service/resource state, canonical Library behavior, Member pending intake → Owner approval, Owner-assisted credential reset, corrected UX shell, and stale-state recycle behavior using bounded synthetic or non-destructive state without inspecting real Member private research data.
- Reconcile task/status/board/runbook truth, record the exact release/schema/artifact/rollback/acceptance evidence, push the final non-main checkpoint, verify local/tracking/remote equality, and stop.

## Non-goals

- No `PROD-03C2`, permanent delete, ad-hoc SQL cleanup, destructive real-data test, real Member private-data access, or irreversible test junk.
- No DNS, TLS, Nginx, firewall, systemd policy/autostart, reboot, credential, paid-infrastructure, unrelated OSS, or main-branch change.
- No `RF-META01`, parked Pre-OCR work, OCR/text extraction, indexing, embeddings, retrieval, or RAG.
- No weakening of authorization/privacy, CAS, Argon2id, SQLite durability, immutable migration history, or release/database rollback pairing.

## Acceptance Criteria

- Repository precondition and exact candidate ancestry/synchronization are proven before production contact.
- One exact-candidate GitHub Actions run passes both Linux artifact build/verification jobs and yields a four-file immutable bundle with recorded GitHub artifact and archive SHA-256 values.
- Read-only preflight proves the expected exact production release/schema/history/checksums, integrity/FK, loopback listener, service/autostart/resource, environment, Nginx, and rollback state with no material anomaly.
- A fresh verified schema-v15 database backup, ciphertext, receipt/manifest, and independently verified off-host commit form the pre-deployment rollback pair with release `25cdab1…`.
- One isolated rehearsal applies exactly 016–017 once, applies zero migrations on repeat, survives compiled restart/current-schema checks, preserves the reviewed academic-data/privacy invariants, and proves the unchanged source backup remains compatible with release `25cdab1…`.
- Production selects exact candidate `f7b9ef0…`, applies only 016–017 once, and finishes with exact schema v17/history 001–017, matching migration checksums, integrity `ok`, and zero foreign-key violations.
- Bounded release-specific acceptance is green without touching real Member private research activity, permanently deleting data, or leaving irreversible synthetic residue.
- Durable repository/runbook/task truth contains all required evidence; the final checkpoint is pushed and local/tracking/remote synchronization is exact.

## Relevant ADRs

- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-016-explicit-resource-ownership-domains.md`
- `docs/decisions/ADR-018-scholarly-resource-artifact-version-identity.md`
- `docs/decisions/ADR-020-shared-library-authorization.md`
- `docs/decisions/ADR-021-library-contribution-promotion.md`
- `docs/decisions/ADR-022-default-shared-library-and-private-research-activity.md`
- `docs/decisions/ADR-024-owner-assisted-credential-reset.md`

## Relevant Modules / Files

- `.github/workflows/production-build.yml`
- `scripts/production-artifact.mjs`
- `database/migrations/016_canonical_shared_library.sql`
- `database/migrations/017_owner_credential_reset.sql`
- `docs/deployment/production-runbook.md`
- `docs/deployment/backup-recovery.md`
- `docs/deployment/encrypted-backup.md`
- `tasks/done/RF-SHAREDDEFAULT01.md`
- `tasks/done/L2-CREDENTIALRESET01.md`
- `tasks/done/L1-UX05.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`

## Current State

Active before production contact. Exact candidate `f7b9ef0475964f60f28a56450c6ef5e22a0df4c5` is clean and synchronized on `codex/project-memory-reconcile-20260817`; production is durably recorded at exact `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`, schema v15/history 001–015. Candidate and production release share `ec6a79aedb201bd6164a7c68f859c1aa492c218a`; production-only commits were verification repairs that also exist in the candidate line, while migrations 001–015 are byte-identical.

## Completed

- Read the repository workflow and production runbooks.
- Verified clean local/tracking/remote equality at candidate `f7b9ef0…`.
- Verified prerequisite checkpoints `51c3d7b… → 836d786… → f7b9ef0…` and their durable independent-green evidence.
- Verified schema head 017, append-only migration filenames, byte-identical candidate/production migrations 001–015, and the bounded two-migration delta.
- Selected this new task ID and exact candidate without choosing a later documentation-only checkpoint.

## Remaining

- Push this task-opening checkpoint.
- Run and independently verify the exact-candidate GitHub artifact workflow.
- Perform read-only production preflight.
- Create/verify/encrypt/publish the fresh rollback backup and verify off-host evidence.
- Complete one isolated v15→v17 migration/data/privacy/authorization/restart/idempotency/rollback rehearsal.
- Deploy exact artifact, apply only 016–017 once, and perform bounded post-deploy verification/acceptance.
- Reconcile durable truth, checkpoint/push/synchronize, and stop.

## Blockers

None at task opening. Any material gate mismatch is a fail-closed blocker before unsafe mutation.

## Last Verification

2026-08-18 repository gate: `RF-SHAREDDEFAULT01` checkpoint `51c3d7b…` records backend 255/255, focused changed-path 14/14, frontend 108/108, typecheck/build, isolated v15→v16 transition/integrity/FK/idempotency/privacy, and focused review green. `L2-CREDENTIALRESET01` checkpoint `836d786…` records backend 258/258, focused 7/7, frontend 164/164 plus focused 121/121, typecheck/build, and focused security review green. `L1-UX05` checkpoint `f7b9ef0…` records frontend 165/165, backend atomic-lifecycle 10/10, root build, diff check, and focused review green. Git local/tracking/remote equality is exact. No production contact or mutation occurred during recovery.

## Next Action

Commit and push this bounded production-release gate, verify synchronization, then dispatch and independently verify exactly one Linux x64 / Node 24 artifact workflow for source `f7b9ef0475964f60f28a56450c6ef5e22a0df4c5`.
