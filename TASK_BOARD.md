# AcademicCloud Task Board

## Current Phase

**Layer 1 — Basic Private Cloud Storage: First Usable Production In Progress**

## In Progress

### PROD-03C2 — Live Disposable-Object E2E and First-Usable Production Gates

**Status:** In Progress — deployment PASS (`e5217e8`, reviewed, smoke + frontend proof + boundary/resource checks green) and the fresh live E2E PASS (`runId=e01a604d6a90`, `VERDICT=true`, CORS boundary PASS). Remaining: ChatGPT independent E2E review, Owner browser Product Verification, the exact disposable-object permanent-delete confirmation, and the autostart decision.

### L1-UX01 — Bilingual UI + Upload UX + Correct Browser Preview

**Status:** Implementation PASS recorded (`INDEPENDENT_L1_UX01_IMPLEMENTATION_PASS=true`) — implementation + deterministic tests complete (backend 104/104, frontend 60/60, builds green) through `L1-UX01R1`/`L1-UX01R2`; the preview-URL expiry limitation is recorded as a known Product Verification item. The production gate is documented (`docs/deployment/l1-ux01-production-gate.md`, `files-ajtlab-top-plan.md`); the `files.ajtlab.top` infrastructure step, CI artifact build, deployment, and Owner browser PV await the ChatGPT production-plan review and the Owner-authorized window.

### L1-PROD04A — First Usable Production Readiness Reconciliation and Deployment Package

**Status:** In Progress — documentation/readiness only; the deployment package (two-transaction checklist, corrected DNS/TLS/CSP plan, rollback matrix, PV matrix, FMEA, readiness gate matrix, hardening priorities, OSS body DR options) is prepared and awaiting the ChatGPT production-plan review. Zero production mutation.

### L1-OPS01 — Read-Only Production Readiness Auditor (parallel / isolated / NON_BLOCKING_FOR_UX01)

**Status:** In Progress on isolated branch `codex/l1-ops01-readiness-auditor` (created from exactly `cd8ff25…`; `codex/prod-03c2` untouched) — dependency-free, read-only, secret-safe auditor implemented with repo/public/plan/live modes, baseline + ux01-ready profiles, fixed remote-check allowlist + mutation denylist, deterministic READY/NOT_READY/INDETERMINATE model, and 24/24 synthetic-fixture tests. Awaiting ChatGPT review; live mode must NOT run until `FIRST_LIVE_AUDITOR_RUN=true` is authorized. It does not block the UX01 production gate (PROD04B stays independently executable).

## Completed

### PROD-03R — Production Acceptance and Repository-State Reconciliation

**Status:** Done — reconciliation/diagnosis only; production never mutated; independent review PASS after one follow-up fix

Completion notes:
- [x] proven the observed logout `415` root cause: PowerShell 5.1 `Invoke-WebRequest` injects `Content-Type: application/x-www-form-urlencoded` on body-less POSTs; Fastify's content-type-parser layer rejects it with 415; production logout is NOT defective (browser-shape request returns `204`; backend tests pin the contract)
- [x] old external harness defective: YES; removed; replaced by repository-owned `scripts/production-https-acceptance.mjs` (Node fetch semantics mirroring `frontend/src/api.ts`, muted secret input, status/boolean output only) plus a frontend contract test pinning the body-less no-Content-Type logout shape
- [x] reconciled living durable state (AGENTS.md, workflow SKILL.md, CURRENT_STATUS.md, TASK_BOARD.md, PROJECT_SPEC.md, README.md, production-runbook.md, PROD-03C1 evidence note); historical checkpoint facts preserved as history
- [x] recorded the complete First Usable Production gate list with A/B/C classification and created the next bounded task `PROD-03C2`

### PROD-03C1 — Public HTTPS/Nginx Edge Cutover and Minimum Machine Verification

**Status:** Done — public HTTPS edge live and verified; backup gate passed; rollback retained

Completion notes:
- [x] encrypted off-host backup gate: production backup `a457628a…` encrypted to committed recipient `age1s4aqa7…` (`database.age` `753897f0…`, `configuration.age` `40150e21…`), local decryption verified, isolated restore rehearsal passed (compiled app health/ready `200`, memory storage, maintenance dry-run clean, production untouched)
- [x] published only encrypted artifacts plus non-secret manifest to private `AcademicCloud-Backups` (`d248336`), byte-verified from a fresh clone; independent backup-repo review PASS; Owner vault confirmation done
- [x] independent pre-cutover review PASS; exact rendered edge files installed; `nginx -t` + reload atomic; public HTTPS `200` with verified chain, HTTP→HTTPS `301`, exact security headers, API health/ready `200`, invalid-probe login `401` and cookie-less session `401`, backend loopback-only, unknown-host/SNI rejected, CORS boundary unchanged
- [x] `MemAvailable=503,040 KiB`, swap intact, cgroup OOM events `0/0/0/0`, kernel OOM `0`; rollback state retained under `/var/lib/nginx-cutover-rollback`; HSTS/renewal remain closed per runbook

### PROD-03B — Secret-Safe Activation, OSS CORS, Account, Loopback Service, and TLS Preparation

**Status:** Done — phase `loopback-ready`; service active loopback-only; production still not publicly routed

Completion notes:
- [x] issued and verified the exact `cloud.ajtlab.top` certificate through the reviewed webroot path with no public route enabled
- [x] installed the root-owned mode-0600 environment and migrated the database to version 4 with exactly one account whose Argon2id hash verifies the Owner input (unchanged `m=65536,t=3,p=1`)
- [x] reconciled the live OSS CORS platform behavior: exact origin/POST-only/empty headers/Max-Age 300 plus platform-emitted `Access-Control-Allow-Credentials: true`; all five negative OPTIONS probes and anonymous HEAD/listing remain `403` with no allow-origin
- [x] recovered two fail-closed activation stops with independently reviewed verifier-only fixes (Argon2 0.45.x `m,p,t` encoded-parameter order gate; unsatisfiable read-only `synchronous===2` predicate) without recreating the account or weakening any application durability/hardening boundary
- [x] final installed activation `93ee91d5…` reached `loopback-ready`: unit disabled-but-active, listener exactly `127.0.0.1:3000`, health/readiness `200`, login/session/restart/logout acceptance passed, minimum `MemAvailable=429,512 KiB`, `SwapFree=1,048,572 KiB`, cgroup peak `112,390,144` bytes, all OOM deltas zero, kernel OOM absent
- [x] canonical Owner wrapper `3e4ec975…`; fix runner `8dade640…`; no secret in chat/Git/logs/evidence; zero live OSS writes; Nginx default-only throughout

### PROD-03A — Production Foundation and Immutable Release

**Status:** Done — verified inactive foundation installed; production still closed

Completion notes:
- [x] installed exact artifact `9225471228` / source `639baa9596a17f4160521f31440d9e3ac3b12eda` as a root-owned immutable release with 4,605 regular files and 15 symlinks, exact manifest identity, and no service-user write access
- [x] created the nologin service identity and restrictive config/state/log paths; installed exact hardened unit SHA-256 `fed6c26d80ad070decf4ddeabb7f4af6d23c38c24d2494666c7bfe981e39500b` disabled/inactive with `MainPID=0`
- [x] prepared exact production hostnames outside active Nginx/logrotate trees and retained the unchanged Nginx SHA-256/default route/listeners
- [x] installed Certbot 2.9.0 plus six required Python packages with zero package upgrades/removals; timer remains disabled/inactive and no ACME account, certificate, or renewal exists
- [x] retained two clean fail-closed attempts and completed formal evidence SHA-256 `8d2752951784345259369d76e3a8775bb9fd21977195578024f7041184e9f2e5`; system running/zero failed, `MemAvailable=546,080 KiB`, `SwapFree=1,048,572 KiB`, and no OOM/stage/secret/application listener
- [x] made no OSS, credential, database, account, active Nginx, certificate, public-route, production-data, disk-resize, or Layer 2 change

### PROD-02I — Alibaba 1 GiB Runtime Re-Acceptance

**Status:** Done — upgraded Alibaba host accepted for runtime; production still closed

Completion notes:
- [x] confirmed Linux `MemTotal=916,044 KiB`, healthy systemd/SSH/Nginx/networking services, unchanged Nginx/listeners, no current-boot OOM, and no PROD-02H or AcademicCloud deployment residue before the run
- [x] revalidated GitHub artifact `9225471228`, source `639baa9596a17f4160521f31440d9e3ac3b12eda`, and ZIP SHA-256 `6472f6cd5cd33f4a6af7a836b6617cfd47dd9a3115e8d342ba75f28becaf98fe`
- [x] passed the unchanged private-network, `nobody:nogroup`, 320/384 MiB cgroup acceptance with minimum `MemAvailable=393,396 KiB`, minimum `SwapFree=1,048,572 KiB`, cgroup peak `241,455,104` bytes, and zero cgroup/kernel OOM evidence
- [x] passed SQLite `3.53.4`, Argon2id `m=65536,t=3,p=1`, both exact ELF64 x86-64 native modules, and compiled migration, login, health/readiness, restart/session, maintenance, backup/restore, and redeploy acceptance
- [x] retained evidence bundle SHA-256 `ac1de4bf4881d84e869138f3c14ab4ef7ba943b80a7121c7891e7dec0dc7a518`, precisely removed the task stage, and confirmed zero failed units, unchanged services/Nginx/listeners, absent deployment paths, and no current-boot OOM after cleanup
- [x] ran no npm/install/build/native compilation or deployment on Alibaba; changed no live OSS, DNS/TLS, credentials, production data, cutover, system configuration, mounted root filesystem, or additional paid resource

### PROD-02H — Alibaba Runtime-Only Acceptance

**Status:** Done — pre-upgrade Alibaba host state rejected

Completion notes:
- [x] rebuilt source `639baa9596a17f4160521f31440d9e3ac3b12eda` after correcting the production systemd `AF_NETLINK` allowlist; GitHub Actions run `31817102343` and its fresh-runner verification both passed
- [x] revalidated artifact `9225471228`, ZIP SHA-256 `6472f6cd5cd33f4a6af7a836b6617cfd47dd9a3115e8d342ba75f28becaf98fe`, the manifest, the corrected unit, Linux native modules, SQLite, Argon2id, and compiled acceptance before transfer
- [x] ran the exact artifact on Alibaba under a non-privileged, private-network transient unit with no npm/install/build, deployment, real credential, or live OSS access
- [x] rejected pre-upgrade host-state suitability after 38,992 KiB minimum `MemAvailable`, a 151,027,712-byte cgroup peak, one OOM kill, and a kernel-confirmed global OOM prevented full runtime verification
- [x] retained non-secret evidence, removed every task-owned stage/unit/process/temp file, and confirmed system recovery, unchanged Nginx hash/listeners, absent deployment paths, and zero failed units
- [x] added 0 RMB cost and performed no OSS, DNS/TLS, production-data, credential, live-host system-configuration, cutover, or Layer 2 change

### PROD-02G — GitHub Actions Linux Production Build

**Status:** Done

Completion notes:
- [x] ran the real zero-cost GitHub-hosted Ubuntu 24.04 x86_64 build on Node.js `v24.19.0` and npm `11.17.0`
- [x] passed clean install, 88 backend tests, 22 frontend tests, type-check, production build, compiled acceptance, both zero-vulnerability audits, and the Argon2id benchmark
- [x] built a production-only release and retained only the verified Linux glibc x86-64 Argon2 and better-sqlite3 native modules
- [x] generated and verified the per-file manifest, deterministic release archive, SHA-256, and runtime evidence
- [x] loaded and executed better-sqlite3/SQLite and Argon2id and reran compiled acceptance from the extracted production artifact
- [x] uploaded immutable artifact `9223626582`, downloaded it on a fresh runner, reran the complete verification, and independently downloaded and checked the bundle locally
- [x] used SHA-pinned official Actions with least-privilege `contents: read` and short seven-day retention
- [x] passed local checks and independent read-only review; changed no Alibaba, OSS, DNS, TLS, production data, Layer 2, or paid resource

### PROD-02R — Repository Reconciliation + Windows Git SSH

**Status:** Done

Completion notes:
- [x] reconciled GitHub bootstrap and Alibaba preparation facts without claiming deployment or runtime acceptance
- [x] recorded target-host native-build OOM as unsupported while keeping runtime suitability not yet tested
- [x] removed target-host native install/build instructions and fixed the CI artifact → runtime-only sequence
- [x] created a dedicated ACL-restricted Windows GitHub Ed25519 key without reusing the Alibaba key
- [x] verified GitHub's official Ed25519 host fingerprint, strict SSH authentication as `3532606730-svg`, and repository-scoped SSH configuration
- [x] switched `origin`, read private `main`, committed, pushed directly from Windows, and verified the pushed commit through both SSH and the connected GitHub integration
- [x] passed documentation review, `git diff --check`, targeted secret scan, and independent read-only review
- [x] changed no Alibaba host state, created no Actions workflow, disabled no TLS/SSH verification, and added no cost

### SETUP-001 — Project Knowledge Setup

**Status:** Done

Goal: place the approved project rules and project-memory files in the repository root.

Allowed:
- Markdown project files
- project-management structure
- Git initialization/verification
- documentation-only changes

Not allowed:
- business code
- framework installation
- database implementation
- OSS integration
- authentication
- file upload/download

Acceptance criteria:
- [x] all core Markdown files exist in repository root
- [x] Codex can correctly summarize project rules
- [x] no business code has been added
- [x] Git state is initialized or confirmed
- [x] `CURRENT_STATUS.md` matches reality
- [x] next task is proposed but not automatically executed

### SETUP-002 — Environment Inspection

**Status:** Done

Goal: inspect the local environment and recommend the minimal Layer 1 setup without implementing business functionality.

Inspect:
- operating system
- Git
- Node.js / Python availability
- package managers
- Docker availability as information only
- local development constraints
- 512 MB server-memory implications

Completion notes:
- [x] confirmed Windows 11 x64 and local Git state
- [x] confirmed Node.js `v24.16.0`, `npm.cmd`, and `npx.cmd` availability
- [x] confirmed that no standard Python development environment is available
- [x] recorded disk-space, GitHub TLS, and PowerShell execution-policy risks without changing the system
- [x] assessed the 512 MB Ubuntu server constraint and recommended a lightweight Layer 1 architecture
- [x] made no installations, configuration changes, or business-code changes

### SETUP-003 — Layer 1 Technical Architecture Decision

**Status:** Done

Goal: compare and determine the minimum technical stack for Layer 1, including:
- backend runtime/framework
- frontend strategy
- database
- package manager
- authentication approach
- local development model
- production deployment model

Decision priorities:
- modularity
- low resource usage
- compatibility with the 512 MB Ubuntu server
- compatibility with the current Windows development environment
- maintainability
- avoidance of over-engineering

Completion notes:
- [x] compared Node.js and Python backend options against the confirmed environment
- [x] compared SPA, integrated frontend, and SSR strategies
- [x] compared SQLite and PostgreSQL deployment options
- [x] selected SQLite-backed opaque sessions and deferred password-hashing implementation details
- [x] selected npm workspaces and a lightweight Nginx/systemd production model
- [x] defined the five minimum module boundaries: `platform`, `auth`, `drive`, `storage`, and `persistence`
- [x] received approval for the final architecture with Node.js, SQLite, and password-hashing policy corrections
- [x] recorded the accepted decision in `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- [x] made no dependency installations, runtime upgrades, framework initialization, or business-code changes

### SETUP-004 — Autonomous AcademicCloud Engineering Workflow

**Status:** Done

Goal: establish the repository-backed AI engineering workflow used to recover context, select and execute approved tasks, validate work, preserve task memory, coordinate subagents safely, maintain project state, and create Git checkpoints.

Completion notes:
- [x] created `.agents/skills/academiccloud-workflow/SKILL.md`
- [x] kept the Skill instruction-only with no scripts, references, assets, hooks, daemon, service, index, or additional dependency
- [x] defined repository source-of-truth precedence and minimum context recovery
- [x] defined concise `tasks/doing/<TASK-ID>.md` task cards and `tasks/done/` completion movement
- [x] defined the standard recover, select, plan, execute, verify, review, record, commit, and report lifecycle
- [x] defined default autonomous authority for ordinary engineering work within approved scope
- [x] defined mandatory user escalation boundaries
- [x] defined main-agent orchestration and single-writer subagent safety
- [x] validated Skill structure and repository discovery path, and performed a read-only simulation of `开始下一个任务`
- [x] did not create scheduled work or execute `L1-E01`

### L1-E01 — Core Architecture Scaffold

**Status:** Done

Goal: establish the approved minimum Layer 1 application foundation and prove basic frontend-to-backend connectivity.

Completion notes:
- [x] created npm workspaces for `backend/` and `frontend/` with one committed lockfile
- [x] fixed the current development runtime at Node.js `24.16.0`
- [x] added strict shared TypeScript configuration and repository-level development/check scripts
- [x] added the Fastify platform bootstrap, validated runtime configuration, structured logging, and `GET /api/health`
- [x] added the React/Vite SPA bootstrap with a same-origin `/api` development proxy
- [x] documented local setup, runtime configuration, and verification commands
- [x] passed backend tests, repository type-checks, production builds, dependency audit, and live direct/proxied connectivity checks
- [x] introduced no database, authentication, storage, or file-management business functionality

### L1-E02 — Database Foundation

**Status:** Done

Goal: establish the approved SQLite persistence foundation for account, folder, and file metadata while keeping business modules independent of SQLite APIs.

Completion notes:
- [x] added `better-sqlite3` only inside the SQLite persistence adapter
- [x] configured foreign keys, WAL, busy timeout, full synchronous durability, and untrusted schema mode
- [x] added ordered, checksummed, atomic migrations and a repeatable npm migration command
- [x] modeled accounts, folder hierarchy, and logical file/storage metadata with explicit lifecycle states
- [x] added business-owned repository interfaces, SQLite implementations, and a multi-repository transaction boundary
- [x] enforced same-owner hierarchy references, lifecycle consistency, unique object references, and active-name uniqueness
- [x] passed 15 tests, repository type-checks, production builds, dependency audit, migration command smoke checks, and SQLite integrity/foreign-key checks
- [x] introduced no authentication flow, OSS integration, file-management API, or frontend database behavior

### L1-E03 — Authentication & Authorization

**Status:** Done

Goal: establish secure account authentication, persistent opaque sessions, reusable protected-route authorization, and server-derived account identity.

Completion notes:
- [x] selected and measured the maintained `argon2` implementation with Argon2id at 64 MiB, three iterations, one lane, and a 32-byte hash
- [x] bounded password work to one active and four queued operations, with fast 429 rejection beyond capacity
- [x] added 256-bit opaque sessions with only SHA-256 digests stored in SQLite
- [x] added seven-day expiry, revocation, reauthentication rotation, disabled-account checks, and restart persistence
- [x] added strict production/development cookie policies and exact-origin protection for unsafe API requests
- [x] added JSON-only rate-limited login, logout, current-session routes, and a reusable authenticated-account guard
- [x] composed migrations, persistence, and authentication into the application lifecycle
- [x] recorded the durable security parameters and deployment remeasurement gate in ADR-009
- [x] passed 28 tests, type-checks, production builds, dependency audit, migration/integrity smoke checks, and the password benchmark
- [x] introduced no registration, JWT, Redis, OSS, drive API, or frontend feature scope

### L1-E04 — Storage Abstraction

**Status:** Done

Goal: establish a provider-neutral object-storage boundary and a testable Alibaba Cloud OSS adapter without using real credentials or cloud resources.

Completion notes:
- [x] added the business-owned `StorageAdapter` contract for browser upload/download authorization, metadata lookup, and idempotent deletion
- [x] generated 256-bit opaque physical object keys with no display filename or client path material
- [x] added exact-key, exact-size, exact-MIME POST policies with 30-900 second expiry bounds
- [x] added explicit V4 signed downloads with safely encoded response filenames
- [x] normalized size, ETag, checksum, MIME type, and modification metadata while preserving ETag/checksum semantics
- [x] isolated `ali-oss` to the Alibaba client factory and used injected fakes plus an in-memory adapter for deterministic tests
- [x] validated endpoint, region, bucket, credentials, duration bounds, and production HTTPS
- [x] passed 40 tests, repository type-checks, production builds, dependency audit, diff check, and a no-network real-SDK V4 signing smoke test
- [x] created no cloud resources, used no real credentials, and introduced no file-management API or frontend feature

### L1-E05 — File Management

**Status:** Done

Goal: implement the authenticated, owner-scoped Layer 1 folder and file-management backend over the repository and storage boundaries.

Completion notes:
- [x] added folder create/browse/rename/move/empty-delete/restore with owner scoping, active-parent checks, uniqueness, and cycle prevention
- [x] added pending upload name reservation, renewal, no-overwrite authorization, expected MD5 storage, provider metadata verification, and activation
- [x] added active file listing, signed downloads, metadata-only rename/move, soft deletion, recycle listing, and provider-verified restore
- [x] added durable `deleted → purging → purged` permanent deletion with provider identity checks, idempotent retries, and concurrent-call coalescing; L1-E07 later hardened uncertain failures to remain `purging`
- [x] added strict authenticated `/api/drive` routes with JSON/body validation, stable error codes, and DTOs that hide owner and storage internals
- [x] composed explicit in-memory development/test storage and validated Alibaba OSS production storage
- [x] passed 50 tests, repository type-checks, production builds, dependency audit, diff check, and fresh migration/integrity/foreign-key smoke verification
- [x] created no frontend feature, real cloud resource, credential, background worker, recursive delete, or Layer 2/3 capability

### L1-E06 — Frontend Interface

**Status:** Done

Goal: implement the usable Layer 1 browser interface over the authenticated file-management API:
- login and current-session recovery
- folder navigation and active entries
- browser-direct upload with checksum, progress, completion, and renewal
- file/folder rename, move, delete, restore, and recycle-bin actions
- practical PDF, image, and text preview through short-lived authorized downloads

Completion notes:
- [x] added typed same-origin API/session handling with stable user-facing failures and no persisted secrets or signed URLs
- [x] added incremental MD5, exact policy-field multipart uploads, progress/cancellation/timeout, completion verification, and pending renewal/recovery
- [x] added responsive folder navigation, destination browsing, active/pending/recycle views, and the approved file/folder actions
- [x] added safe short-lived previews, native accessible dialogs, labeled controls, focus restoration, reduced-motion handling, and 320 px layouts
- [x] added 22 deterministic frontend tests and preview HTTP regression coverage
- [x] passed 51 backend tests, 22 frontend tests, repository type-check/build, dependency audit, diff check, and Playwright browser/visual QA
- [x] used no real OSS credentials/resources, cloud operation, permanent URL persistence, or Layer 2/3 capability

### L1-E07 — Security & Reliability

**Status:** Done

Goal: harden the completed Layer 1 application and add a conservative, explicit operating boundary for stale and interrupted lifecycle state.

Completion notes:
- [x] added no-store and secure API headers, stable parser/not-found responses, database-only readiness, and bounded control-plane requests
- [x] disabled raw URL request logging, redacted credential/session/upload fields, and added stable authentication, owner-scope, and destructive-lifecycle audit events
- [x] added file revisions and state-plus-revision CAS for every file mutation and pending cleanup
- [x] bound browser MD5 into upload authorization, refreshed pending revision before renewal, and verified exact provider metadata before deletion
- [x] preserved uncertain permanent deletion in `purging` and added deterministic missing/exact/mismatch/provider-failure recovery
- [x] added bounded expired-session pruning and a serial one-shot maintenance CLI with dry-run default and explicit apply
- [x] documented resource limits, restart/fault behavior, operator procedure, and the residual OSS `HEAD -> DELETE` TOCTOU risk
- [x] passed 74 backend and 22 frontend tests, type-check, production build, both dependency audits, migration/integrity checks, maintenance read-only dry-run smoke, Argon2 benchmark, secret scan, and diff review
- [x] performed no real cloud operation, credential/configuration change, server mutation, automatic scheduler, bucket scan, or ambiguous object deletion

### L1-E08 — Testing & Deployment

**Status:** Done locally — live production acceptance remains approval-gated

Goal: finish Layer 1 acceptance and prepare a reproducible, resource-conscious production deployment and recovery package.

Completion notes:
- [x] covered all ten Layer 1 success steps across SQLite persistence restart and owner isolation
- [x] exercised actual local HTTP multipart bytes for PDF, PNG, UTF-8 text, and binary, including no-overwrite replay rejection and independent download hashes
- [x] added non-overwriting online SQLite backup, integrity/FK/migration/hash verification, and isolated restore rehearsal
- [x] added safe first-account provisioning plus compiled migration, maintenance, backup, process restart, session persistence, and redeployment acceptance
- [x] added loopback-only proxy trust, Nginx HTTPS/static/API configuration, hardened systemd service, environment template, and explicit memory bounds
- [x] documented deployment, migration, rollback, backup, recovery, incident, logging, readiness, OSS, RAM, CORS, versioning, and approval procedures
- [x] passed 88 backend tests, 22 frontend tests, type-check, production build, compiled acceptance, both audits, database/native runtime checks, Argon2 benchmark, secret scan, and diff check
- [x] executed no live credentials, OSS, DNS/TLS, Ubuntu service, firewall, off-host backup, production-data, or billable operation

## Ready

None while PROD-03C2 and L1-UX01 are in progress.

## Backlog — Layer 1

- `PROD-03C3 — Operational Hardening` — Class-B cluster: backup cadence/retention, certificate renewal/reload automation (hard deadline before 2026-11-13), HSTS enablement after renewal and rollback are proven, production-format destructive restore drill, second disposable account and live cross-account isolation check, journal size/retention tuning.
- `files.ajtlab.top` infrastructure gate (follows L1-UX01 review): DNS CNAME, OSS custom-domain binding, certificate issue/bind, `OSS_BROWSER_ENDPOINT` install, CSP site update, private-access verification, rollback — per `docs/deployment/files-ajtlab-top-plan.md`.

## Explicitly Deferred

Do not move to Ready without approval:
- OCR
- RAG
- research graph
- research workflow
- academic citation system
- Baidu Connector
- OneDrive Connector
- Google Drive Connector
- WebDAV Connector
- mobile app
- desktop sync
