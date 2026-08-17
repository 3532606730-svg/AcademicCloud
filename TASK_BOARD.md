# AcademicCloud Task Board

**Last reconciled:** 2026-08-17

## Current Phase

**Repository-driven Core Drive closure → Accounts & Sharing I transition.**

Production remains on the accepted UX01 release and is a separate Owner-gated track.

## Approved Continuous Objective

The Agent may autonomously progress through the following sequence, one independently verified/checkpointed Epic at a time:

1. `L1-UX03` review repairs — complete;
2. `L1-PERF01` — complete;
3. `L1-FOLDER01` — complete;
4. `L2-ACCOUNTS01`;
5. `L2-ANNOUNCE01` after Accounts I is fully green;
6. `L2-PASSWORD01` only if its existing conditional gate remains satisfied;
7. `OPS01A` only if its Ready-card preconditions are satisfied;
8. STOP.

This objective is repository/local only. It does not authorize production contact, deployment, production migration, main merge, One-Time External Sharing, Shared Library, OCR, or RAG.

## Doing

None at the L1-FOLDER01 completion checkpoint. `L2-ACCOUNTS01` is the next task to activate.

## Ready

### 1. L2-ACCOUNTS01 — Account Foundation, Invite Registration & User Administration

**Task card:** `tasks/ready/L2-ACCOUNTS01.md`

Approved scope: `owner | member`, deterministic migration, first-Owner bootstrap, digest-only invitations, race-safe invite registration, Owner invitation/user administration, Member disable/enable, revoke all Member sessions, strict cross-account isolation.

### 2. L2-ANNOUNCE01 — Global Homepage Announcements

**Task card:** `tasks/ready/L2-ANNOUNCE01.md`

Approved after Accounts I: Owner administration authority creates/edits/publishes/unpublishes database/API-backed plain-text announcements; all authenticated active users read the currently effective set on the homepage. No new global role, notification delivery, receipts, acknowledgement workflow, notification center, or rich-text editor.

## Conditional Ready

### L2-PASSWORD01 — Password Change

**Task card:** `tasks/ready/L2-PASSWORD01.md`

Begin only after L2-ACCOUNTS01 and L2-ANNOUNCE01 are fully green and independently checkpointed. May be deferred without failing the continuous objective.

### OPS01A — Operations Observability & Recovery Preparation

**Task card:** `tasks/ready/OPS01A.md`

Begin only after Core Drive + Accounts I + ANNOUNCE01 are green and enough safe capacity remains for implementation, adversarial review, and final gates. Repository/local preparation only; no production activation.

## Separate Owner-Gated Production Track

### PROD-03C2 — Remaining First-Usable Production Gates

Retain the existing runbook/evidence. This track is not active under the repository/local continuous objective, and repository feature progress does not authorize production contact.

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
- L1-PERF01 — evidence gathered; no client optimization justified; independent review PASS
- L1-FOLDER01 — migration 006 + recursive recycle/restore; backend 135/135, frontend 121/121, canonical gates and independent review PASS

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
