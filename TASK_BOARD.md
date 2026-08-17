# AcademicCloud Task Board

**Last reconciled:** 2026-08-17

## Current Phase

**The repository-local objective through OPS01A is complete. The Owner has authorized the Pre-OCR Research Foundation program; `RF-PLAN01` is the next executable planning task.**

Production remains on the accepted UX01 release and is a separate Owner-gated track.

## Approved Continuous Objective

The previous sequence is complete:

1. `L1-UX03` review repairs — complete;
2. `L1-PERF01` — complete;
3. `L1-FOLDER01` — complete;
4. `L2-ACCOUNTS01` — complete;
5. `L2-ANNOUNCE01` — complete;
6. `L2-PASSWORD01` — complete;
7. `OPS01A` — complete.

The new Owner-approved repository/local objective is:

1. `RF-PLAN01` — compile the approved Pre-OCR program in `ROADMAP.md` and ADR-014 into dependency-safe, independently executable task cards and an explicit queue;
2. after that planning checkpoint, autonomously consume the generated task cards one green Epic at a time, only inside the approved Pre-OCR boundaries;
3. STOP before OCR/text extraction execution, embeddings, retrieval, or RAG.

Every product Epic remains independently reviewable/checkpointed. Large workstreams must be split in planning rather than implemented as giant diffs.

This objective does not authorize production access/mutation, deployment, production migration, main merge, real credentials, paid infrastructure, destructive real-data operations, OCR execution, embeddings, retrieval, RAG, or an unrecorded product boundary.

## Doing

None.

`tasks/doing/` is intentionally empty at this checkpoint. Historical completed cards belong under `tasks/done/`; parked production work must not remain in `tasks/doing/` because repository recovery treats that directory as active work.

## Ready — Current Repository/Local Objective

### 1. RF-PLAN01 — Pre-OCR Execution Decomposition

**Task card:** `tasks/ready/RF-PLAN01.md`

Planning-only. It must account for the complete approved product inventory in `ROADMAP.md`, apply ADR-014 privacy/ownership rules, split the program into bounded Ready cards, and update this board with the concrete dependency-safe queue. It must not implement product code.

## Approved Program Inventory — To Be Materialized by RF-PLAN01

The following areas are authorized but are not one task. `RF-PLAN01` must decompose them without dropping approved capabilities:

### Core Research UX
- metadata/name Search, excluding OCR full-text search;
- private Recent;
- Bulk Operations;
- Security/Administrative Audit without research surveillance;
- Storage Statistics / quota foundations.

### Personal Research Overlay
- Reading State (`unread | queued | reading | finished` equivalent);
- reading progress / last page / last opened;
- private Important and To Cite flags;
- Personal Tags;
- Collections distinct from Folders;
- Saved Research Views;
- private “Why do I have this?” / acquisition-research notes;
- Favorites/Recent integration.

### Scholarly Records & Metadata
- Scholarly Record separate from physical Artifact;
- attached artifacts and artifact versions;
- canonical scholarly metadata;
- Metadata Templates for Book / Article / Manuscript / Inscription / Archival Document and extensibility;
- provenance/acquisition records;
- checksum/fingerprint and safe duplicate detection;
- edition/scan/translation/transcription/derived-artifact relationships;
- minimal Authority Records foundation, not a mature RDF system.

### Research Intake
- Research Inbox;
- fingerprint/duplicate and metadata/provenance capture;
- triage to existing Record / new Record / ordinary archive / discard;
- stable Save-to-AcademicCloud intake API boundary.

### Annotation / Citation / Evidence
- sidecar/database annotations;
- highlights/page notes;
- Citation Workspace;
- page-level Evidence;
- Evidence Bundles;
- Research Questions and resource/evidence/question links;
- structured export foundations.

### Shared Academic Library
- Library as a real ownership/domain boundary;
- membership/permissions;
- Trusted Contributor where appropriate;
- contribution review;
- Library Tags distinct from Personal Tags;
- shared catalog/canonical records/naming;
- provenance/source confidence;
- duplicate/version grouping;
- strict preservation of each member's private Personal Research Overlay.

### Pre-OCR Hardening
- integrity-monitoring foundations;
- metadata snapshot/recovery foundations where justified;
- permission-matrix verification;
- structured export contracts;
- stable Resource / Artifact / Version / Page identity;
- derived-artifact lineage;
- OCR adapter and extracted-text storage contracts only;
- future indexing/RAG authorization boundary.

## Separate Owner-Gated Production Track

### PROD-03C2 — Remaining First-Usable Production Gates

**Task card:** `tasks/ready/PROD-03C2.md`

**Status:** parked, not executable under the current Pre-OCR continuous objective. It may resume only after an explicit Owner instruction opens a production operations window.

The remaining bounded decisions are the exact disposable-object permanent-delete confirmation and the reboot/autostart policy. Historical authenticated/live disposable-object acceptance and the accepted UX01 production generation are already recorded and must not be replayed merely because this card exists.

Any later deployment of post-UX01 repository code is a separate Owner-gated production rollout, not silently part of RF-PLAN01 or the Pre-OCR queue.

## Future / Non-Blocking Backlog

These are preserved but must not block Pre-OCR completion:
- Private Vault / client-side encryption;
- External Deposit Link;
- polished browser extension after the intake API;
- mature Authority/RDF/semantic-web system;
- full Time Machine/Rewind;
- unrelated expansion of One-Time External Sharing.

### Layer 2 separate backlog — L2-SHARE01

One-Time External Sharing remains a separately scoped capability:
- no-login external capability;
- digest-only/single-use or bounded short-lived redemption semantics;
- short signed download;
- revoke/expiry;
- no public bucket exposure.

It is not silently pulled into the Pre-OCR program merely because other sharing work is authorized.

## Completed

### OPS01A — Operations Observability & Recovery Preparation

**Task card:** `tasks/done/OPS01A.md`

**Status:** complete in repository development. The exact code-bearing checkpoint `34a2eada158dcf08783dc9538d853f9361425e8a` received independent final review and exact-head Linux CI validation. The workflow passed full tests, typechecks, production build, compiled acceptance, dependency audits, Argon2 benchmark, production artifact creation/runtime verification, and a fresh-runner independent artifact download/runtime verification. Repository-owned backup receipt/freshness, dry-run retention, isolated restore drill, readiness audit, restart policy, and inactive journald preparation remain non-production tooling. No migration/dependency or production activation was added.

### L2-PASSWORD01 — Authenticated Password Change

**Task card:** `tasks/done/L2-PASSWORD01.md`

**Status:** complete in repository development. Self-only password change uses the shared bounded Argon2id executor, expected-hash/auth-revision CAS, and atomic revoke-all sessions. Independent adversarial review PASS.

### L2-ANNOUNCE01 — Global Homepage Announcements

**Task card:** `tasks/done/L2-ANNOUNCE01.md`

**Status:** complete in repository development. Migration 008, Owner-authorized administration, server-time effective windows, safe plain-text/HTTPS-link boundaries, responsive homepage integration, backup/restore/runtime evidence, and independent adversarial review are green.

## Completed / Accepted Checkpoints

- Layer 0 project setup and repository-backed workflow;
- L1-E01 through L1-E08 foundation;
- accepted 1 GiB-class production runtime baseline;
- public HTTPS production foundation and UX01 production acceptance;
- L1-UX02 implementation foundation;
- L1-BUGAUDIT01 + independent review PASS;
- L1-FAV01 + independent review PASS;
- L1-UX03 repairs + independent re-review PASS (`OWNER_VISUAL_GATE=PENDING` for future deployment);
- L1-PERF01 evidence closure;
- L1-FOLDER01 migration 006 recursive recycle/restore + independent review PASS;
- L2-ACCOUNTS01 migration 007 Owner/Member/invitations/isolation + independent review PASS;
- L2-ANNOUNCE01 migration 008 + independent review PASS;
- L2-PASSWORD01 + independent review PASS;
- OPS01A repository/local operations preparation + independent final review and exact-head Linux artifact CI PASS.

Historical completed task cards are archived under `tasks/done/`; they no longer remain in `tasks/doing/`.

## Stop / Escalation Boundaries

Autonomous progression stops for:
- real cost or infrastructure purchase/upgrade;
- production SSH/credentials/security-policy changes;
- destructive or irreversible real-data risk;
- production DB/OSS/DNS/TLS/Nginx/systemd mutation;
- production deployment or main merge;
- OCR/text-extraction execution, embeddings, retrieval, or RAG under the current program;
- severe unexplained corruption/security anomaly;
- a new product boundary not represented by the approved roadmap/queue.

Ordinary reversible repository implementation, local migrations inside an approved data model, tests, bounded refactors, and task/project-state reconciliation should be resolved autonomously.
