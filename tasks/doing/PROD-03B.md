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

- [ ] repository/Git/GitHub, exact release, host health, DNS, Nginx, deployment, and empty activation-state preflight pass before the first task write
- [ ] independent read-only Reviewer approves the task boundary, exact Owner instructions, activation changes, transfer/install commands, evidence plan, and rollback/recovery behavior before secrets or cloud configuration are changed
- [ ] Owner completes the local wrapper using the reviewed repository-external exact one-row RAM CSV input and visible local Owner-private email/login plus hidden independent application-password prompts, without copying the AccessKey secret from that Owner-provided source CSV into any additional local file or placing the AccessKey secret or AcademicCloud password in chat, Git, argv, wrapper/auxiliary-process environment, logs, evidence, backups, frontend, or database rows; neither RAM secret is reused, only the exact production service may load the protected host environment, and the plaintext AcademicCloud password remains stdin/memory-only
- [ ] Owner confirms the exact dedicated RAM policy contains only `oss:PutObject`, `oss:GetObject` (including HeadObject), and `oss:DeleteObject` on `acs:oss:*:*:ajt-academiccloud-kl-8f3c/objects/*`, plus every bucket security property including SSE-OSS/AES-256 rather than KMS; any nonconforming or nonempty state stops without Agent-side bucket/RAM remediation, object deletion, or secret rotation
- [ ] dedicated bucket security properties and the exact browser CORS rule (`https://cloud.ajtlab.top`, POST only, empty allowed/exposed headers, `Max-Age=300`, no wildcard origin; `Access-Control-Allow-Credentials` absent or exactly one case-insensitive `true`) pass the positive production-origin probe plus negative origin, HTTP scheme, localhost, unapproved-header, and GET-method OPTIONS probes; a fixed absent-object HEAD and anonymous bucket listing remain denied with 403
- [ ] certificate chain, expiry, hostname, and exact SAN set pass for `cloud.ajtlab.top`; no AcademicCloud public route is enabled and certificate-renewal activation remains closed for PROD-03C
- [ ] production environment is root-owned mode 0600, complete and exact; secret scans expose no value; the database is newly migrated with unchanged SQLite durability and the first account is verified with unchanged Argon2id parameters
- [ ] exact installed systemd unit remains unchanged, disabled but active, loopback-only on `127.0.0.1:3000`, and passes real EnvironmentFile/StateDirectory/ProtectProc/security checks
- [ ] loopback health, readiness, login/current-session/logout, database integrity/migrations, and service restart/session persistence pass without exposing credentials or cookies
- [ ] whole-host minimum MemAvailable remains at least 128 MiB, swap remains available, cgroup peak/events are measured, and cgroup/kernel OOM evidence is zero during the real Argon2id authentication workload
- [ ] no live object write, active Nginx route, public cutover, production data, paid resource, disk resize, system hardening change, or Layer 2 work occurs
- [ ] applicable syntax/tests, exact file and phase checks, secret scan, diff review, independent read-only review, and host cleanup/state audit pass
- [ ] durable state is updated, the task card is moved to `tasks/done/`, a clean task-level commit is pushed through strict SSH, and local/private GitHub refs plus the connected default branch match

## Relevant ADRs

- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files

- `scripts/alibaba-production-activate.sh`
- `scripts/production-owner-bootstrap.ps1`
- `scripts/run-prod03b-prepare.ps1`
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
- `tasks/doing/PROD-03B.md`

## Current State

In progress at the mandatory Owner boundary on `codex/prod-03b` from synchronized checkpoint `478a2a39d16e984e484c4ec6ff0339ee6c8f189e`. PROD-03A installed and verified the immutable release, service identity/directories, disabled/inactive exact unit, inactive prepared edge/bootstrap files, and Certbot 2.9.0. PROD-03B has now atomically installed the independently reviewed activation SHA-256 `98dbc9cfd676a3e784cb802a1a52e1b0058a249ce36ebe4969278f8bff31a660` as root-owned mode 0600 and removed its exact stage. No environment, database, account, AccessKey secret, certificate, application process, active AcademicCloud site, live OSS object, or production data exists. Production remains closed.

## Completed

- Recovered the synchronized PROD-03A completion state and created the bounded task branch.
- Defined the exact activation, CORS, certificate, loopback-runtime, resource, secret-handling, and production-closed boundaries.
- Preserved the mandatory Owner interaction for hidden local input and Alibaba console CORS/bucket confirmation; no secret value is requested in chat.
- Completed a fresh read-only preflight: Git/GitHub remain synchronized at `478a2a39d16e984e484c4ec6ff0339ee6c8f189e`; the host is systemd `running` with zero failed units, eight required base services active, `MemAvailable=541,268 KiB`, `SwapFree=1,048,572 KiB`, zero current-boot OOM, exact release/unit, inactive/disabled application, no port 3000, and no environment/database/certificate/activation/stage residue; DNS A remains `47.250.126.42`.
- Reconfirmed anonymous OSS bucket HEAD and list denial (`403`) and confirmed all current OPTIONS probes, including the production origin, return `403`, so the exact CORS rule has not yet been configured and no activation may begin.
- Corrected the OSS checklist to the actual XHR/FormData wire behavior and implemented reviewed candidates for exact certificate identity, secret-safe auxiliary operations, restart/session/cookie acceptance, stable-cgroup Argon2id resource sampling, OOM fail-closed evidence, pre-prompt CORS probes, and a non-secret atomic activation-script update.
- Received independent Reviewer PASS for activation `98dbc9cfd676a3e784cb802a1a52e1b0058a249ce36ebe4969278f8bff31a660`, Owner wrapper `1ec8a6322cb30e51b97f4f93e86a9223d7eaf72f578a619f3f9e280f12c98698`, and prepare runner `14a1c8397cc33e419ef644250f6fec0d6244d0267d9249145f1ed0e59a6caa92`. The wrapper identity `1ec8a632…` and runner identity `14a1c839…` were later superseded by the mandatory-CSV revision and pin reconciliation below and must not be used as Owner-facing pins.
- Executed the sole reviewed non-secret prepare runner. It atomically replaced old activation `b4e36d8070ff99a45393e251d94f2248b7803c74417175853fdae260909be01f`, retrieved and exact-parsed the seven-line evidence, and produced local evidence SHA-256 `01d39a3020bb122d995cde5a6b064d90e4472f6ba257604deb5077f991e1f995`.
- Reconfirmed after exact stage cleanup: remote activation is root-owned mode 0600 at the reviewed SHA; systemd is running with zero failed units; AcademicCloud remains disabled/inactive with `MainPID=0` and no port 3000; Certbot timer remains disabled/inactive; Nginx remains default-only; and no environment, database, certificate, phase/evidence, account, secret, or `academiccloud-prod03b-*` stage exists.
- Received the Owner's one-row Alibaba RAM credential export outside the repository. Only its schema was inspected without emitting values. The wrapper now requires that repository-external exact six-column local CSV, parses its one row transiently, clears the RAM console password and full-row references before SSH, rejects application-password reuse of either RAM secret, and preserves visible local Owner-private ACME-email/login prompts plus hidden independent application-password input.
- Received independent Reviewer PASS for the exact mandatory-CSV wrapper SHA-256 `3e7b66b6026b794d7ad339d9f2e90f7edc79c13df1ef1f40445274590b8780e6`; the Reviewer did not read, locate, hash, or output any source CSV value. CORS and remote-script identity gates remain before CSV access, so the current `403` stops safely before secrets are read. This pin was later superseded by the CORS-platform reconciliation below and must not be used as an Owner-facing pin.
- Reconciled the Owner-facing hash-pin mismatch on 2026-08-15: the stale `1ec8a632…` value quoted to the Owner was the superseded pre-CSV wrapper revision (unreachable blob `6bef7a705c42caf49ee4b56f468b8598a8bf66b9`, 9,429 bytes). The local file `3e7b66b6…` is the final reviewed mandatory-CSV revision (13,169 bytes), and the `1ec8a632… → 3e7b66b6…` delta is exactly the mandatory repository-external CSV change. Updated the prepare-runner pin to the canonical hash (new runner identity `62421fadd1129d85c878e4f343820bd069b94b72636f0bd2cf8d497a4ce3fe1b`) and added `.gitattributes` (`*.ps1`/`*.sh` `text eol=lf`) so `core.autocrlf` can never rewrite the pinned scripts on checkout.
- Created the reconciled checkpoint commit `5e93e06` on `codex/prod-03b` (pinned scripts, `.gitattributes`, OSS checklist, status docs, and this task card; committed blobs byte-identical to `3e7b66b6…`/`98dbc9cf…`/`62421fad…`) and pushed the branch through strict SSH; `origin/codex/prod-03b` matches the local checkpoint. The independent read-only Reviewer re-verified the final scripts and canonical hashes with verdict PASS.
- Reconciled the real Alibaba OSS CORS platform behavior on 2026-08-15: the live approved preflight returns `200` with exact origin, `POST` only, `Max-Age=300`, empty allowed/exposed headers, and a platform-emitted `Access-Control-Allow-Credentials: true` for which the OSS console exposes no toggle. Reproduced all probes: the five negative OPTIONS probes and the anonymous absent-object HEAD plus bucket listing all return `403` with no `Access-Control-Allow-Origin`. Confirmed the frontend direct-upload path sends no cookies or HTTP Authorization (multipart `POST` with server-signed policy fields only), so the platform header grants nothing. Revised the wrapper positive gate to accept the credentials header only as absent or exactly one case-insensitive `true` (duplicates or any other value fail closed); all other exact gates and all negative probes remain mandatory. New canonical wrapper SHA-256 `b1bd2a0676366216ac01038e10c7e20e80618185a6d8f12a1206ad8182650c0b`; prepare-runner pin updated accordingly (new runner identity `4b9e4a468ef2c3f2c5a59da5460e19c6360f4beab6afa22d1b70e2638847fe19`) and the OSS checklist no longer claims the platform must omit the header.

## Remaining

- Execute and verify resumable activation, TLS, empty database/account creation, real loopback service, authentication/resource/OOM evidence, and final host state; after it passes, merge `codex/prod-03b` to `main` and confirm GitHub/default-main equality.

## Blockers

Mandatory Owner interaction is now required for authenticated bucket/RAM/CORS confirmation, visible local Owner-private ACME-email/login input, and hidden independent-application-password input. The AccessKey export has been supplied, but it cannot authorize its own bucket CORS administration and neither RAM secret may be repurposed. This is an expected workflow boundary, not an engineering defect. Secrets and Owner-private identifiers must not be provided in chat. No other blocker is currently known.

## Last Verification

2026-08-15: local `main`, `codex/prod-03a`, remote tracking refs, and live SSH refs were synchronized at `478a2a39d16e984e484c4ec6ff0339ee6c8f189e`; the fresh repository/host/DNS/OSS denial preflight passed. PowerShell parsing, all four embedded Node syntax checks, remote Bash `-n`, `git diff --check`, targeted secret-signature scan, and independent pre-write review passed. The sole non-secret prepare run installed activation `98dbc9cfd676a3e784cb802a1a52e1b0058a249ce36ebe4969278f8bff31a660`, retained local evidence SHA-256 `01d39a3020bb122d995cde5a6b064d90e4472f6ba257604deb5077f991e1f995`, and passed post-cleanup health/state verification. The exact mandatory-CSV wrapper `3e7b66b6026b794d7ad339d9f2e90f7edc79c13df1ef1f40445274590b8780e6` passed independent secret-ingress review without any Reviewer access to CSV values. No credential, certificate, environment, database/account, service start, OSS configuration/object, active route, or production-data mutation has occurred.

2026-08-15 (hash-pin reconciliation): the Owner-reported expected `1ec8a632…` was the superseded pre-CSV wrapper revision; the local working-tree wrapper `3e7b66b6…` is the final reviewed mandatory-CSV revision, and its delta from `1ec8a632…` is exactly the repository-external CSV change. The prepare-runner pin was updated to canonical `3e7b66b6…`, `.gitattributes` now forces LF for `*.ps1`/`*.sh` so `core.autocrlf=true` cannot silently rewrite pinned files, and an independent read-only Reviewer re-verified the final scripts and canonical hashes. No secret value was read, printed, or recorded.

2026-08-15 (OSS CORS platform reconciliation): live read-only probes reproduced the approved positive preflight (`200`, exact origin, `POST`, `Max-Age=300`, empty allowed/exposed headers, platform-emitted `Access-Control-Allow-Credentials: true`) and confirmed every negative OPTIONS probe plus anonymous HEAD/listing return `403` with no allow-origin. The revised wrapper gate (credentials absent or exactly one case-insensitive `true`) was exercised against twelve header variants with the expected accept/reject result on each, and the full wrapper passed PowerShell parsing. The new canonical wrapper identity `b1bd2a0676366216ac01038e10c7e20e80618185a6d8f12a1206ad8182650c0b` then passed an independent read-only review; no secret or CSV value was read.

## Next Action

Stop at the mandatory Owner boundary. The Owner must first re-run the local hash check and confirm the result equals the canonical `b1bd2a0676366216ac01038e10c7e20e80618185a6d8f12a1206ad8182650c0b`, then confirm the exact authenticated bucket/RAM properties (the single exact CORS rule is already live and probe-verified), then run the independently reviewed wrapper with mandatory `-AccessKeyCsvPath` locally, enter Owner-private ACME email/login in visible local prompts, and enter an independent AcademicCloud password only in the hidden prompt. Do not send any AccessKey, email, login, password, cookie, or signed URL through chat.
