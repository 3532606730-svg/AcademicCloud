# AcademicCloud Current Status

**Last updated:** 2026-08-12

## Current Layer

**Layer 0 — Project Setup**

## Current Objective

`SETUP-003 — Layer 1 Technical Architecture Decision` is complete. Await an explicit instruction before starting `L1-E01 — Core Architecture Scaffold`.

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

## Current Task

`SETUP-003 — Layer 1 Technical Architecture Decision` is **Done**.

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

- [ ] business code
- [ ] database implementation
- [ ] authentication
- [ ] storage integration
- [ ] file management
- [ ] frontend functionality
- [ ] deployment

## Current Constraints

- No business code during setup.
- No OSS integration yet.
- No database implementation yet.
- No OCR/RAG/connectors.
- No architecture expansion without approval.

## Next Milestone

`L1-E01 — Core Architecture Scaffold` is **Ready — requires explicit approval**. It will establish only the approved minimal frontend/backend structure, configuration strategy, local development workflow, and health-check/basic API connectivity. It has not started.
