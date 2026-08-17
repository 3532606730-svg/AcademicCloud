# AcademicCloud Decision Log

Record only meaningful product, architecture, security, infrastructure, or workflow decisions.

## ADR-001 — Modular Architecture Is Mandatory

**Date:** 2026-08-11  
**Status:** Accepted

AcademicCloud uses modular boundaries and explicit interfaces. A failure, change, or replacement in one module must not unnecessarily affect unrelated modules.

## ADR-002 — Layer 1 Is a Basic Private Cloud Drive

**Date:** 2026-08-11  
**Status:** Accepted / historical first-layer decision

The first implementation layer focuses only on reliable file storage and file management. OCR, RAG, AI assistance, research graphs, academic workflows, external cloud-drive transfer, and native sync clients were deliberately deferred to reduce early project risk.

This decision still governs the history and safety philosophy of Layer 1. Later product layers were explicitly approved in ADR-010 rather than being pulled into the original Layer 1 scope retroactively.

## ADR-003 — File Bytes Will Not Primarily Live on the Existing System Disk

**Date:** 2026-08-11  
**Status:** Accepted

Decision: use object storage for academic file bytes. The server primarily provides application/API/control functions. Alibaba Cloud OSS is the initial provider behind a storage abstraction.

The server was later upgraded to the accepted 1 GiB-class host; the architectural decision remains unchanged.

## ADR-004 — Project Documentation Is Persistent AI Project Memory

**Date:** 2026-08-11  
**Status:** Accepted

Important knowledge lives in repository files rather than chat history.

Primary durable sources include:
- `AGENTS.md`
- `PROJECT_SPEC.md`
- `ROADMAP.md`
- `CURRENT_STATUS.md`
- `TASK_BOARD.md`
- `DECISION_LOG.md`
- task cards
- Git history
- current code/tests

## ADR-005 — Development Uses Scoped Module Chats and Tasks

**Date:** 2026-08-11  
**Status:** Accepted

Use one repository and multiple bounded engineering tasks. Each major task recovers state, plans, modifies only approved scope, tests/reviews, reconciles project state, and creates a checkpoint.

A later explicitly approved continuous objective may chain several independently checkpointed Epics; this does not remove Epic boundaries.

## ADR-006 — Long-Term Research Features Are Preserved but Deferred

**Date:** 2026-08-11  
**Status:** Accepted

Preserve future directions without implementing them prematurely:
- research asset graph
- research workflow layer
- source credibility/provenance metadata
- document/version lineage
- academic data export
- research-question management
- citation support
- extensible interfaces
- OCR
- RAG

ADR-010 later organized these preserved directions into explicit future product layers.

## ADR-007 — Layer 1 Technical Architecture

**Date:** 2026-08-12  
**Status:** Accepted  
**Full record:** `docs/decisions/ADR-007-layer-1-technical-architecture.md`

Layer 1 uses:
- Node.js 24 LTS, TypeScript, Fastify 5
- React, TypeScript, Vite
- SQLite with `better-sqlite3` behind repositories
- SQLite-backed opaque sessions
- npm workspaces
- Nginx/systemd, one Node.js production process
- private Alibaba OSS behind `StorageAdapter`
- browser-direct uploads and signed/direct downloads
- no Docker, Redis, queue, or permanent worker in the current deployment

## ADR-008 — Repository-Backed Autonomous AI Engineering Workflow

**Date:** 2026-08-12  
**Status:** Accepted / reaffirmed 2026-08-17

AcademicCloud uses `.agents/skills/academiccloud-workflow/SKILL.md` for repository-driven engineering. The Agent recovers state from code, Git, project records, and task cards; executes ordinary technical work autonomously within approved scope; validates/reviews/records results; and creates task-level Git checkpoints.

The Owner retains decisions about product direction, real cost, irreversible real-data risk, production/security boundaries, and severe anomalies.

On 2026-08-17 the project explicitly returned from large chat-prompt orchestration to this repository-driven model. Approved future task specifications may live in `tasks/ready/`; active and completed Epic memory remains in `tasks/doing/` and `tasks/done/`.

## ADR-009 — Layer 1 Authentication Security Baseline

**Date:** 2026-08-12  
**Status:** Accepted  
**Full record:** `docs/decisions/ADR-009-authentication-security-baseline.md`

Layer 1 uses bounded Argon2id password hashing and SQLite-backed opaque sessions. Password work uses 64 MiB, three iterations, one lane, one active operation, and at most four queued operations. Session secrets contain 256 random bits; only SHA-256 digests are stored. Sessions have a seven-day absolute lifetime and are checked for expiry, revocation, and active account state.

The same-origin SPA uses exact `APP_ORIGIN` enforcement on unsafe API requests plus `SameSite=Strict` cookies. Production uses the `__Host-ac_session` cookie with `Secure`, `HttpOnly`, `Path=/`, and no `Domain`; local HTTP development uses a separate cookie name. Login is JSON-only and rate-limited without Redis.

## ADR-010 — Product Roadmap Expansion and Repository-Driven Continuous Objectives

**Date:** 2026-08-17  
**Status:** Accepted  
**Full record:** `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`

AcademicCloud's post-Core-Drive product sequence is now explicit:
1. Layer 1 — Core Drive closure;
2. Layer 2 — Accounts & Sharing;
3. Layer 3 — Shared Academic Library;
4. Layer 4 — Research Infrastructure;
5. Layer 5 — Intelligence.

Operations is a cross-cutting track rather than a product layer.

The immediate continuous objective is repository/local only: finish UX03 repair → PERF01 → FOLDER01 → Accounts I → Global Homepage Announcements, with Password Change optional afterward and OPS01A conditional. Each Epic must remain independently verified/checkpointed. One-Time External Sharing, Shared Library, Research Infrastructure, Intelligence, and production rollout require later explicit gates.

## ADR-011 — Accounts, Invitations, and Member Access Administration

**Date:** 2026-08-17
**Status:** Accepted
**Full record:** `docs/decisions/ADR-011-accounts-and-invitation-security-model.md`

Accounts use exactly `owner | member`; ambiguous multi-account legacy databases fail migration rather than guessing an Owner. Invitations are single-use digest-backed capabilities. Member registration hashes outside the write transaction and revalidates/consumes the capability atomically. Member state transitions advance a durable authentication revision, revoke all existing sessions on disable, and prevent a pre-disable login attempt from publishing a session after disable or reviving after enable. Global role does not grant cross-account drive access.

## ADR-012 — Global Announcement Publication Model

**Date:** 2026-08-17
**Status:** Accepted
**Full record:** `docs/decisions/ADR-012-global-announcement-publication-model.md`

Global announcements reuse the exact Owner authority from Accounts I and give all active authenticated accounts the same effective read set without changing private-drive isolation. Schema 008 uses server-authoritative publication/expiry boundaries and deterministic ordering; no cleanup worker is required for visibility correctness. Content remains plain text, optional links are normalized credential-free HTTPS URLs, and explicit idempotent publish/unpublish actions cannot be supplied through general content inputs.

## ADR-013 — Authenticated Password Change Model

**Date:** 2026-08-17
**Status:** Accepted
**Full record:** `docs/decisions/ADR-013-authenticated-password-change-model.md`

Password change is self-only for authenticated Owner and Member accounts. Current-password verification and replacement hashing reuse the single bounded Argon2id executor outside the SQLite write transaction. The captured password hash plus durable authentication revision form a conditional update token; the successful password update and revoke-all-sessions commit atomically, so concurrent changes, disable/enable races, pending logins, and revocation failures cannot overwrite or revive old authentication state. No migration or dependency is added.
