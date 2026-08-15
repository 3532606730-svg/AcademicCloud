## Task ID

PROD-03C1 — Public HTTPS/Nginx Edge Cutover and Minimum Machine Verification

## Goal

Enable the reviewed public HTTPS/Nginx edge for `cloud.ajtlab.top` (the exact prepared AcademicCloud site on the existing TLS certificate) and complete its minimum machine verification over the public HTTPS path — only after the durable encrypted off-host backup/restore gate and this task's independent review pass — while keeping rollback to the current loopback-only state immediate and safe.

## Scope

- recover the synchronized PROD-03B completion checkpoint, exact release/unit/environment/database/account identities, and the loopback-ready host baseline before any change
- first honor the durable pre-cutover gate recorded in the PROD-03C backlog: complete an encrypted off-host backup and isolated restore rehearsal of the production database and environment (destination, key custody, and any new cost remain Owner gates); the public route is enabled only after that gate passes
- render the exact prepared `deployment/nginx/academiccloud.conf` and `academiccloud-security-headers.conf` into the active Nginx tree, run `nginx -t`, and reload Nginx atomically; keep the prior default-only tree and listener state recorded for rollback
- verify the public HTTPS path with minimum machine checks: exact hostname/TLS chain, HTTP→HTTPS behavior, security headers, static asset serving, `/api/health` and `/api/ready` through the edge, login/session over HTTPS, and the approved browser CORS/upload preflight boundary unchanged
- keep the systemd unit unchanged (still disabled-but-active, loopback-only backend), measure whole-host memory/swap and cgroup/kernel OOM evidence during the HTTPS verification, and confirm no secret, cookie, or signed URL enters chat, Git, logs, or evidence
- define and record the exact rollback (remove the active site, reload Nginx, verify loopback state) and stop before any live OSS object acceptance, permanent deletion, or renewal activation

## Non-goals

- live OSS object upload/download/delete, browser E2E with real production material, permanent deletion, or bucket deletion (later PROD-03C steps)
- certificate renewal activation, firewall/security-group changes, DNS changes, or any new paid resource
- changing the systemd unit, SQLite durability, Argon2id parameters, TLS verification, or any accepted hardening boundary
- Layer 2, OCR, RAG, AI, connectors, mobile, desktop sync, or architecture expansion

## Acceptance Criteria

- [ ] repository/Git/GitHub and the loopback-ready host baseline pass a read-only preflight before the first task write
- [ ] the durable encrypted off-host backup and isolated restore gate passes before the public route is enabled, or the task stops at that Owner gate without cutover
- [ ] independent read-only Reviewer approves the exact edge files, Nginx procedure, verification plan, and rollback behavior before the active Nginx tree is changed
- [ ] `nginx -t` passes, the active tree contains exactly the reviewed AcademicCloud site, and the service/host/OSS/CORS state is otherwise unchanged
- [ ] public HTTPS checks pass: exact certificate chain/hostname, HTTP→HTTPS handling, security headers, static assets, `/api/health`/`/api/ready`, and one real login/session round trip without exposing credentials or cookies
- [ ] whole-host memory/swap headroom and cgroup/kernel OOM evidence remain zero during the HTTPS verification
- [ ] exact rollback instructions and pre-change Nginx/unit/listener records are retained and the task remains fully reversible
- [ ] applicable syntax/diff/secret checks and independent read-only review pass
- [ ] durable state is updated, the task card moves to `tasks/done/`, a clean task-level commit is pushed through strict SSH, and local/private GitHub refs plus the connected default branch match

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files

- `deployment/nginx/academiccloud.conf`
- `deployment/nginx/academiccloud-security-headers.conf`
- `deployment/systemd/academiccloud.service`
- `docs/deployment/production-runbook.md`
- `docs/deployment/oss-deployment-checklist.md`
- `docs/deployment/backup-recovery.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `tasks/doing/PROD-03C1.md`

## Current State

In progress on `codex/prod-03c1` from the synchronized PROD-03B completion checkpoint `f1d2a6aff3cea1c2af24114329d13a737d58bb1c`. The Owner approved a pure-online zero-new-cost backup design: a dedicated private `AcademicCloud-Backups` GitHub repository, asymmetric/public-key encryption (`age`) with the private key vaulted online (Bitwarden preferred, never in GitHub or on the host), database plus required configuration/recovery material only, and no OSS object bytes. Read-only preflight passed: phase `loopback-ready`, service disabled-but-active on exactly `127.0.0.1:3000` with health/ready `200`, Nginx default-only, exact release/unit identities, environment root:root 0600, database `academiccloud:academiccloud` 0600, certificate valid beyond 30 days, `age` not yet installed (apt candidate `1.1.1-1ubuntu0.24.04.3`, zero cost), 13 GiB disk free, 532,480 KiB MemAvailable, swap intact, zero failed units. The prepared edge files remain root-only outside the active Nginx tree.

## Completed

- Recovered the synchronized completion checkpoint and created the bounded task branch.
- Recovered the backup/restore source and runbook procedures (compiled `backup-main.js` create/verify, isolated restore rehearsal, maintenance dry-run).
- Completed the read-only preflight above.
- Installed `age` 1.1.1 from the existing Ubuntu repository on the host (zero cost; apt clean; service/Nginx untouched).
- Generated the production `age` keypair with the official age implementation (typage `age-encryption` 0.3.0 in a repo-external tools directory): public recipient `age1s4aqa7gpkeeg52rl8efrqzp7ml77skslfjh882e0klrpuhrzsqpsnvqsq0` committed at `deployment/backup/academiccloud-backup-age.pub`; the private identity exists only in the Owner-custody file `D:\academiccloud-tools\agekey\academiccloud-age-key.txt` (75 bytes, awaiting Bitwarden vaulting, never printed or transmitted).
- Verified interop in both directions between the local official age implementation and the host's official `age` 1.1.1 binary (host decrypts locally encrypted test data; local identity decrypts host-encrypted data with the production public key).
- Created and verified the production consistent backup `academiccloud-20260815T110907Z.sqlite` via the compiled operation under the hardened transient unit: bytes `122880`, SHA-256 `a457628a32996217930934a61ab3cd9f3351eda3135ccda68dd5ca0a8972e5a1`, schemaVersion `4`, counts `{accounts:1, folders:0, files:0, sessions:2}`.
- Encrypted on the host with the production public recipient: `database.age` (SHA-256 `753897f0e43f3cc72c73441cfe9e0b75025b3f3b89500a0f518bffa5b51fac28`, 123,096 bytes) and `configuration.age` (SHA-256 `40150e21ba4893e775f8a98c0d177e275815c4c74d39ef33b7ed760d2a2e99b7`, 2,747 bytes) containing `academiccloud.env`, the exact systemd unit, and both prepared Nginx edge files; all plaintext staging copies were removed and only encrypted artifacts plus summaries remain.
- Decrypted both artifacts locally with the production private identity: the database plaintext SHA-256 matches the recorded backup hash exactly, and all four configuration members match their host hashes (`4ba60fb6…` env, `fed6c26d…` unit, `0686a461…` and `d9a1125b…` Nginx files); no value was printed or retained locally.
- Ran the isolated restore rehearsal with a temporary unit mirroring the production hardening: restored database passes integrity/foreign-key/migration checks (`journalMode=wal`, `integrity=ok`, violations `0`, migrations `4/4`, counts `1/0/0/2`), the compiled app served `/api/health` and `/api/ready` with `200` on an isolated port with `STORAGE_PROVIDER=memory`, the compiled maintenance dry-run returned `{"mode":"dry_run","limit":100,"expiredSessions":{"selected":0,"pruned":0},"files":[]}`, and production remained untouched (service pid `34558`, listener `127.0.0.1:3000`, Nginx default-only, backup hash unchanged, zero failed units). Rehearsal staging must live under `/var/lib`, never `/var/tmp` (`PrivateTmp=true` masks the latter inside the unit namespace; documented).
- Recorded the durable procedure in `docs/deployment/encrypted-backup.md` and linked it from `docs/deployment/backup-recovery.md`.

## Remaining

- Owner boundary: create the private `AcademicCloud-Backups` GitHub repository and vault the `age` private identity in Bitwarden; verify the vaulted key fingerprint equals the committed recipient.
- Push only the encrypted artifacts plus the non-secret manifest to `AcademicCloud-Backups`.
- Independent read-only review of the whole backup/restore gate.
- After the gate passes: review, atomically enable, and verify the public HTTPS/Nginx edge with exact rollback retained.

## Blockers

The mandatory Owner boundary is now reached: (1) create the private `AcademicCloud-Backups` GitHub repository, and (2) vault the `age` private identity into Bitwarden. The public route stays closed until both actions are confirmed, the encrypted artifacts are pushed, and the independent review passes.

## Last Verification

2026-08-15 (backup gate): production backup created and verified (SHA-256 `a457628a…`, schema 4, counts 1/0/0/2); encrypted artifacts `database.age` `753897f0…` and `configuration.age` `40150e21…` decrypt locally with the production identity and match every recorded hash; official `age` interop verified both directions; isolated restore rehearsal passed with the compiled app (health/ready `200`, memory storage, maintenance dry-run clean) and left production untouched; host staging contains only encrypted artifacts and summaries.

## Next Action

Stop at the shortest mandatory Owner boundary: the Owner creates the private `AcademicCloud-Backups` repository and vaults `D:\academiccloud-tools\agekey\academiccloud-age-key.txt` into Bitwarden, then confirms (optionally pasting the vaulted key's derived public key from `age-keygen -y` for fingerprint comparison). After that, push the encrypted artifacts and manifest, complete the independent review, and only then proceed to the edge cutover.
