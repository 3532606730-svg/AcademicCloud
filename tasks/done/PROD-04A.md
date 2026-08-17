## Task ID

PROD-04A — Routine Multi-User Release 34a2eada

## Goal

Deploy and accept the exact independently green OPS01A checkpoint `34a2eada158dcf08783dc9538d853f9361425e8a` as the stable multi-user production generation, using only its verified Linux x64 / Node 24 artifact and the explicitly authorized schema v4→v8 transition.

## Scope

- Recover repository and live production truth, then fail closed unless the live database is schema v4 with one account, integrity `ok`, and zero foreign-key violations.
- Verify the exact GitHub Actions artifact/source identity and Linux native/runtime evidence without building or installing on Alibaba.
- Create and independently verify a consistent v4 backup plus encrypted off-host evidence.
- Rehearse exactly migrations 005–008 on an isolated v4 copy before live migration.
- Deploy only `34a2eada158dcf08783dc9538d853f9361425e8a`, migrate v4→v8, and preserve the exact old-release/v4-database rollback pair.
- Complete production acceptance for Owner login, invitations/Member registration, account isolation, password change/revocation, disable/re-enable, announcements, Favorites, recycle/restore, upload/download/Preview, health, resources, and final database integrity.
- Reconcile durable repository state and stop before any later feature or production operation.

## Non-goals

- Migration 009 or later, RF-AUDIT01 or later RF code, repository HEAD deployment, main merge, or feature development.
- Production `npm install`, `npm ci`, `node-gyp`, native compilation, frontend build, Docker, or another artifact build.
- OSS/DNS/TLS/Nginx/systemd mutation, reboot/autostart changes, certificate renewal, HSTS, or production cutover to another topology.
- Permanent file/OSS deletion, reverse SQL, old-binary use against schema v8, Owner password changes, or testing another real Member's account/data.

## Acceptance Criteria

- [x] Pre-mutation live schema/account/integrity/FK, exact artifact/source, host/resource, and runbook gates pass.
- [x] A consistent v4 backup and encrypted off-host copy are verified, and the rollback release/database pair is exact.
- [x] The isolated v4→v8 rehearsal applies only 005–008, passes runtime/compiled/durability/resource acceptance, and redeploys with zero migrations.
- [x] Live deployment selects only `34a2eada158dcf08783dc9538d853f9361425e8a`; schema history is exactly 1–8; migration 009+ is absent.
- [x] Owner/Member invitation, isolation, password change/revocation, disable/re-enable, and announcement acceptance pass without exposing credentials or tokens.
- [x] A synthetic Member file passes upload, exact download hash/name/bytes, Preview, Favorite add/remove, recycle/restore, and remains recoverable/active without permanent deletion.
- [x] Final state retains one active Owner, one Owner-confirmed active real Member, two disabled acceptance Members with zero live sessions, one unpublished acceptance announcement, and the active synthetic acceptance file.
- [x] Final health/readiness, listener, database, cgroup/whole-host/swap/OOM, configuration-hash, public-asset, and rollback-backup checks pass read-only.
- [x] Durable records and independent read-only review pass; the clean task-level checkpoint is ready for commit/push and synchronization verification.

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`
- `docs/decisions/ADR-011-accounts-and-invitation-security-model.md`
- `docs/decisions/ADR-012-global-announcement-publication-model.md`
- `docs/decisions/ADR-013-authenticated-password-change-model.md`

## Relevant Modules / Files

- `docs/deployment/production-runbook.md`
- `docs/deployment/backup-recovery.md`
- `docs/deployment/encrypted-backup.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `README.md`
- `AGENTS.md`
- `tasks/ready/PROD-03C2.md`
- `tasks/done/PROD-04A.md`

## Current State

Complete. Live deployment, browser/runtime acceptance, durable-record reconciliation, and independent final review are green. No feature task is active or authorized.

## Completed

- Selected exact GitHub Actions run `31997033717` artifact for source `34a2eada…`; verified GitHub ZIP SHA-256 `30150147f8a776d26de495ed3ca43d01de61eb72b21764518ff8458fe8d96dd4`, archive SHA-256 `63d13be6731269e52af322e4a2a7214b7ba9f0299cd0ac957653728b977e4581`, manifest SHA-256 `76c39b2d84684faf13d8dd0548f0744f0c4c23b1d8ae6b7465bd453f38dbcbce`, 4,681 files, Linux x64 / Node `v24.19.0`, `better-sqlite3`, Argon2id `m=65536,t=3,p=1`, and compiled acceptance.
- Verified consistent v4 backup `academiccloud-pre-34a2eada-20260817T135543Z.sqlite` (122,880 bytes, SHA-256 `7635f6cb313d957ad9e360b290d6b1a9d5a0ba244bd3bc4ebae469bb34ef0cf6`) and age ciphertext (123,096 bytes, SHA-256 `dddfa97ef2c52201a8e8de79c9e09d25e4197a195cd96ca11cc342adb05c2dab`) in private off-host backup commit `4b527e48be8d4f91c50c93ef9ea49caf9560b088`.
- Passed isolated v4→v8 rehearsal with migrations `[5,6,7,8]`, zero redeploy migrations, integrity/FK/durability/runtime/maintenance/resource checks, and no real OSS access.
- Deployed the exact release, migrated only 005–008, kept the service disabled-but-active and loopback-only, and preserved rollback pair `15181f90d6eecbb0ddb977a0168536a445802ec7` plus the exact v4 backup.
- Completed real browser acceptance with synthetic invitations, two disposable Members, cross-account non-disclosure, password change and old-password/session revocation, disable/re-enable, announcement publish/unpublish, Favorites, recycle/restore, and exact upload/Preview/download verification.
- Preserved the 235-byte synthetic TXT as active; its downloaded SHA-256 `210dfdaae6d81d1deea0a95db9ee8cad726c32363de598eb375de764f723c7ae` matched the local source. No file or OSS object was permanently deleted.
- Owner independently created and confirmed one additional real Member during the window; it remains active and was not inspected or tested. Both acceptance Members are disabled; Owner-created invitations remain untouched.
- Final read-only host verification passed at schema v8/history 1–8, integrity `ok`, FK 0, health/ready 200, one loopback listener, zero restarts/cgroup events/post-release OOM, 524,792 KiB `MemAvailable`, and full swap free.
- Independent read-only Reviewer PASS with no blocker, medium, or actionable low/nit; task-section, tracked-diff, scope, evidence consistency, and secret checks are green.

## Remaining

None.

## Blockers

None.

## Last Verification

2026-08-17 live acceptance: deployment `PASS`, rollback unused; exact release `34a2eada…`; schema `[1,2,3,4,5,6,7,8]`; final accounts aggregate `4` = one active Owner, one active Owner-confirmed real Member, two disabled acceptance Members; acceptance-member live sessions `0`; invitations `4` = three consumed and one unused with none revoked; acceptance announcement inactive; acceptance TXT active. Database integrity `ok`, FK violations `0`, WAL retained, and the deployed database module hash `4698b040b424e090385b4187dcda836cd268fffb562cfdc259f97a83c7840773` matches the artifact that enforces `synchronous=FULL`, FK ON, 5-second busy timeout, and trusted-schema OFF.

Final host/runtime: service active and autostart disabled since `2026-08-17 22:38:19 CST`; `NRestarts=0`; memory current/peak `92,717,056 / 199,020,544` bytes under unchanged 320/384 MiB bounds; cgroup `high/max/oom/oom_kill/oom_group_kill=0`; `MemTotal=916,044 KiB`; `MemAvailable=524,792 KiB`; `SwapFree=1,048,572 KiB`; kernel OOM since this release start `0`; failed units `0`; Nginx/SSH active; exactly one `127.0.0.1:3000` listener and no non-loopback listener. Nine current-boot OOM keyword lines are the already-known 2026-08-16 pre-release verifier failures and predate this release start; they are not post-deployment events.

Public frontend hashes remain exact: index `f7c88f0809f20872f76ef575423f00aa549e22e1c53d4874a7c18d9d6e908c99`, JS `4d0ff2bbb8fcbba9dfaa3bce01fef16a6b4d0676712f64f776a8d9a350b1f7dc`, CSS `afdf90c5b7e12b99ce71f9bd35fb78692098bdc09c182ba2d61d8357a29790f8`. Environment/unit/Nginx site/security-snippet hashes are respectively `a9723ff4638fe43ceb646c0ceaef7c46c82c5da6a7249525c66d0a06b9395bed`, `fed6c26d80ad070decf4ddeabb7f4af6d23c38c24d2494666c7bfe981e39500b`, `0686a46171df93bead05ddbd2c9c2dbbbc5ba7846a118594c679971d19445447`, and `4f1f9059abe3dd61224acf5ac81b90e0cad24d5571c8feff66c39e0cb72ca9ca`. Rollback backup SHA-256 remains `7635f6cb313d957ad9e360b290d6b1a9d5a0ba244bd3bc4ebae469bb34ef0cf6`. The initial monolithic artifact verifier exceeded its 600-second time budget at a 345.4 MiB peak without OOM or production impact; equivalent streaming manifest verification plus separate native/Argon2/compiled acceptance passed under the unchanged limits.

Repository-only closure: exact 13-section task contract PASS; `git diff --check` PASS; changed-text secret scan PASS; independent read-only Reviewer PASS with no blocker, medium, or actionable low/nit. No product code, migration, dependency, lockfile, infrastructure template, or production configuration entered the tracked diff.

## Next Action

Create/push the clean PROD-04A repository checkpoint, prove synchronization, and STOP. Do not start RF-META01, PROD-03C2, or any later task.
