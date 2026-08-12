# AcademicCloud Current Status

**Last updated:** 2026-08-12

## Current Layer

**Layer 1 — Basic Private Cloud Storage: In Progress**

`L1-E01 — Core Architecture Scaffold` and `L1-E02 — Database Foundation` are complete. No authentication flow, storage adapter, or file-management API has started.

## Current Objective

`L1-E02 — Database Foundation` is complete. `L1-E03 — Authentication & Authorization` is Ready and awaits the next explicit task-selection instruction.

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

## Current Task

`L1-E02 — Database Foundation` is **Done**.

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
- The target Ubuntu server has 512 MB RAM, so Layer 1 architecture and deployment must remain lightweight.

## Not Started

- [x] core application scaffold
- [x] database foundation
- [ ] authentication
- [ ] storage integration
- [ ] file management
- [ ] frontend functionality
- [ ] deployment

## Current Constraints

- Do not start `L1-E03` without a user instruction selecting the Ready task.
- Keep work within the approved task, Layer 1 scope, and accepted architecture.
- Escalate only the mandatory boundaries defined by `.agents/skills/academiccloud-workflow/SKILL.md`.
- No OCR/RAG/connectors.
- No architecture expansion without approval.

## Next Milestone

`L1-E03 — Authentication & Authorization` is **Ready — starts on a user task-selection instruction such as `开始下一个任务`**. It will implement password hashing under the 512 MB constraint, SQLite-backed opaque sessions, authentication routes, protected-route guards, and server-derived ownership context. It has not started.
