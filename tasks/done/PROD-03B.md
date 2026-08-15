## Task ID

PROD-03B — Secret-Safe Activation, OSS CORS, Account, Loopback Service, and TLS Preparation

## Goal

Activate the installed verified production release through the reviewed hidden-input path, configure the exact private-bucket browser CORS boundary, create the first production database/account, run and fully verify the real hardened systemd unit on loopback, and issue and verify the production TLS certificate without enabling a public AcademicCloud Nginx route.

## Scope

- reconfirm the synchronized PROD-03A checkpoint, immutable release identity, host health, DNS, inactive application, unchanged active Nginx tree, and clean secret/database/account/certificate baseline
- tighten and review the resumable activation tooling where needed before secrets are accepted, while preserving secret-only stdin ingress and fail-closed phase recovery
- accept the Owner-provided single-row Alibaba RAM export only through the local wrapper's mandatory repository-external CSV path: parse the exact six-column row locally, use its RAM console password transiently only to reject password reuse, clear the full-row references before remote activation, and retain only the AccessKey pair needed for stdin; collect ACME email and first login name through visible Owner-private local prompts and an independent initial AcademicCloud password through hidden local input; outside the Owner-provided source CSV, transient wrapper memory, root-owned mode-0600 service environment, and exact production service process, the AccessKey secret must not be copied or persist anywhere, while the plaintext AcademicCloud password remains stdin/memory-only and neither secret may enter chat, Git, argv, wrapper/auxiliary-process environment, shell history, logs, evidence, backups, frontend, or database rows
- treat the AccessKey ID, ACME email, and login as Owner-private identifiers: keep them out of chat, Git, general logs, and evidence while allowing only their necessary root-protected configuration, ACME registration, service environment, command input, and account-database uses
- have the Owner configure the dedicated bucket CORS rule in the Alibaba console with exact origin `https://cloud.ajtlab.top`, method `POST`, empty allowed/exposed headers, `Max-Age=300`, and no wildcard; the platform has no credentials toggle and emits `Access-Control-Allow-Credentials: true` automatically on the approved preflight, which the wrapper accepts only as absent or exactly one case-insensitive `true`, and then prove those settings against the actual browser upload flow before any live object acceptance
- reconfirm the bucket is dedicated and empty, ACL private, Block Public Access enabled, versioning disabled and never previously enabled, static website hosting disabled, no public policy/object ACL, no active-object lifecycle rule, and zero-additional-cost SSE-OSS/AES-256 enabled rather than KMS
- reconfirm the dedicated RAM policy has exactly `oss:PutObject`, `oss:GetObject` (which authorizes the HeadObject API), and `oss:DeleteObject` on `acs:oss:*:*:ajt-academiccloud-kl-8f3c/objects/*`, with no bucket listing, ACL, CORS, versioning, website, policy, object-ACL, KMS, or administrative action
- issue and verify the exact `cloud.ajtlab.top` ACME certificate through the existing port-80 webroot path without enabling the AcademicCloud production site
- atomically install the root-owned mode-0600 production environment, migrate the empty production SQLite database, provision the first account with unchanged Argon2id parameters, and start the exact installed service while it remains disabled and loopback-only
- verify the real service environment, StateDirectory, ProtectProc and all accepted systemd hardening; complete loopback health/readiness/authentication checks and measure whole-host memory/swap, cgroup peak/events, and kernel OOM evidence under a real Argon2id login
- retain non-secret phase/evidence records, exact cleanup/rollback instructions, and a post-activation host/service/security audit

## Non-goals

- enabling the AcademicCloud Nginx site, changing the active Nginx tree, exposing the application publicly, activating certificate renewal, changing firewall/security-group rules, or production cutover
- live OSS object upload/download/delete, browser E2E, production material, permanent deletion, or bucket deletion
- encrypted off-host backup/restore, key-custody selection, backup retention, or any new paid resource; these remain PROD-03C Owner gates
- `npm install`, `npm ci`, `node-gyp`, native compilation, frontend build, TypeScript build, Docker, or any application build on Alibaba
- weakening Argon2id `m=65536,t=3,p=1`, SQLite WAL/FULL durability, KDF concurrency, owner isolation, TLS verification, systemd hardening, `MemoryHigh=320M`, `MemoryMax=384M`, or the 128 MiB whole-host headroom gate
- Layer 2, OCR, RAG, AI, connectors, mobile, desktop sync, or architecture expansion

## Acceptance Criteria

- [x] repository/Git/GitHub, exact release, host health, DNS, Nginx, deployment, and empty activation-state preflight pass before the first task write
- [x] independent read-only Reviewers approve the task boundary, exact Owner instructions, activation changes, transfer/install commands, evidence plan, and rollback/recovery behavior before secrets or cloud configuration are changed
- [x] Owner completes the local wrapper using the reviewed repository-external exact one-row RAM CSV input and visible local Owner-private email/login plus hidden independent application-password prompts, without copying the AccessKey secret from that Owner-provided source CSV into any additional local file or placing the AccessKey secret or AcademicCloud password in chat, Git, argv, wrapper/auxiliary-process environment, logs, evidence, backups, frontend, or database rows; neither RAM secret is reused, only the exact production service may load the protected host environment, and the plaintext AcademicCloud password remains stdin/memory-only
- [x] Owner confirms the exact dedicated RAM policy contains only `oss:PutObject`, `oss:GetObject` (including HeadObject), and `oss:DeleteObject` on `acs:oss:*:*:ajt-academiccloud-kl-8f3c/objects/*`, plus every bucket security property including SSE-OSS/AES-256 rather than KMS; any nonconforming or nonempty state stops without Agent-side bucket/RAM remediation, object deletion, or secret rotation
- [x] dedicated bucket security properties and the exact browser CORS rule (`https://cloud.ajtlab.top`, POST only, empty allowed/exposed headers, `Max-Age=300`, no wildcard origin; `Access-Control-Allow-Credentials` absent or exactly one case-insensitive `true`) pass the positive production-origin probe plus negative origin, HTTP scheme, localhost, unapproved-header, and GET-method OPTIONS probes; a fixed absent-object HEAD and anonymous bucket listing remain denied with 403
- [x] certificate chain, expiry, hostname, and exact SAN set pass for `cloud.ajtlab.top`; no AcademicCloud public route is enabled and certificate-renewal activation remains closed for PROD-03C
- [x] production environment is root-owned mode 0600, complete and exact; secret scans expose no value; the database is newly migrated with unchanged SQLite durability and the first account is verified with unchanged Argon2id parameters
- [x] exact installed systemd unit remains unchanged, disabled but active, loopback-only on `127.0.0.1:3000`, and passes real EnvironmentFile/StateDirectory/ProtectProc/security checks
- [x] loopback health, readiness, login/current-session/logout, database integrity/migrations, and service restart/session persistence pass without exposing credentials or cookies
- [x] whole-host minimum MemAvailable remains at least 128 MiB, swap remains available, cgroup peak/events are measured, and cgroup/kernel OOM evidence is zero during the real Argon2id authentication workload
- [x] no live object write, active Nginx route, public cutover, production data, paid resource, disk resize, system hardening change, or Layer 2 work occurs
- [x] applicable syntax/tests, exact file and phase checks, secret scan, diff review, independent read-only review, and host cleanup/state audit pass
- [x] durable state is updated, the task card is moved to `tasks/done/`, a clean task-level commit is pushed through strict SSH, and local/private GitHub refs plus the connected default branch match

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files

- `scripts/alibaba-production-activate.sh`
- `scripts/production-owner-bootstrap.ps1`
- `scripts/run-prod03b-prepare.ps1`
- `scripts/run-prod03b-activation-fix.ps1`
- `scripts/alibaba-production-foundation.sh`
- `deployment/systemd/academiccloud.service`
- `deployment/env/academiccloud.env.example`
- `deployment/nginx/academiccloud.conf`
- `deployment/nginx/academiccloud-security-headers.conf`
- `backend/src/platform/config.ts`
- `backend/src/auth/`
- `backend/src/storage/aliyun/aliyun-oss-adapter.ts`
- `frontend/src/`
- `docs/deployment/production-runbook.md`
- `docs/deployment/oss-deployment-checklist.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `tasks/done/PROD-03B.md`

## Current State

Complete. The exact installed activation `93ee91d5cca92957beea817c1beb278a357ce6f6cba87967192d96c7a32d5be6` (root:root 0600) reached phase `loopback-ready` on 2026-08-15. The exact `cloud.ajtlab.top` certificate is issued and verified; the root-owned mode-0600 environment is installed; the database is migrated at version 4 with exactly one account whose Argon2id hash verifies the Owner input; the exact hardened unit is **disabled but active** with `MainPID=34558` and the single listener is exactly `127.0.0.1:3000`; health/readiness return `200`; login/current-session/restart-session-persistence/logout acceptance passed with `{"status":"ok","login":true,"preRestartSession":true,"sessionSurvivedRestart":true,"readinessAfterRestart":true,"logoutRevoked":true}`; the measured real-Argon2id run kept minimum `MemAvailable=429,512 KiB`, `SwapFree=1,048,572 KiB`, cgroup peak `112,390,144` bytes with all memory-pressure/OOM deltas zero and kernel OOM evidence absent; Nginx remains default-only and the application is not publicly routed. Production remains closed until the separately gated PROD-03C1 edge task.

## Completed

- Recovered the synchronized PROD-03A completion state and created the bounded task branch.
- Defined the exact activation, CORS, certificate, loopback-runtime, resource, secret-handling, and production-closed boundaries.
- Preserved the mandatory Owner interaction for hidden local input and Alibaba console CORS/bucket confirmation; no secret value was ever requested in chat.
- Completed a fresh read-only preflight: Git/GitHub synchronized at `478a2a39d16e984e484c4ec6ff0339ee6c8f189e`; host systemd `running` with zero failed units; DNS A `47.250.126.42`; no port 3000; no activation residue.
- Confirmed anonymous OSS bucket HEAD and list denial (`403`), then confirmed the exact CORS rule live: positive production-origin preflight `200` with exact origin, `POST` only, `Max-Age=300`, empty allowed/exposed headers, and a platform-emitted `Access-Control-Allow-Credentials: true` (no console toggle); all five negative OPTIONS probes plus anonymous HEAD/listing `403` with no allow-origin.
- Corrected the OSS checklist to the actual XHR/FormData wire behavior and reconciled the platform-emitted credentials header in the wrapper gate (absent or exactly one case-insensitive `true`).
- Executed the reviewed non-secret prepare runner: atomically installed activation `98dbc9cfd676a3e784cb802a1a52e1b0058a249ce36ebe4969278f8bff31a660` (evidence `01d39a3020bb122d995cde5a6b064d90e4472f6ba257604deb5077f991e1f995`).
- Received the Owner's one-row Alibaba RAM export outside the repository; only its schema was inspected without emitting values.
- Recovered two fail-closed activation stops: (1) stale Argon2 encoded-prefix gate (`argon2` npm 0.45.1 emits `m=65536,p=1,t=3` order, not the classic `m=65536,t=3,p=1`) — fixed to an order-agnostic exact parameter-set gate with `argon2.verify` as the decisive check, installed as `944c1ee5c856ee101569f041187e57fbe9d8e9da63191af7aa37063caa3ba62b` (evidence `fdf0895c…`); (2) unsatisfiable `synchronous === 2` predicate on the raw read-only verifier connection (better-sqlite3 `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`; the application writable opener enforces `synchronous = FULL`, compiled dist verified) — verifier-only predicate removed, externally reviewed (PASS against `e02e0b4`), comment-corrected for a bash single-quote defect caught by the remote `bash -n` gate, and installed as `93ee91d5cca92957beea817c1beb278a357ce6f6cba87967192d96c7a32d5be6` (evidence `31ccced9…`).
- Proved through host disposable-DB demonstration and local better-sqlite3 13.0.3 matrix that the production account hash is the clean Owner password (newline control false) and that transport/encoding introduces no corruption.
- The Owner completed the reviewed wrapper run: CORS preflight PASS, protected remote activation identity PASS, certificate issued/verified, database migrated, account provisioned and verified, loopback service started and fully accepted (session/restart/logout JSON above), resource/OOM gates all zero, phase recorded `loopback-ready`, `activation-status=ok`, `accountVerified=true`, `certificateVerified=true`, `service=active-loopback-only`, `publicRoute=unchanged`.
- Independent read-only reconciliation after the Owner run confirmed every acceptance fact above, exactly one account and zero folders, a current-boot kernel OOM count of zero, and zero secret-shaped journal hits.
- The wrapper now carries the canonical Owner-facing identity `3e4ec97509e866a307d5049dc4ff0863b612b6ddb6a9af1354e8e28f234c3742`; the fix runner identity is `8dade64086207f1a8b4bf5bf38ba97c94400c20373312fe79b85f79768a19e2b`; `.gitattributes` keeps `*.ps1`/`*.sh` byte-stable against `core.autocrlf`.
- Made no live OSS object write, no public route change, no production-data mutation, no paid resource, no disk resize, no hardening change, and no Layer 2 work.

## Remaining

None for PROD-03B. Certificate-renewal activation and the public edge remain closed and belong to the PROD-03C sequence.

## Blockers

None for PROD-03B. PROD-03C retains the encrypted off-host destination/key-custody/new-cost boundary and the exact disposable-object permanent-delete confirmation as Owner gates; the durable plan requires an encrypted off-host backup and isolated restore before public cutover.

## Last Verification

2026-08-15 (final): read-only host reconciliation matched the Owner's accepted result exactly — phase `loopback-ready` root:root 0600; service disabled-but-active `MainPID=34558`; listener exactly `127.0.0.1:3000`; health/readiness `200`; exactly one account, zero folders; certificate valid beyond 30 days with SAN exactly `cloud.ajtlab.top`; Nginx `default` only; activation evidence `phase=loopback-ready`; resource evidence `status=ok` with `minimumMemAvailableKiB=429512`, `minimumSwapFreeKiB=1048572`, `cgroupMemoryPeakBytes=112390144`, all cgroup high/max/oom deltas zero, `kernelOomEvidence=absent`, `sampleSha256=869dfc5c…`; current cgroup memory events `0/0/0/0`; kernel OOM current boot `0`; service-journal secret-shape scan `0`. PowerShell/Node syntax, `git diff --check`, and secret scans passed for the checkpoint diff. No secret or CSV value was read, printed, or recorded.

## Next Action

Stop PROD-03B. After the completion checkpoint is pushed and the task branch is merged to `main`, start the bounded `PROD-03C1 — Public HTTPS/Nginx Edge Cutover and Minimum Machine Verification` task, which must honor the durable encrypted off-host backup/restore gate before enabling the public route.
