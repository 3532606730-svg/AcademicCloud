# AcademicCloud Roadmap

**Last reconciled:** 2026-08-17

The roadmap records product sequencing. `TASK_BOARD.md` is the executable queue. Future layers must not be pulled forward without explicit Owner approval.

## Layer 0 — Project Setup

**Status:** Complete

Delivered:
- repository structure and Git
- persistent project-memory documents
- task tracking and ADRs
- autonomous repository-backed engineering workflow
- local environment baseline

## Layer 1 — Core Drive

**Goal:** a reliable, secure, maintainable academic cloud drive.

### Completed foundation
- L1-E01 Core Architecture
- L1-E02 Database Foundation
- L1-E03 Authentication & Authorization
- L1-E04 Storage Abstraction
- L1-E05 File Management
- L1-E06 Frontend Interface
- L1-E07 Security & Reliability
- L1-E08 Testing & Deployment
- UX01 production release accepted
- UX02 academic workspace implementation
- BUGAUDIT01 cross-layer hardening
- FAV01 per-user Favorites implementation and independent review
- UX03 dedicated mobile + zero-descriptive-copy implementation

### Closure checkpoint
1. **L1-UX03 repair — complete.** Exact mobile nav order, Preview Download, and remaining mobile touch-target hardening passed independent review.
2. **L1-PERF01 — complete.** Evidence did not justify a client optimization; OSS Multipart Upload and Transfer Acceleration were not required for closure.
3. **L1-FOLDER01 — complete.** Transactional recursive non-empty-folder recycle/restore uses explicit recycle provenance; independently pre-deleted descendants never join or revive with a later parent group.

**Exit condition:** Core Drive closure tasks are green, adversarially reviewed, and independently checkpointed. Production deployment is a separate gate.

## Layer 2 — Accounts & Sharing

**Goal:** controlled multi-user private access without public registration.

### Approved next Epic — L2-ACCOUNTS01
- global `owner | member` roles
- deterministic legacy role migration
- first-Owner bootstrap
- Owner-issued invitations
- digest-only invitation capability storage
- invite-only Member registration
- race-safe single redemption
- minimal Owner user list/administration
- disable/enable Member
- revoke all Member sessions on disable
- strict cross-account drive/Favorites isolation

### Approved Epic after Accounts — L2-ANNOUNCE01
- Owner administration authority creates, edits, publishes, and unpublishes global announcements
- every authenticated active account reads currently effective announcements on the homepage
- fields cover title, plain-text body, `info | warning | critical`, nullable link, active/published/expiry state, creator, and timestamps
- expired announcements disappear by server-authoritative time filtering
- no new `admin` role, email/push, read receipts, acknowledgement workflow, notification center, or rich-text editor
- database/API-backed; never hard-coded frontend configuration

### Conditional follow-up — L2-PASSWORD01
- authenticated current-password verification
- concurrency-safe password update
- revoke all sessions including current session after success

### Later Layer 2 backlog
- One-Time External Sharing
- optional additional session-management UX

Explicitly deferred from Accounts I:
- public signup/email/SMTP/OAuth
- arbitrary role editing
- account deletion

## Layer 3 — Shared Academic Library

**Status:** Future; separate authorization required.

Planned Epics:
- Library-owned resource model
- membership and Library-scoped permissions
- Trusted Contributor
- contribution submission/review/approval/rejection
- academic catalog and canonical records
- author/editor/translator/language/publication/type metadata
- provenance/source confidence
- original/canonical filename model
- duplicate/version grouping

## Layer 4 — Research Infrastructure

**Status:** Future.

Planned directions:
- provenance/source records
- document relationships
- edition/scan/translation/version lineage
- citations and page references
- research-question links
- research workflow metadata
- structured export
- research asset graph

## Layer 5 — Intelligence

**Status:** Future.

Planned directions:
- OCR/text extraction
- full-text indexing/search
- embeddings/retrieval
- RAG
- evidence/page citation
- source-grounded research assistant

Heavy compute should be isolated from the core 1 GiB-class application host.

## Cross-Cutting Operations Track

Operations is not a product layer.

### Conditional approved task — OPS01A
Repository/local preparation only:
- lightweight `ops:check`-style health/status tooling
- backup verification and freshness
- disk/RAM/swap checks
- certificate-expiry checks
- restore-drill tooling in isolation
- backup-retention dry-run/planner
- systemd timer/service templates
- restart-policy audit

Not authorized by OPS01A:
- production SSH
- enabling services/timers
- destructive backup pruning
- production restore
- certificate replacement
- HSTS/Nginx/DNS/TLS/OSS mutation
- deployment

## Separate Production Track

The accepted production site remains a separately gated operational track. Repository feature implementation never implies production rollout.

Outstanding production decisions/runbook items remain Owner-gated, including permanent-delete confirmation, autostart/reboot policy, certificate-renewal closure, and later deployment of post-UX01 code.

## Current Approved Continuous Objective

The Agent may autonomously progress, with an independent checkpoint after every Epic, through:

```text
Finish current L1-UX03
        ↓
L1-PERF01
        ↓
L1-FOLDER01
        ↓
L2-ACCOUNTS01
        ↓
L2-ANNOUNCE01
        ↓
L2-PASSWORD01       (conditional)
        ↓
OPS01A              (conditional)
        ↓
STOP
```

Do not continue into One-Time External Sharing, Shared Library, Research Infrastructure, or Intelligence without a new Owner authorization.
