# AcademicCloud Decision Log

Record only meaningful product, architecture, security, infrastructure, or workflow decisions.

## ADR-001 — Modular Architecture Is Mandatory

**Date:** 2026-08-11  
**Status:** Accepted

AcademicCloud uses modular boundaries and explicit interfaces. A failure, change, or replacement in one module must not unnecessarily affect unrelated modules.

## ADR-002 — Layer 1 Is a Basic Private Cloud Drive

**Date:** 2026-08-11  
**Status:** Accepted

The first implementation layer focuses only on reliable file storage and file management.

Not included:
- OCR
- RAG
- AI assistant
- research graph
- academic workflow
- external cloud-drive transfer
- mobile/desktop sync clients

Reason: reduce project risk, token waste, implementation complexity, and maintenance burden.

## ADR-003 — File Bytes Will Not Primarily Live on the Existing 20 GB Server Disk

**Date:** 2026-08-11  
**Status:** Accepted

Current server:
- 2 vCPU
- 512 MB RAM
- 20 GB disk

Decision: use object storage for file bytes. The server primarily provides application/API/control functions.

Initial direction: Alibaba Cloud OSS, behind a storage abstraction.

## ADR-004 — Project Documentation Is Persistent AI Project Memory

**Date:** 2026-08-11  
**Status:** Accepted

Important knowledge must live in repository files rather than Codex chat history.

Sources of truth:
- `AGENTS.md`
- `PROJECT_SPEC.md`
- `ROADMAP.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `DECISION_LOG.md`
- Git history
- current code

## ADR-005 — Development Uses Scoped Module Chats and Tasks

**Date:** 2026-08-11  
**Status:** Accepted

Use one repository and multiple bounded Codex chat threads/tasks.

Each major task should:
1. read project state,
2. plan before implementation,
3. modify only approved scope,
4. test,
5. update project state,
6. stop before the next major task.

## ADR-006 — Long-Term Research Features Are Preserved but Deferred

**Date:** 2026-08-11  
**Status:** Accepted

Preserve future directions without implementing them in Layer 1:
- research asset graph
- research workflow layer
- source credibility metadata
- document/version lineage
- academic data export
- research-question management
- citation support
- extensible interfaces
- OCR
- RAG

## ADR-007 — Layer 1 Technical Architecture

**Date:** 2026-08-12
**Status:** Accepted
**Full record:** `docs/decisions/ADR-007-layer-1-technical-architecture.md`

Layer 1 uses:
- Node.js 24 LTS, TypeScript, and Fastify 5 for the backend
- React, TypeScript, and Vite for a client-side SPA
- SQLite with `better-sqlite3` behind persistence/repository interfaces
- SQLite-backed server-side opaque sessions
- a mature memory-hard password-hashing implementation, with Argon2id preferred and implementation details deferred
- npm workspaces with one `package-lock.json`
- Nginx, systemd, and one Node.js process in production
- no Docker, Redis, message queue, or permanent worker for the current deployment
- a private Alibaba Cloud OSS bucket behind `StorageAdapter`, using short-lived restricted browser-direct uploads and signed downloads
- the minimum module boundaries `platform`, `auth`, `drive`, `storage`, and `persistence`

Node.js remains on the 24 LTS release line; the exact supported 24.x security patch is selected and recorded when dependencies are installed or production is deployed. `better-sqlite3` is isolated behind persistence so that a future stable and mature `node:sqlite` implementation can be evaluated without changing business modules. Nginx is deployment infrastructure and is not a business-code dependency.
