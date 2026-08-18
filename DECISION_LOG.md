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

This decision still governs the history and safety philosophy of Layer 1. Later product layers were explicitly approved in ADR-010 rather than being pulled into the original Layer 1 scope retroactively. ADR-022 later clarifies that the final academic corpus is not a private-Drive product even though the first implementation layer used private Drive semantics as a safe substrate.

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
**Status:** Accepted / refined by ADR-014 and later ADR-022  
**Full record:** `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`

ADR-010 established the post-Core-Drive sequence and repository-driven continuous-objective model. The coarse original product layers were Core Drive → Accounts & Sharing → Shared Academic Library → Research Infrastructure → Intelligence, with Operations cross-cutting.

The execution model remains authoritative: each Epic is bounded, verified, independently reviewable, recorded, and checkpointed; long runs consume an explicit repository queue rather than a giant chat prompt. ADR-014 refined privacy/data planes, and ADR-022 later corrected the default product authority to one Owner-curated shared corpus plus private research overlays.

## ADR-011 — Accounts, Invitations, and Member Access Administration

**Date:** 2026-08-17
**Status:** Accepted
**Full record:** `docs/decisions/ADR-011-accounts-and-invitation-security-model.md`

Accounts use exactly `owner | member`; ambiguous multi-account legacy databases fail migration rather than guessing an Owner. Invitations are single-use digest-backed capabilities. Member registration hashes outside the write transaction and revalidates/consumes the capability atomically. Member state transitions advance a durable authentication revision, revoke all existing sessions on disable, and prevent a pre-disable login attempt from publishing a session after disable or reviving after enable. Global role does not grant cross-account drive access.

## ADR-012 — Global Announcement Publication Model

**Date:** 2026-08-17
**Status:** Accepted
**Full record:** `docs/decisions/ADR-012-global-announcement-publication-model.md`

Global announcements reuse the exact Owner authority from Accounts I and give all active authenticated accounts the same effective read set without changing the then-current private-drive isolation. Schema 008 uses server-authoritative publication/expiry boundaries and deterministic ordering; no cleanup worker is required for visibility correctness. Content remains plain text, optional links are normalized credential-free HTTPS URLs, and explicit idempotent publish/unpublish actions cannot be supplied through general content inputs.

## ADR-013 — Authenticated Password Change Model

**Date:** 2026-08-17
**Status:** Accepted / historical product surface superseded by ADR-022
**Full record:** `docs/decisions/ADR-013-authenticated-password-change-model.md`

Password change was implemented as self-only for authenticated Owner and Member accounts, reusing the bounded Argon2id executor with CAS and atomic session revocation. Its security primitives remain useful evidence, but ADR-022 supersedes the need for a routine self-service password-change product surface in this small invitation-only deployment. Future recovery uses Owner-authorized one-time credential reset without revealing the Member's final password.

## ADR-014 — Privacy, Ownership, Scholarly Resource, and Research-Activity Boundaries

**Date:** 2026-08-17  
**Status:** Accepted / clarified by ADR-022  
**Full record:** `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`

AcademicCloud separates Physical Artifact, Scholarly Resource/Record, Personal Research Overlay, Collaborative Overlay, Governance/Operations, and Derived Intelligence.

The core rule is: **shared resource does not imply shared research activity.** Reading State/progress, Personal Tags, Collections, Saved Views, private notes, annotations, citation/evidence work, Evidence Bundles, Research Questions, and equivalent personal research state are account-private by default; Owner/Admin receives no implicit product read authority over another account's Personal Research Overlay. Administrative audit must not become research surveillance.

Folder and Collection are distinct; canonical metadata and private interpretation are distinct; original acquired artifacts remain preservable evidence while derived artifacts have explicit lineage; duplicate detection must not expose inaccessible resources; and future OCR/index/retrieval/RAG authority may never exceed the requesting user's effective authority.

ADR-022 clarifies the previously underspecified default on the shared-resource side: the canonical AcademicCloud academic corpus is shared after Owner admission rather than remaining account-private until an optional sharing action.

## ADR-022 — Default Shared Library and Private Research Activity

**Date:** 2026-08-18  
**Status:** Accepted by Owner  
**Full record:** `docs/decisions/ADR-022-default-shared-library-and-private-research-activity.md`

AcademicCloud is one Owner-curated shared academic corpus, not a collection of private Drives with an optional Shared Library. A normal Member upload enters pending contribution review; Owner approval admits it into the canonical shared `资料库`, while rejection leaves it unadmitted. Owner-originated uploads may be admitted directly because the Owner already holds review authority.

Approved resources are shared to active authorized members for normal corpus access. Favorites, Recent, reading state/progress, Personal Tags, Collections, Saved Views, notes, annotations, citation/evidence work, Research Questions, and equivalent research activity remain private per account.

`Scholarly Record`, `Artifact`, `Artifact Version`, ownership domains, and governance audit remain internal domain/operations concepts rather than primary navigation. Governance audit belongs under Owner administration as `操作记录`.

Routine self-service password change is not required. Lost access is handled by an Owner-authorized, short-lived, single-use credential reset in which the Member chooses the final password; no email/SMS/OAuth recovery infrastructure is introduced.

Existing schema-v15 ownership/Library/contribution foundations remain valid implementation primitives. Their earlier optional-shared-library product framing is superseded; production backfill/transition of existing account-owned corpus data remains separately Owner-gated.

## ADR-023 — Durable Decision Reconciliation and Local Sync

**Date:** 2026-08-18  
**Status:** Accepted by Owner  
**Full record:** `docs/decisions/ADR-023-durable-decision-reconciliation-and-local-sync.md`

Newly accepted durable product, architecture, security, workflow, roadmap, task-boundary, or execution-sequencing decisions must be reconciled into the relevant repository memory instead of remaining only in chat. Update the smallest complete authoritative set such as `ROADMAP.md`, `CURRENT_STATUS.md`, `TASK_BOARD.md`, task cards, ADRs, `AGENTS.md`, or the AcademicCloud workflow skill as appropriate.

When the resulting repository changes are pushed to the authorized remote branch and an active local checkout is accessible, synchronize that checkout non-destructively and verify that local HEAD equals the intended remote HEAD. Unknown local work must never be discarded merely to obtain equality.

If the current agent can update GitHub but cannot access the Owner's actual local checkout, it must report local synchronization as outstanding rather than claim success. Repository publication, local synchronization, and production deployment remain distinct states.

## ADR-024 — Owner-Assisted Credential Reset

**Date:** 2026-08-18
**Status:** Accepted
**Full record:** `docs/decisions/ADR-024-owner-assisted-credential-reset.md`

Only the active Owner may issue a 30-minute, 256-bit one-time reset capability for an active or disabled Member. Persistence keeps only the capability digest and immutable lifecycle evidence; reissue atomically supersedes every prior outstanding capability for the same Member. The Member chooses the final password on a dedicated same-origin surface, and the Owner never receives it.

Redemption reuses the bounded Argon2id executor and atomically updates the exact password/authentication revision, consumes the capability, revokes every old session, and records audit evidence. Exactly one concurrent redemption wins, a pending old-password login cannot publish, disabled Members stay disabled, and archived accounts are ineligible. The authenticated self-service password HTTP/UI path is retired; no email/SMS/OAuth/public recovery service is introduced.

## ADR-028 — Permanent-Delete Authority and Domain Safety

**Date:** 2026-08-19
**Status:** Accepted through PROD-07B and reconciled by L1-UX07
**Full record:** `docs/decisions/ADR-028-permanent-delete-authority-and-domain-safety.md`

Only the authenticated global `owner` may permanently delete eligible recycled account resources or Library holdings; Library role and contributor/uploader/creator identity are insufficient. Account and Library targets retain separate lifecycle routing.

Library deletion must prove exact object/reference/lineage exclusivity and repeat that proof inside the destructive transaction immediately before `deleted → purging`. A changed or shared path fails with conflict/concurrent change while storage and lineage remain untouched. Storage cleanup and final `purged` state reuse the established purge state machine/audit ordering, and sequential cross-domain UI coordination reports partial irreversible completion truthfully. Repository support never authorizes a real production purge.
