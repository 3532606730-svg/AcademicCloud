# AcademicCloud Current Status

**Last updated:** 2026-08-15

## Current Layer

**Layer 1 — Basic Private Cloud Storage: First Usable Production In Progress**

`L1-E01 — Core Architecture Scaffold` through `L1-E08 — Testing & Deployment` remain complete, and `PROD-02I` accepted the verified production artifact for runtime on the upgraded 1 GiB-class host. The Owner has now authorized the bounded Layer 1 First Usable Production sequence, and PROD-03A installed its inactive non-secret foundation. Production remains closed until secret-safe activation, exact OSS CORS, TLS, browser E2E, backup/restore, rollback, and independent review all pass.

## Current Objective

`PROD-03A — Production Foundation and Immutable Release` is complete. Start `PROD-03B — Secret-Safe Activation, OSS CORS, Account, Loopback Service, and TLS Preparation` and stop only at its shortest mandatory Owner interaction for hidden credential/password/ACME-email entry and exact OSS CORS console configuration. Do not enable the public AcademicCloud Nginx route, enter PROD-03C, or weaken any accepted boundary during PROD-03B.

## Completed

- [x] Created `backend/`
- [x] Created `frontend/`
- [x] Created `database/`
- [x] Created `docs/architecture/`
- [x] Created `docs/api/`
- [x] Created `docs/deployment/`
- [x] Created `docs/decisions/`
- [x] Created `tasks/backlog/`
- [x] Created `tasks/ready/`
- [x] Created `tasks/doing/`
- [x] Created `tasks/done/`
- [x] Created `workers/`
- [x] Created `plugins/`
- [x] Created `tests/`
- [x] Created `deployment/`
- [x] Installed all seven core project-memory Markdown files in the repository root
- [x] Checked the core documents for material conflicts
- [x] Verified that the actual directory structure matches the documented structure
- [x] Initialized Git at the `AcademicCloud/` project root on branch `main`
- [x] Received approval for `SETUP-001 — Project Knowledge Setup`
- [x] Completed Chat 00 / Project Knowledge Setup
- [x] Inspected the local development environment without installing or configuring software
- [x] Received approval for `SETUP-002 — Environment Inspection`
- [x] Completed `SETUP-002 — Environment Inspection`
- [x] Compared the minimum Layer 1 backend, frontend, database, authentication, package-management, and deployment options
- [x] Received approval for `SETUP-003 — Layer 1 Technical Architecture Decision`
- [x] Recorded the approved Layer 1 technical baseline in `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- [x] Completed `SETUP-003 — Layer 1 Technical Architecture Decision`
- [x] Created the repository-scoped instruction-only `academiccloud-workflow` Skill
- [x] Defined minimal context recovery, task cards, autonomous authority, subagent write safety, validation, documentation, and Git checkpoints
- [x] Defined mandatory escalation boundaries for real cost, irreversible data risk, credentials/security, product direction, and severe anomalies
- [x] Validated the repository Skill structure and discovery path, and simulated the `开始下一个任务` recovery flow without executing Layer 1 work
- [x] Completed `SETUP-004 — Autonomous AcademicCloud Engineering Workflow`
- [x] Completed Layer 0 — Project Setup
- [x] Created npm workspaces with one lockfile for `backend/` and `frontend/`
- [x] Fixed the Layer 1 development runtime at Node.js `24.16.0` and npm `11.13.0`
- [x] Added the Fastify platform bootstrap, validated environment configuration, structured logging, and `GET /api/health`
- [x] Added the React/Vite SPA bootstrap and same-origin `/api` development proxy
- [x] Added backend health/configuration tests and repository type-check/build workflows
- [x] Verified direct API access, Vite-proxied API access, and the frontend development page
- [x] Completed `L1-E01 — Core Architecture Scaffold`
- [x] Added `better-sqlite3` behind the SQLite persistence adapter with WAL, foreign-key, busy-timeout, and full-synchronous safety settings
- [x] Added ordered, checksummed, atomic SQL migrations with a repeatable `npm run db:migrate` command
- [x] Added account, folder hierarchy, and logical file/storage metadata models with business-owned repository interfaces
- [x] Added SQLite repository implementations and an explicit multi-repository transaction boundary
- [x] Added database constraints for account ownership, parent-folder isolation, lifecycle metadata, object references, and active-name uniqueness
- [x] Verified owner-scoped repository reads, cross-owner rejection, lifecycle/name/object constraints, cycle prevention, transaction rollback, migration checksums, and failed-migration rollback
- [x] Completed `L1-E02 — Database Foundation`
- [x] Selected and measured Argon2id at 64 MiB, three iterations, one lane, and one active KDF operation with four queued operations
- [x] Added digest-only SQLite-backed opaque sessions with seven-day expiry, revocation, and reauthentication rotation
- [x] Added exact-origin CSRF enforcement, strict cookie policy, JSON-only login, and in-process login throttling
- [x] Added login, logout, current-session routes and a reusable guard providing server-derived account identity
- [x] Added application composition for migrations, SQLite, persistence, authentication, and graceful closure
- [x] Recorded the security baseline in `docs/decisions/ADR-009-authentication-security-baseline.md`
- [x] Completed `L1-E03 — Authentication & Authorization`
- [x] Added a provider-neutral `StorageAdapter` contract and deterministic in-memory implementation
- [x] Added 256-bit opaque application object keys independent of display filenames and paths
- [x] Added an isolated Alibaba Cloud OSS adapter with exact POST policies and explicit V4 signed downloads
- [x] Added validated OSS configuration, normalized metadata lookup, and idempotent exact-key deletion
- [x] Verified OSS integration behavior with injected fakes and a no-network real-SDK signing smoke test
- [x] Documented storage configuration, credential isolation, checksum semantics, and deferred live-cloud work
- [x] Completed `L1-E04 — Storage Abstraction`
- [x] Added owner-scoped folder and file repositories for listing, state transitions, conflicts, and pending compensation
- [x] Added authenticated folder create/browse/rename/move/empty-delete/restore workflows
- [x] Added browser-direct upload reservation, renewal, provider metadata verification, and activation
- [x] Added file download, metadata-only rename/move, recycle bin, provider-verified restore, and permanent deletion
- [x] Added durable `purging` state, expected-state transitions, provider identity checks, and concurrent deletion isolation
- [x] Added strict `/api/drive` schemas, stable client errors, and storage-detail-safe DTOs
- [x] Documented the file-management API and completed deterministic lifecycle and isolation coverage
- [x] Completed `L1-E05 — File Management`
- [x] Added the typed same-origin frontend API and stable client error mapping
- [x] Added incremental browser MD5 and direct multipart object-storage upload with progress, cancellation, timeout, pending renewal, and completion recovery
- [x] Added responsive session, folder, active file, pending upload, and recycle-bin views with the approved Layer 1 actions
- [x] Added short-lived safe inline previews, accessible native dialogs, labeled controls, focus restoration, reduced-motion behavior, and 320 px layouts
- [x] Added deterministic frontend tests and completed browser/visual QA without real cloud calls or credentials
- [x] Documented the frontend security/data flow and local adapter limitations
- [x] Completed `L1-E06 — Frontend Interface`
- [x] Added secure API response headers, stable parser/not-found behavior, database-only readiness, request bounds, secret-safe logs, and stable authentication/drive audit events
- [x] Added revision-based file CAS, authorization-bound MD5, renewal freshness, provider-verified deletion, and durable uncertain-result recovery in `purging`
- [x] Added bounded expired-session pruning and a serial one-shot stale-state maintenance command that defaults to dry-run
- [x] Added full protected/origin/owner isolation matrices plus restart, provider-fault, ambiguous-object, integrity, and redaction coverage
- [x] Documented security/reliability operations, resource bounds, maintenance procedure, and residual OSS deletion risk
- [x] Completed `L1-E07 — Security & Reliability`
- [x] Added a local HTTP object-store acceptance path that verifies multipart upload, no-overwrite replay rejection, activation, download, and independent byte hashes
- [x] Added deterministic Layer 1 critical-path, representative-file, deployment-artifact, backup/restore, and account-provisioning coverage
- [x] Added consistent non-overwriting SQLite online backup and read-only verification with migration, integrity, foreign-key, hash, and isolated-restore checks
- [x] Added compiled migration, account provisioning, maintenance, backup, restart/session-persistence, restore, and redeployment acceptance
- [x] Added loopback-only Fastify proxy trust, Nginx HTTPS/static/API templates, a hardened single-process systemd unit, and a production environment template
- [x] Documented release, migration, rollback, recovery, logging, resource, OSS, credential, CORS, versioning, and approval gates
- [x] Completed `L1-E08 — Testing & Deployment` at the deterministic local boundary

## Current Task

`PROD-03A — Production Foundation and Immutable Release` is **Complete**. Exact artifact `9225471228` / source `639baa9596a17f4160521f31440d9e3ac3b12eda` is installed under a root-owned immutable release and selected by `/opt/academiccloud/current`. The exact hardened unit is installed disabled/inactive with no PID or port 3000 listener; prepared Nginx/CSP/logrotate/bootstrap files remain outside active trees. Certbot 2.9.0 and six required Python packages are installed with zero upgrades/removals, timer disabled/inactive, and no ACME account/certificate/renewal state. Formal evidence SHA-256 is `8d2752951784345259369d76e3a8775bb9fd21977195578024f7041184e9f2e5`; no environment, database, account, secret, OSS mutation, active route, or production data exists.

## Production Preparation Status

### GitHub repository

- Canonical repository: private `3532606730-svg/AcademicCloud`.
- The complete original Git history was bootstrapped to GitHub; the bootstrap checkpoint on `main` is `621b19a16e620f1a8a9ba6993bb927ae2d620748` (`feat: complete Layer 1 deployment acceptance`).
- The connected GitHub integration can read the private repository.
- Windows GitHub HTTPS still fails certificate trust and is intentionally deferred. This repository now uses a repository-scoped SSH transport with a dedicated Windows GitHub key, strict host verification, and successful authentication as `3532606730-svg`.
- The first direct Windows SSH push and post-push connector read both verified the reconciliation checkpoint on private `main`.
- GitHub Actions run `31812294336` passed the full Linux production build and fresh-runner artifact download/verification chain. The immutable GitHub artifact ZIP digest is `405a2cd2330f1a9294fe277a01d0bee7048b4b5829764af3e27d3aa174c2cf7d`; its release archive digest is `fe28ea66b8e4c88888572932c8195ec4bb23c5345f10a7aa9658c3f6ebe9d630`.
- After target diagnostics exposed a missing `AF_NETLINK` systemd allowlist entry, run `31817102343` passed the corrected Linux build and fresh-runner verification for source `639baa9596a17f4160521f31440d9e3ac3b12eda`. Artifact `9225471228` contains the corrected unit and independently passed SQLite, Argon2id, native ELF64 x86-64, and compiled acceptance before the separate Alibaba capacity rejection.
- The one-time local bundle → Alibaba host → private GitHub relay passed. The `AcademicCloud Alibaba Bootstrap` write deploy key is a **TEMPORARY WRITE CREDENTIAL — RETAINED BY OWNER DECISION**.

### Alibaba production host

- Target: `47.250.126.42`, an Alibaba Cloud Simple Application Server in Malaysia / Kuala Lumpur running Ubuntu 24.04.2 LTS on x86_64 with 2 vCPU.
- After the Owner-authorized upgrade, Linux reports `916,044 KiB` `MemTotal` (approximately 894.6 MiB usable), consistent with the target 1 GiB cloud specification after platform/kernel reservation.
- The post-upgrade host exposes a 30 GiB block device, while the existing root partition/filesystem remains approximately 20 GiB with about 13 GiB free. PROD-02I does not resize or otherwise change it. A persistent 1 GiB swap file is active.
- Verified runtimes/tools: Node.js `24.19.0`, npm `11.17.0`, Nginx `1.24.0`, Python `3.12.3`, `make`, GCC/G++, and Certbot `2.9.0`. Nginx is active and enabled. The verified AcademicCloud release and disabled/inactive unit are installed, but the application is not configured, started, routed, or live.
- Owner-authorized cleanup removed `/opt/ajt-captcha`, `/opt/captcha_server`, and the related old reboot entry/log, releasing approximately 450 MiB.
- A broken/half-installed Ubuntu `chromium-browser` transitional package was removed under the approved recovery. `dpkg --configure --pending`, `dpkg --audit`, and `apt-get check` then reported a healthy package state.
- A real target-host `npm ci --omit=dev` attempt was OOM-killed; kernel/system logs corroborate the native-install memory failure. **ON-SERVER NATIVE BUILD: UNSUPPORTED.** Do not retry `npm ci`, `node-gyp`, native compilation, or frontend builds on this host.
- On-server build suitability remains **Failed / Unsupported**. The approximately 407 MiB pre-upgrade runtime result remains historically **Rejected**. On the upgraded host, exact artifact `9225471228` completed SQLite `3.53.4`, Argon2id `m=65536,t=3,p=1`, both ELF64 x86-64 native-module checks, and the full compiled migration/session/maintenance/backup/restore/redeploy acceptance, so runtime suitability is now **Accepted** without changing the accepted security or durability boundaries.
- The Owner reports the RAM upgrade complete; Linux reports `916,044 KiB` `MemTotal`, consistent with a 1 GiB-class cloud specification after platform/kernel reservation. The billing amount and console transaction are not recorded in the repository. PROD-02I performed no additional paid-resource action.

## Approved Layer 1 Technical Baseline

- Backend: Node.js 24 LTS, TypeScript, and Fastify 5.
- Frontend: React, TypeScript, and Vite SPA.
- Database: SQLite with `better-sqlite3` behind the persistence/repository boundary.
- Authentication: SQLite-backed server-side opaque sessions.
- Password hashing: a maintained memory-hard implementation, with Argon2id preferred; package and parameters are deferred to the Authentication task.
- Package management: npm workspaces with one `package-lock.json`.
- Production: Nginx, systemd, and one Node.js process; no Docker, Redis, queue, or permanent worker.
- Storage: `StorageAdapter` with `AliyunOssStorageAdapter`; private OSS bucket; short-lived browser-direct upload authorization and signed downloads.
- Module boundaries: `platform`, `auth`, `drive`, `storage`, and `persistence`.
- Node version policy: use Node.js 24 LTS and select the latest supported 24.x security patch at dependency-installation or deployment time.

## Confirmed Environment Facts

- Local operating system: Windows 11 x64.
- Node.js `v24.16.0` is available.
- `npm.cmd` and `npx.cmd` are available.
- No standard Python development environment is currently available; the discovered LibreOffice-embedded Python is not the project runtime.
- Docker, WSL, PostgreSQL, Redis, and similar infrastructure are not currently required dependencies.
- The C: drive has approximately 9.6 GiB free; dependency and cache size should remain controlled.
- GitHub HTTPS currently has a certificate-trust error. Record this as an environment risk for later handling; do not change VPN, certificates, or network configuration without approval.
- The target Ubuntu host reports `916,044 KiB` `MemTotal` after the Owner-reported 1 GiB upgrade. Builds remain in compatible Linux CI; `PROD-02I` accepted runtime suitability under the unchanged 320/384 MiB cgroup and 128 MiB whole-host headroom gates.

## Layer 1 Coverage

- [x] core application scaffold
- [x] database foundation
- [x] authentication and authorization foundation
- [x] storage integration
- [x] file management
- [x] frontend functionality
- [x] security and reliability hardening
- [x] deterministic deployment package and local compiled-artifact acceptance
- [ ] live production deployment and cloud/server acceptance — foundation installed; activation, backup/restore, edge, and E2E remain

## Current Constraints

- Layer 1 local exit criteria, upgraded-host runtime suitability, and the non-secret production foundation are complete. Production remains closed because secrets/account, exact OSS CORS, loopback service, certificate/renewal, encrypted off-host backup/restore, edge, and live E2E gates are not complete.
- Keep work within the approved task, Layer 1 scope, and accepted architecture.
- Escalate only the mandatory boundaries defined by `.agents/skills/academiccloud-workflow/SKILL.md`.
- Never repeat npm/native/frontend builds on the Alibaba production host; it is a runtime-only acceptance target.
- The completed Owner-authorized 1 GiB upgrade and bounded PROD-02I re-acceptance do not authorize another resource change or any weakening of the accepted gates.
- Do not treat GitHub repository/bootstrap readiness as live OSS, DNS/TLS, application deployment, or runtime acceptance.
- No OCR/RAG/connectors.
- No architecture expansion without approval.

## Next Milestone

The approved sequence is:

1. `PROD-02R — Repository Reconciliation + Windows Git SSH`: complete.
2. `PROD-02G — GitHub Actions Linux Production Build`: complete.
3. `PROD-02H — Alibaba Runtime-Only Acceptance`: complete with pre-upgrade host-state runtime suitability rejected and cleanup/recovery verified.
4. `PROD-02I — Alibaba 1 GiB Runtime Re-Acceptance`: complete with upgraded-host runtime suitability accepted, exact evidence retained, and cleanup/recovery verified.
5. `PROD-03A — Production Foundation and Immutable Release`: complete; formal evidence SHA-256 `8d2752951784345259369d76e3a8775bb9fd21977195578024f7041184e9f2e5`, inactive release foundation healthy and clean.
6. `PROD-03B — Secret-Safe Activation, OSS CORS, Account, Service, and TLS`: Ready. Owner interaction is limited to the hidden credential/password/ACME-email entry and exact CORS console boundary. It may validate the real unit on loopback and issue TLS, but it must not enable the public AcademicCloud Nginx route; certificate renewal activation remains closed until the final edge proves the ACME challenge path.
7. `PROD-03C — First Usable Production E2E, Backup/Restore, and Cutover`: authorized after PROD-03B. It must complete an encrypted off-host backup and isolated restore before public cutover; any new-cost/key-custody boundary and the exact disposable-object permanent-delete confirmation remain Owner gates.
8. Layer 2 remains closed.

Layer 2 remains deferred.
