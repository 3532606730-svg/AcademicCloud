# AcademicCloud Current Status

**Last updated:** 2026-08-12

## Current Layer

**Layer 0 — Project Setup**

## Current Objective

`SETUP-002 — Environment Inspection` is complete. Await an explicit instruction before starting `SETUP-003 — Layer 1 Technical Architecture Decision`.

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

## Current Task

`SETUP-002 — Environment Inspection` is **Done**.

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

- [ ] Layer 1 technology-stack decision
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

`SETUP-003 — Layer 1 Technical Architecture Decision` is ready but has not started and requires an explicit instruction. It will compare and decide the minimum Layer 1 technical stack without implementing it.
