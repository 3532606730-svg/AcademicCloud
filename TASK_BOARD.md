# AcademicCloud Task Board

**Last reconciled:** 2026-08-17

## Current Phase

**Repository-driven Core Drive closure → Accounts & Sharing I transition.**

Production remains on the accepted UX01 release and is a separate Owner-gated track.

## Approved Continuous Objective

The Agent may autonomously progress through the following sequence, one independently verified/checkpointed Epic at a time:

1. finish active `L1-UX03` review repairs;
2. `L1-PERF01`;
3. `L1-FOLDER01`;
4. `L2-ACCOUNTS01`;
5. `L2-PASSWORD01` only if Accounts I is fully green and the optional task remains safe;
6. `OPS01A` only if its Ready-card preconditions are satisfied;
7. STOP.

This objective is repository/local only. It does not authorize production contact, deployment, production migration, main merge, One-Time External Sharing, Shared Library, OCR, or RAG.

## Doing

### L1-UX03 — Dedicated Mobile Experience & Zero-Descriptive-Copy UI

**Status:** repo-development closure complete — implementation `dd42cab…` + the three independent-review repairs are done and the adversarial re-review is **APPROVE-WITH-NITS**. Repairs: exact nav order `Library / Favorites / Pending / Recycle` (+exact-sequence test); Preview Download reusing the authoritative `createDownload(file.id)` attachment path while Open keeps the inline URL; 44px mobile floor for Sign In / AccountMenu Sign Out / 中文 / EN. Gates PASS (backend 127/127, frontend 121/121, typecheck/build, acceptance-tools 25/25, acceptance:compiled, diff-check clean, dependency delta 0). `OWNER_VISUAL_GATE=PENDING` (separate product/deployment gate).

### L1-FAV01 — Per-User Favorites

**Status:** implementation and independent ChatGPT review PASS for repository development; separate Owner visual/product gate remains pending before future deployment.

No new implementation work is required absent new evidence.

### PROD-03C2 — Remaining First-Usable Production Gates

**Status:** separate Owner-gated production track; not part of the autonomous local continuous objective.

Retain existing runbook/evidence. Do not contact production merely because local feature work progresses.

## Ready

### 1. L1-PERF01 — Evidence-First Transfer Performance

**Task card:** `tasks/ready/L1-PERF01.md`

Goal: measure checksum/reserve/transfer/verification stages and make only evidence-supported, low-risk client improvements. No production benchmark, no backend large-byte proxy, no Transfer Acceleration activation, no required OSS Multipart Upload implementation.

### 2. L1-FOLDER01 — Transactional Recursive Folder Recycle/Restore

**Task card:** `tasks/ready/L1-FOLDER01.md`

Critical invariant: descendants deleted independently before a later parent recycle must never resurrect when the parent is restored.

### 3. L2-ACCOUNTS01 — Account Foundation, Invite Registration & User Administration

**Task card:** `tasks/ready/L2-ACCOUNTS01.md`

Approved scope: `owner | member`, deterministic migration, first-Owner bootstrap, digest-only invitations, race-safe invite registration, Owner invitation/user administration, Member disable/enable, revoke all Member sessions, strict cross-account isolation.

## Conditional Ready

### L2-PASSWORD01 — Password Change

**Task card:** `tasks/ready/L2-PASSWORD01.md`

Begin only after L2-ACCOUNTS01 is fully green and independently checkpointed. May be deferred without failing the continuous objective.

### OPS01A — Operations Observability & Recovery Preparation

**Task card:** `tasks/ready/OPS01A.md`

Begin only after Core Drive + Accounts I are green and enough safe capacity remains for implementation, adversarial review, and final gates. Repository/local preparation only; no production activation.

## Backlog — Layer 2

### L2-SHARE01 — One-Time External Sharing

Later separate task:
- no-login external capability
- digest-only/single-use or bounded short-lived redemption semantics
- short signed download
- revoke/expiry
- no public bucket exposure

Not authorized in the current continuous objective.

## Backlog — Layer 3 Shared Academic Library

Future separate authorization:
- Library-owned resources
- membership/permissions
- Library-scoped Trusted Contributor
- contribution review
- academic catalog/canonical records
- provenance/source-confidence fields
- original/canonical filename model
- duplicate/version grouping

## Backlog — Layer 4 Research Infrastructure

Future:
- provenance
- document/version/edition/translation relationships
- citations/page references
- research questions
- workflow metadata
- structured export
- research asset graph

## Backlog — Layer 5 Intelligence

Future:
- OCR/text extraction
- indexing/full-text search
- embeddings/retrieval
- RAG
- source-grounded research assistant

Heavy compute must remain isolated from the core drive service.

## Completed / Accepted Checkpoints

- Layer 0 project setup and repository-backed workflow
- L1-E01 through L1-E08 foundation
- accepted 1 GiB-class production runtime baseline
- public HTTPS production foundation and UX01 production acceptance
- L1-UX02 implementation foundation
- L1-BUGAUDIT01 implementation + independent review PASS
- L1-FAV01 implementation + independent review PASS
- L1-UX03 implementation at `dd42cab…` + review repairs — independent re-review APPROVE-WITH-NITS; `OWNER_VISUAL_GATE=PENDING`

Historical detail remains in Git, completed task cards, production runbooks, and existing task records rather than being duplicated here.

## Stop / Escalation Boundaries

Autonomous progression stops for:
- real cost or infrastructure purchase/upgrade;
- production SSH/credentials/security-policy changes;
- destructive or irreversible real-data risk;
- production DB/OSS/DNS/TLS/Nginx/systemd mutation;
- severe unexplained corruption/security anomaly;
- a new product boundary not listed in the approved continuous objective.

Ordinary reversible implementation details, tests, local migrations, local benchmarks, and bounded refactors should be resolved autonomously.
