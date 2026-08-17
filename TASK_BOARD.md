# AcademicCloud Task Board

**Last reconciled:** 2026-08-17

## Current Phase

**Repository-driven Accounts & Sharing I: Accounts, announcements, and authenticated Password Change green; OPS01A remains conditional.**

Production remains on the accepted UX01 release and is a separate Owner-gated track.

## Approved Continuous Objective

The Agent may autonomously progress through the following sequence, one independently verified/checkpointed Epic at a time:

1. `L1-UX03` review repairs — complete;
2. `L1-PERF01` — complete;
3. `L1-FOLDER01` — complete;
4. `L2-ACCOUNTS01` — complete;
5. `L2-ANNOUNCE01` — complete;
6. `L2-PASSWORD01` — complete;
7. `OPS01A` only if its Ready-card preconditions are satisfied;
8. STOP.

This objective is repository/local only. It does not authorize production contact, deployment, production migration, main merge, One-Time External Sharing, Shared Library, OCR, or RAG.

## Doing

None while the L2-PASSWORD01 local checkpoint is being synchronized. The next task may begin only after that checkpoint exists and the OPS01A conditional gate is recovered from its Ready card.

## Ready

None. Conditional tasks below are not active.

## Conditional Ready

### OPS01A — Operations Observability & Recovery Preparation

**Task card:** `tasks/ready/OPS01A.md`

Begin only after Core Drive + Accounts I + ANNOUNCE01 are green and enough safe capacity remains for implementation, adversarial review, and final gates. Repository/local preparation only; no production activation.

## Completed

### L2-PASSWORD01 — Authenticated Password Change

**Task card:** `tasks/done/L2-PASSWORD01.md`

**Status:** complete in repository development. Both roles can change only their own password through an exact-origin API; the accepted shared Argon2id executor, expected-hash plus authentication-revision compare-and-swap, and atomic revoke-all transaction prevent concurrent overwrite and old-session revival. Backend `178/178`, frontend `136/136`, compiled migration count 8, dependency/migration delta 0, ADR-013, and independent adversarial review are green. No production access, push, or main merge occurred.

### L2-ANNOUNCE01 — Global Homepage Announcements

**Task card:** `tasks/done/L2-ANNOUNCE01.md`

**Status:** complete in repository development. Migration 008, Owner-authorized administration, identical authenticated effective reads, exact server-time filtering, safe plain-text/HTTPS-link boundaries, API-backed responsive homepage, backup/restore/runtime evidence, and independent adversarial review are green. Backend `165/165`, frontend `131/131`, compiled migration count 8; dependency delta 0. No production access, push, or main merge occurred.

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
- L2-ACCOUNTS01 — migration 007 + exact `owner | member` roles, digest-only invitations, race-safe Member registration, Owner Member administration, atomic disable/session revocation, zero-copy frontend integration, cross-account isolation matrix, ADR-011, backend 156/156, frontend 125/125, canonical gates and independent review PASS
- L2-ANNOUNCE01 — migration 008 + Owner-authorized global announcements, exact effective-window/order semantics, safe plain-text/HTTPS-link boundary, API-backed responsive homepage, backup/restore/runtime coverage, ADR-012, backend 165/165, frontend 131/131, canonical gates and independent review PASS
- L2-PASSWORD01 — shared bounded Argon2id, expected-hash/revision CAS, atomic revoke-all sessions, self-only API/account UI, ADR-013, backend 178/178, frontend 136/136, canonical gates and independent review PASS

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
