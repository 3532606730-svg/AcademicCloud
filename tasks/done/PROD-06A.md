## Task ID

## Task ID

PROD-06A — First-Use Correction Production Release

## Goal

Deploy the smallest exact independently verified production release containing completed `RF-SHAREDDEFAULT01`, `L2-CREDENTIALRESET01`, and `L1-UX05`; transition production from exact schema v15/history 001–015 to schema v17/history 001–017 with migrations 016–017 only; reconcile durable evidence; and stop for independent review.

## Scope

- Treat exact code-bearing checkpoint `f7b9ef0475964f60f28a56450c6ef5e22a0df4c5` as the requested baseline. Exact workflow evidence proved two stale verification-only boundaries invalid; deploy candidate `855b63c49f12f3375972774e7bc7385088b0495e`, which changes only those two verification files and has no runtime, migration, dependency, or infrastructure delta from `f7b9ef0…`.
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

- [x] Repository precondition and exact candidate ancestry/synchronization are proven before production contact.
- [x] One exact-candidate GitHub Actions run passes both Linux artifact build/verification jobs and yields a four-file immutable bundle with recorded GitHub artifact and archive SHA-256 values.
- [x] Read-only preflight proves the expected exact production release/schema/history/checksums, integrity/FK, loopback listener, service/autostart/resource, environment, Nginx, and rollback state with no material anomaly.
- [x] A fresh verified schema-v15 database backup, ciphertext, receipt/manifest, and independently verified off-host commit form the pre-deployment rollback pair with release `25cdab1…`.
- [x] One isolated rehearsal applies exactly 016–017 once, applies zero migrations on repeat, survives compiled restart/current-schema checks, preserves the reviewed academic-data/privacy invariants, and proves the unchanged source backup remains compatible with release `25cdab1…`.
- [x] Production selects exact candidate `855b63c…`, applies only 016–017 once, and finishes with exact schema v17/history 001–017, matching migration checksums, integrity `ok`, and zero foreign-key violations.
- [x] Bounded release-specific acceptance is green without touching real Member private research activity, permanently deleting data, or leaving irreversible synthetic residue.
- [x] Durable repository/runbook/task truth contains all required evidence; the final checkpoint is pushed and local/tracking/remote synchronization is exact.

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
- `backend/scripts/compiled-acceptance.mjs`
- `frontend/src/App.test.tsx`
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

Complete. Production runs exact immutable release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017. One live migration invocation applied exactly `[16,17]`; rollback was not used. The correction preserved the reviewed academic-data, provenance, lineage, object-identity, Favorites/private-overlay, and non-active-residue invariants without inspecting private research rows. The bounded release is exhausted and execution is stopped for independent Owner/ChatGPT review.

## Completed

- Read the repository workflow and production runbooks.
- Verified clean local/tracking/remote equality at candidate `f7b9ef0…`.
- Verified prerequisite checkpoints `51c3d7b… → 836d786… → f7b9ef0…` and their durable independent-green evidence.
- Verified schema head 017, append-only migration filenames, byte-identical candidate/production migrations 001–015, and the bounded two-migration delta.
- Selected this new task ID and exact candidate without choosing a later documentation-only checkpoint.
- Recorded exact workflow run `32110757279` failing safely before packaging on an asynchronous frontend-test readiness race; repaired only that test and passed the affected 93-test frontend file.
- Recorded exact workflow run `32111110773` passing all 424 repository tests/typechecks/builds before failing safely on stale compiled schema-15/self-service-password acceptance; repaired only `backend/scripts/compiled-acceptance.mjs` to expect schema 17 and exercise the approved Owner-issued Member reset flow.
- Passed local compiled acceptance after the repair: schema 17, restart, retired self-service route, credential reset/session revocation/fresh login, backup/receipt/restore, and zero redeploy migrations.
- Passed GitHub Actions run `32111496535` for exact candidate `855b63c…`: full tests, typechecks, builds, dependency audits, Argon2id benchmark, compiled acceptance, Linux native artifact verification, upload, and independent fresh-runner download/verification.
- Bound artifact ID `9315081408`, GitHub artifact SHA-256 `4ba3592680daea05a27e43a08f57f135c70deb75917f1574a3db67a6c84ae413`, archive SHA-256 `360397616cc3767181737650c45608df6232cf77d71b3c6fcc48a67c940ee375`, manifest SHA-256 `d9122eb97329834f8d2bf1909c87ffa426eaf8b1c59ecf2d1c53edb9d1970a62`, Linux x64, Node `v24.19.0`, and verified ELF64 native modules to the four-file bundle.
- Passed read-only production preflight at exact prior release `25cdab1…`, schema/history/checksums 001–015, integrity `ok`, zero foreign-key violations, expected protected-path hashes, one loopback listener, active-but-disabled service state, and unchanged 320/384 MiB resource policy.
- Created fresh schema-v15 rollback backup `academiccloud-pre-prod06a-20260818T073533Z.sqlite` (438,272 bytes; SHA-256 `cdc2aec14888d04172bce4555dd6d17f10b5fb7c45efa9c7133070ce4f5bf7c4`), verified its 557-byte receipt (SHA-256 `cc1af93dfce4a19f8a82ab8e3f0a90690af3a2f50ae47f7b3435d7e52e7b92d4`), encrypted it to age ciphertext (438,568 bytes; SHA-256 `8349ef5e90e72ff763d7730aadd98df56600e091f431a2c07d2b5a432eda8bf6`), and independently retrieved byte-identical files from private off-host commit `9c8f4503e48e55ea7b65aebe35dd242e878c95e8`.
- Passed the one isolated production-backup v15→v17 rehearsal with exact `[16,17]`, empty idempotency pass, compiled memory-storage restart health/readiness, integrity `ok`, zero foreign-key violations, rollback compatibility with exact `25cdab1…`, and evidence SHA-256 `24daf6272616c64d9969b37631afcb230156625b83582ef0fd339caf789b8f5a`.
- The isolated transition preserved all 32 preexisting stable file IDs/object keys/checksums/uploader provenance, Scholarly Record/Artifact/Version lineage, Favorites/private-overlay state, and non-active residue; it created one canonical Library with three effective active-account memberships and deterministically transitioned/backfilled 28 eligible active holdings without exposing private rows.
- The first live cutover attempt stopped before release switch or migration because the final opaque snapshot probe's sandbox did not permit SQLite WAL companion access. The guard restarted exact `25cdab1…`; read-only verification proved schema v15, integrity/FK, health/readiness, service state, and Library-zero state unchanged. The probe was narrowed logically with `query_only` while receiving the same reviewed `/var/lib/academiccloud` filesystem boundary required by SQLite, then the transaction was safely retried.
- Installed exact root-owned release `855b63c…`, atomically selected it, invoked the compiled migration runner once, and applied only migrations 016–017. No reverse SQL, ad-hoc cleanup, package install/build, systemd policy/autostart, Nginx, DNS/TLS, firewall, credential, OSS-policy, or unrelated infrastructure change occurred.
- Final live history/checksums are exact 001–017; `integrity_check=ok`; `foreign_key_check=0`; preexisting safe aggregates remain accounts 5, folders 4, files 32, sessions 18, invitations 5, announcements 1; canonical Libraries/memberships are 1/3; live contributions and credential resets remain zero.
- Passed disposable exact-release acceptance with in-memory storage and no listener: Member upload remained hidden as submitted/pending until Owner approval, Member approval was denied, Owner approval shared the same file/object/provenance, Favorites remained account-private, Owner-assisted reset stored no raw token and revoked the old session, self-service password change remained 404, and stale recycle conflict → refresh → retry → restore succeeded without permanent delete. Synthetic state was removed; evidence SHA-256 is `db841199ed658675b6b2ba2fef2f38684baaa513ba817fe66e2b051d4c1728d1`.
- Final service state is active with autostart still disabled, `NRestarts=0`, one `127.0.0.1:3000` listener and no non-loopback API listener, health/readiness 200 on loopback and public HTTPS, 97,509,376-byte memory peak below unchanged limits, zero cgroup pressure/OOM events, zero failed units, zero post-start service errors, and zero kernel OOM findings. Public index/JS/CSS hashes match the exact installed release; environment/systemd/Nginx/security-header/logrotate hashes are unchanged.
- Removed only the verified artifact/rehearsal/synthetic staging directories after use. Retained the immutable current/prior releases, fresh plaintext rollback backup, receipt, age ciphertext, and safe production evidence. No real Member account/private activity was queried, authenticated, mutated, archived, disabled, or used for acceptance.

## Remaining

None. The bounded production window is exhausted.

## Blockers

None. One pre-migration snapshot invocation failed closed on an overly restrictive filesystem sandbox; the old service was restarted and the exact old release/schema were confirmed unchanged before the sandbox correction. No rollback pair was consumed, and no material migration, integrity, authorization, privacy, or rollback anomaly occurred.

## Last Verification

2026-08-18 final production verification: exact release `855b63c49f12f3375972774e7bc7385088b0495e`; schema v17/history and file checksums 001–017 exact; live migration result `[16,17]`; integrity `ok`; foreign keys zero; canonical Library/membership/transition/backfill counts 1/3/28/28; live contributions/resets zero; safe preexisting aggregates unchanged. Service active/autostart disabled/`NRestarts=0`; health/readiness 200; API loopback-only; memory peak 97,509,376 bytes under unchanged 335,544,320/402,653,184-byte policy; cgroup pressure/OOM, failed units, post-start service errors, and kernel OOM all zero. Exact public assets, protected infrastructure hashes, fresh backup/receipt/ciphertext hashes, isolated rehearsal, rollback compatibility, and focused disposable product acceptance are green.

## Next Action

STOP for independent Owner/ChatGPT review. Do not resume `RF-META01` or another parked task, contact/mutate production again, merge main, run `PROD-03C2`, permanently delete data, change infrastructure/autostart, or begin OCR/RAG without new explicit Owner authorization.
