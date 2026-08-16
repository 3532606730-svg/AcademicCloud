# AcademicCloud Current Status

**Last updated:** 2026-08-16

## Current Layer

**Layer 1 — Basic Private Cloud Storage: First Usable Production In Progress**

`L1-E01 — Core Architecture Scaffold` through `L1-E08 — Testing & Deployment` remain complete, and `PROD-02I` accepted the verified production artifact for runtime on the upgraded 1 GiB-class host. `PROD-03A` installed the inactive non-secret foundation, `PROD-03B` completed secret-safe activation at phase `loopback-ready`, and `PROD-03C1` enabled and verified the public HTTPS/Nginx edge with the encrypted off-host backup gate passed: AcademicCloud is now publicly reachable over HTTPS at `cloud.ajtlab.top` with the backend still loopback-only. The remaining PROD-03C remainder is live browser E2E with pre-registered disposable objects, then the exact disposable-object permanent-delete confirmation; HSTS and certificate renewal remain closed per the runbook.

## Current Objective

`PROD-03R — Production Acceptance and Repository-State Reconciliation` is **complete**: the logout `415` was proven to be a PowerShell 5.1 `Invoke-WebRequest` defect (urlencoded Content-Type injection on body-less POSTs; production logout is NOT defective), the defective external harness was replaced by the repository-owned `scripts/production-https-acceptance.mjs` with a pinned frontend contract test, all living durable-state documents were reconciled, and the complete remaining First Usable Production boundary was classified into `PROD-03C2` (Ready, Class-A live gates) and `PROD-03C3` (backlog, operational hardening). The next bounded live task is `PROD-03C2`. Do not weaken any accepted boundary.

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

`L1-PROD04A — First Usable Production Readiness Reconciliation and Deployment Package` is **complete** (documentation/readiness; ChatGPT production-plan review passed; no production mutation at that step). `INDEPENDENT_L1_UX01_IMPLEMENTATION_PASS=true` is recorded; the full production package is prepared: the corrected `files.ajtlab.top` plan (capture-then-REPLACE the existing Porkbun parking CNAME with the console-assigned OSS target — no hard-coded assumption; TLS certificate lifecycle decision for OSS-terminated TLS; exact per-component rollback) and the operator-facing checklist `docs/deployment/l1-ux01-production-gate.md` (two transactions, browser PV matrix incl. the large-PDF signed-URL-lifetime test, FMEA, readiness gate matrix, operational-hardening priorities, OSS object-body DR options). Current verified facts: production `e5217e8…` healthy (active+disabled, loopback-only, health/ready 200), DB schema v4 integrity ok with the frozen E2E record intact, `files.ajtlab.top` = Porkbun parking CNAME TTL 600 (OSS unbound, TLS absent, `OSS_BROWSER_ENDPOINT` absent, CSP without the files domain), `cloud.ajtlab.top` cert expires 2026-11-13 with Certbot timer disabled. Backend 104/104, frontend **60/60**, typechecks/build/audits/diff-check/secret-scan green. `PROD-03C2` remains in progress: deployment PASS and fresh live E2E PASS (`e01a604d6a90`, `VERDICT=true`) await the independent E2E review, then the Owner browser re-verification and the permanent-delete/autostart gates.

`L1-PROD05A — UX01 Production Window / Transaction A` is **complete (2026-08-16, Owner-authorized)**: read-only live auditor baseline **READY (exit 0)** (auditor `-q` journalctl fix committed `da2c8e2`+`5a1b008`, 42/42 tests); pre-mutation artifact gate PASS (CI build + independent Linux x64 Node 24 `production-artifact.mjs verify` exit 0; ZIP `d16e969d…`, archive `0f47bb5d…`, manifest `2342aeba…`, reviewed verifier `c62c98c1…`, commit `15181f90…`); OSS custom domain `files.ajtlab.top` bound to private bucket `ajt-academiccloud-kl-8f3c` (ownership `_dnsauth` TXT verified, now absent); console-assigned CNAME target `ajt-academiccloud-kl-8f3c.ap-southeast-3.thepacificqlx.com`; DV RSA-2048 cert (SAN files.ajtlab.top + www, DigiCert DV G2, expiry 2026-11-14, manual renewal ⇒ `CERTIFICATE_LIFECYCLE_CLOSED=false`) hosted at OSS; explicit `files.ajtlab.top` CNAME added TTL 600 in Porkbun with wildcard `*.ajtlab.top CNAME pixie.porkbun.com` untouched (rollback = delete ONLY the explicit record); convergence + private boundary independently re-verified (unsigned GET 403, listing 403, correct cert SAN, `Server: AliyunOSS`; `cloud.ajtlab.top` HTTPS/health 200 and cert 2026-11-13 unchanged; env `OSS_BROWSER_ENDPOINT` still unset; served CSP unchanged). Full record: `docs/deployment/l1-ux01-production-gate.md` ("TRANSACTION A EXECUTION RECORD — L1-PROD05A"); evidence: `output/prod05a-*.json`.

`L1-PROD05B — UX01 Production Window / Transaction B` is **COMPLETE (2026-08-16): `L1_PROD05B_TRANSACTION_B_PASS=true`, `UX01_FINAL_ACCEPTED=true`, `L1_UX01_PRODUCTION_PASS=true`**. B2–B17 machine PASS (fresh precheck green; B2 backup `94e653ec…` verified; B3 age-encrypted `90f4588f…` off-host at `AcademicCloud-Backups` `1249e12` re-verified; B4 immutable release `15181f90…` with reviewed-verifier exit 0 + byte-identical v4 migrations; B5 env `OSS_BROWSER_ENDPOINT=https://files.ajtlab.top` secret-safe, 0 lines removed; B6–B9 CSP add-only + `nginx -t`; B10–B13 stop → atomic switch → migration strict no-op → start pid `66326`; B14/B15 loopback+public smoke incl. new asset `index-DUJfeHJu.js` hash `27a3c787…`; B15a machine proof PASS + post-B16 Owner browser inline Preview PASS; B16 CSP served via reload; B17 A–N all green). **B18 Owner browser PV PASS** — `B18_OWNER_BROWSER_PV=PASS`, `UX01_PRODUCTION_PV_PASS=true`; recorded non-blocking observations: initial PDF Preview loading noticeably slow (`PERFORMANCE_UX_OBSERVATION`, `NOT_A_RELEASE_BLOCKER`) and non-empty folders cannot be moved directly to Trash (`EXISTING_PRODUCT_LIMITATION`, `NOT_A_UX01_REGRESSION`, `NOT_A_RELEASE_BLOCKER`; follow-up task on the board — recursive folder recycle semantics, do not implement now). No permanent delete; systemd remains disabled; DNS/TLS/OSS unchanged; rollback assets retained; release source `15181f90…`. **No merge to main.** Record: `docs/deployment/l1-ux01-production-gate.md` ("TRANSACTION B EXECUTION RECORD — L1-PROD05B (FINAL: B2–B18 PASS, UX01 ACCEPTED)"); evidence: `output/prod05b-*.txt|json`.

`L1-UX02 — Academic Workspace Visual Refresh & Drag-and-Drop Upload` is **In Progress (local/repository only, 2026-08-16)**: branch `codex/l1-ux02-academic-workspace` from reconciled `main` (`0aae160`); frontend-only implementation complete (visual tokens/typography, workspace header + command bar + New Folder dialog, deep-forest sidebar with inline SVG icons, archive-catalogue list, row action menus, drag-and-drop upload with destination pinning + directory-skip safety, queue refresh, zh/en i18n, accessibility); automated gates PASS (backend 104/104 + frontend 69/69 tests, typecheck, build, acceptance-tools 25/25, diff-check clean, secret scan 0 diff hits, zero new dependencies). **STOPPED at the Owner local visual-review gate; NOT deployed** — `PRODUCTION_CHANGED=false`, `BACKEND_API_CHANGED=false`, `DATABASE_CHANGED=false`, `FAVORITES_IMPLEMENTED=false`, `RECURSIVE_FOLDER_RECYCLE_IMPLEMENTED=false`.

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
- Verified runtimes/tools: Node.js `24.19.0`, npm `11.17.0`, Nginx `1.24.0`, Python `3.12.3`, `make`, GCC/G++, Certbot `2.9.0`, and `age` `1.1.1`. Nginx is active and enabled. Current production state (2026-08-15): the verified AcademicCloud release is configured, the hardened unit is disabled-but-active with the single listener `127.0.0.1:3000`, and the reviewed public HTTPS edge serves `cloud.ajtlab.top` (HTTP→HTTPS, exact TLS/security headers, API proxied to the loopback backend).
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
- [ ] live production deployment and cloud/server acceptance — secret-safe activation, loopback runtime, encrypted off-host backup/restore gate, and the public HTTPS edge are complete and verified; live browser E2E with disposable objects, the exact permanent-delete confirmation, and certificate renewal remain

## Current Constraints

- Layer 1 local exit criteria, upgraded-host runtime suitability, and the non-secret production foundation are complete; PROD-03B finished at phase `loopback-ready` and PROD-03C1 enabled and verified the public HTTPS edge with the encrypted off-host backup gate passed. AcademicCloud is publicly reachable over HTTPS with the backend loopback-only; certificate renewal, live browser E2E with disposable objects, and the exact disposable-object permanent-delete confirmation remain.
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
6. `PROD-03B — Secret-Safe Activation, OSS CORS, Account, Service, and TLS`: complete. The exact certificate is issued and verified, the root-owned mode-0600 environment and migrated database with exactly one verified account exist, the exact hardened unit is disabled-but-active loopback-only on `127.0.0.1:3000`, authentication/session/resource/OOM acceptance passed, and no public AcademicCloud Nginx route was enabled; certificate renewal activation remains closed.
7. `PROD-03C1 — Public HTTPS/Nginx Edge Cutover and Minimum Machine Verification`: complete — encrypted off-host backup/restore gate passed before cutover, public HTTPS edge live and fully verified, exact rollback retained.
8. `PROD-03R — Production Acceptance and Repository-State Reconciliation`: complete — 415 root cause proven (harness defect, not production), repository-owned acceptance tooling in place, durable state reconciled, independent review PASS. No production mutation occurred.
9. `PROD-03C2 — Live Disposable-Object E2E and First-Usable Production Gates`: in progress — deployment PASS and fresh live E2E PASS recorded; independent E2E review, Owner browser re-verification, permanent-delete confirmation, and autostart decision remain.
10. `L1-UX01 — Bilingual UI + Upload UX + Correct Browser Preview`: **complete (2026-08-16)** — implementation + tests complete; Transaction A (files.ajtlab.top infrastructure) done; Transaction B machine deployment PASS (B2–B17) + B18 Owner browser PV PASS ⇒ `UX01_FINAL_ACCEPTED=true`, `L1_UX01_PRODUCTION_PASS=true`; no merge to main. Recorded non-blocking follow-ups: preview-loading performance observation; recursive folder-recycle product task; preview-URL expiry known limitation.
11. `PROD-03C3 — Operational Hardening`: backlog. Backup cadence, renewal automation (hard deadline before 2026-11-13), HSTS after renewal/rollback proven, destructive restore drill, second account/isolation check, journal retention.
12. Layer 2 remains closed.

Layer 2 remains deferred.
