# AcademicCloud Task Board

## Current Phase

**Layer 1 — Basic Private Cloud Storage: In Progress**

## Completed

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
- [x] added durable `deleted → purging → purged` permanent deletion with provider identity checks, idempotent retries, failure rollback, and concurrent-call coalescing
- [x] added strict authenticated `/api/drive` routes with JSON/body validation, stable error codes, and DTOs that hide owner and storage internals
- [x] composed explicit in-memory development/test storage and validated Alibaba OSS production storage
- [x] passed 50 tests, repository type-checks, production builds, dependency audit, diff check, and fresh migration/integrity/foreign-key smoke verification
- [x] created no frontend feature, real cloud resource, credential, background worker, recursive delete, or Layer 2/3 capability

## Ready

### L1-E06 — Frontend Interface

**Status:** Ready — authorized by the active continuous Layer 1 objective

Goal: implement the usable Layer 1 browser interface over the authenticated file-management API:
- login and current-session recovery
- folder navigation and active entries
- browser-direct upload with checksum, progress, completion, and renewal
- file/folder rename, move, delete, restore, and recycle-bin actions
- practical PDF, image, and text preview through short-lived authorized downloads

This task must keep credentials and object-storage secrets out of the bundle, use the existing same-origin API/cookie model, and remain within the approved Layer 1 UI scope.

## Backlog — Layer 1

- L1-E07 Security & Reliability
- L1-E08 Testing & Deployment

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
