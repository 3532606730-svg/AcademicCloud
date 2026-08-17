# AcademicCloud Roadmap

**Last reconciled:** 2026-08-17

The roadmap records durable product sequencing and approved boundaries. `TASK_BOARD.md` is the executable queue; task cards define implementable Epic contracts. A roadmap item is not permission to bypass the current queue or an Owner gate.

AcademicCloud's long-term direction is:

> **Reliable Drive → Accounts & Governance → Personal Scholarly Workspace → Shared Academic Library → Research Infrastructure → Source-grounded Intelligence**

The repository is designed so that later intelligence grows from explicit scholarly identities, provenance, privacy, and evidence relationships rather than from an unstructured bucket of PDFs.

## Cross-Layer Product Model

ADR-014 defines six durable data planes:

1. **Physical Artifact** — stored files/bytes, object identity, checksum, media/lifecycle metadata.
2. **Scholarly Resource / Scholarly Record** — the logical academic object and canonical scholarly facts.
3. **Personal Research Overlay** — private per-account reading, organizing, annotation, citation, evidence, and research state.
4. **Collaborative Overlay** — explicitly shared Library/catalog/contribution state.
5. **Governance / Operations** — accounts, permissions, announcements, security audit, quota, integrity, recovery evidence.
6. **Derived Intelligence** — OCR, extracted text, index, embeddings, retrieval, RAG-derived state subject to source authorization.

Mandatory principles across all future layers:

- shared resource does not imply shared research activity;
- Owner/Admin has no implicit product read authority over another user's Personal Research Overlay;
- administrative audit is not research surveillance;
- Folder is storage hierarchy, while Collection is research-semantic organization;
- original acquired artifacts remain preservable evidence and derived artifacts have explicit lineage;
- duplicate detection must not reveal inaccessible resources across account boundaries;
- AI/derived-intelligence authority never exceeds the requesting user's effective authority.

## Layer 0 — Project Setup

**Status:** Complete

Delivered:
- repository structure and Git;
- persistent project-memory documents;
- task tracking and ADRs;
- repository-backed autonomous engineering workflow;
- local environment baseline.

## Layer 1 — Core Drive

**Goal:** reliable, secure, maintainable private file storage and file management.

**Status:** Repository-development foundation and closure complete. Production rollout remains separately Owner-gated.

Completed foundation:
- L1-E01 Core Architecture;
- L1-E02 Database Foundation;
- L1-E03 Authentication & Authorization;
- L1-E04 Storage Abstraction;
- L1-E05 File Management;
- L1-E06 Frontend Interface;
- L1-E07 Security & Reliability;
- L1-E08 Testing & Deployment;
- UX01 production release accepted;
- UX02 academic workspace;
- BUGAUDIT01 cross-layer hardening;
- FAV01 per-user Favorites;
- UX03 mobile/zero-descriptive-copy closure;
- PERF01 evidence-first transfer performance closure;
- FOLDER01 transactional recursive recycle/restore with explicit recycle provenance.

### Pre-OCR Core Research UX — Approved Program Scope

The following daily-use capabilities are approved for decomposition under the Pre-OCR Research Foundation program. They remain separate, reviewable Epics rather than one bulk implementation:

- **Metadata/name Search** — global file/folder/resource search over authoritative metadata; this is not OCR full-text search.
- **Recent** — private per-account recent-access/working state; not administrator-visible research surveillance.
- **Bulk Operations** — safe multi-select operations such as move, recycle, Favorite changes, and other existing-lifecycle actions where atomicity/partial-failure semantics are explicit.
- **Security / Administrative Audit** — governance events only; no default recording of reading page, search terms, annotation content, or equivalent private research behavior.
- **Storage Statistics / Quota Foundations** — aggregate capacity/file-count/recycle/pending state and account-scoped statistics; quota enforcement may be separately staged if useful.

## Layer 2 — Accounts & Governance

**Goal:** controlled multi-user access and lightweight governance without public registration.

**Status:** Foundation complete in repository development.

Completed:
- **L2-ACCOUNTS01** — global `owner | member`, deterministic migration, first-Owner bootstrap, digest-only invitations, race-safe invite redemption, Owner administration, Member disable/enable, session revocation, strict drive isolation;
- **L2-ANNOUNCE01** — database/API-backed Owner-administered global homepage announcements with effective/expiry windows;
- **L2-PASSWORD01** — self-only authenticated password change with concurrency-safe CAS and atomic revoke-all sessions.

Later independent Layer 2 backlog:
- **L2-SHARE01 — One-Time External Sharing** — bounded no-login capability, revoke/expiry, short signed download, no public bucket exposure;
- optional additional session-management UX.

Explicitly not implied by the Pre-OCR program:
- public signup/email/SMTP/OAuth;
- arbitrary global role editing;
- account deletion;
- unrelated external-sharing expansion.

## Layer 3 — Personal Scholarly Workspace & Scholarly Model

**Status:** Owner-approved as part of the Pre-OCR Research Foundation program; detailed task decomposition is the next planning task.

This layer is what turns AcademicCloud from a general cloud drive into personal scholarly infrastructure.

### 3A. Personal Research Overlay

Approved capabilities:
- **Reading State** with primary state equivalent to `unread | queued | reading | finished`;
- **Reading Progress** such as `last_page` and `last_opened_at`;
- independent private flags such as **Important** and **To Cite**;
- **Personal Tags** distinct from future Library Tags;
- **Collections** as many-to-many research-semantic organization, distinct from Folder hierarchy;
- **Saved Research Views** as private dynamic queries/filters/sorts over accessible resources;
- private **“Why do I have this?” / acquisition-research note**;
- consistent integration of Favorites and Recent with the Personal Research Overlay.

Privacy invariant: the same shared resource may have different, mutually invisible overlays for different accounts. Owner/Admin authority does not implicitly expose them.

### 3B. Scholarly Records, Metadata, Provenance, and Relationships

Approved foundation:
- **Scholarly Record** as the logical academic object separate from a physical file;
- one record may attach multiple Artifacts and Artifact Versions without duplicating the logical record;
- **Canonical Scholarly Metadata** appropriate to material type;
- **Metadata Templates**, initially extensible across material classes such as:
  - Book;
  - Article;
  - Manuscript;
  - Inscription;
  - Archival Document;
  - later Map/Photograph/other types as justified;
- **Provenance / acquisition records** such as source URL, acquisition date/method, original filename/checksum, source/repository information, and explicit notes where appropriate;
- **Document Fingerprint / checksum identity** and safe duplicate detection;
- **artifact/version relationships** such as edition, scan, translation, transcription, and derived-artifact lineage;
- a **minimal Authority Records foundation** for normalized entities such as Person, Place, Language, Work, or Institution when required by the data model.

Boundary: this phase must not become a full RDF/semantic-web/knowledge-graph project. Mature authority control is non-blocking future work.

### 3C. Research Intake

Approved direction:

```text
discover / upload / save
        ↓
Research Inbox
        ↓
fingerprint / duplicate check
        ↓
metadata capture / suggestion boundary
        ↓
user triage
        ├─ attach to existing Scholarly Record
        ├─ create a new Scholarly Record
        ├─ archive as an ordinary file
        └─ discard
```

Capabilities:
- **Research Inbox** rather than forcing immediate permanent classification;
- safe fingerprint/duplicate handling constrained by accessible-resource visibility;
- metadata/provenance capture at acquisition time;
- a stable **Save-to-AcademicCloud intake API/boundary** suitable for future browser tooling.

A polished browser extension is future/non-blocking and must not hold up OCR readiness.

### 3D. Annotation, Citation, Evidence, and Research Questions

Approved capabilities:
- **sidecar/database Annotations** rather than silently rewriting original PDFs;
- highlights and page notes;
- **Citation Workspace**;
- stable **page-level Evidence** references;
- **Evidence Bundles** that group references without duplicating source artifacts;
- **Research Questions** and explicit resource/evidence/question relationships;
- **structured export foundations**, including machine-readable scholarly/citation output where appropriate.

Private annotations, citation work, evidence organization, and Research Questions remain Personal Research Overlay data unless a future explicit sharing action is approved.

## Layer 4 — Shared Academic Library

**Status:** Owner-approved as part of the Pre-OCR Research Foundation program, but must be implemented only after the prerequisite private scholarly/resource model is green.

A Library is a real ownership/domain boundary, not a specially named `/shared` folder.

Approved direction:
- Library-owned resources;
- membership and Library-scoped permissions;
- Library-scoped contributor roles, including Trusted Contributor where appropriate;
- contribution submission/review/approval/rejection;
- **Library Tags** distinct from Personal Tags;
- shared academic catalog and canonical records;
- canonical/original filename concepts;
- provenance and source-confidence metadata;
- duplicate/version grouping;
- shared scholarly metadata governance.

Critical invariant:

```text
Shared Scholarly Record
        +
User A Personal Research Overlay   (A only)
        +
User B Personal Research Overlay   (B only)
```

Library access never implicitly exposes another member's reading progress, private tags, Collections, annotations, citation work, Evidence Bundles, Research Questions, or private notes.

## Layer 5 — Research Infrastructure & Pre-OCR Hardening

**Status:** Owner-approved as the final pre-OCR foundation layer.

Approved foundations:
- **Integrity Monitor** for metadata/object identity and other safe consistency signals without automatic destructive repair;
- **metadata snapshot/recovery foundations** sufficient for logical-state recovery where justified;
- permission/ownership **matrix verification** across private resources, Personal Overlay, Library resources, governance, exports, and future derived data;
- structured export contracts;
- stable **Resource / Artifact / Artifact Version / Page** identity;
- explicit **Derived Artifact Lineage**;
- an isolated **OCR adapter boundary**;
- an **extracted-text storage contract** tied to source artifact/version/page/provenance;
- authorization contracts for future indexing/retrieval so derived access cannot exceed source access.

Pre-OCR completion means these models and boundaries are coherent, tested, and independently checkpointed. It does **not** mean every conceivable non-AI feature has been implemented.

## Layer 6 — Intelligence

**Status:** Future; NOT authorized by the current Pre-OCR continuous program.

Future sequence, each separately scoped:
- OCR / text extraction;
- full-text indexing/search;
- embeddings/retrieval;
- RAG;
- evidence/page citation in generated answers;
- source-grounded research assistance.

Heavy compute remains isolated from the small authoritative Core Drive/control-plane service. Intelligence must preserve resource and Personal Research Overlay authorization defined by ADR-014.

## Non-Blocking Future Backlog

The following ideas are preserved but are **not required to declare Pre-OCR readiness**:
- **Private Vault** / client-side encryption, with explicit tradeoffs for preview/OCR/search/RAG;
- **External Deposit Link** for bounded upload-only intake from non-members;
- polished Chrome/Edge **browser extension** after the intake API stabilizes;
- mature Authority Records / RDF / semantic-web integration;
- full Dropbox/Seafile-style **Time Machine / Rewind** rather than the lighter metadata recovery foundation;
- unrelated expansion of One-Time External Sharing.

These must not expand the Pre-OCR program indefinitely.

## Cross-Cutting Operations Track

Operations is not a product layer.

### OPS01A — Repository Operations Observability & Recovery Preparation

**Status:** Complete in repository development; production activation remains Owner-gated.

Delivered repository/local foundations include:
- zero-network default readiness audit plus explicit public/live read-only modes;
- backup identity/receipt/freshness verification;
- deterministic retention dry-run planning;
- isolated restore rehearsal with task-owned temporary state and memory storage;
- disk/RAM/swap/certificate/restart/log-growth readiness contracts;
- bounded systemd restart-policy template;
- inactive journald retention template;
- production artifact inclusion and compiled/runtime verification.

OPS01A does not authorize service/timer/journald installation, production SSH, destructive retention, production restore, certificate replacement, DNS/TLS/OSS/Nginx mutation, or deployment.

## Separate Production Track

The accepted production site remains a separately gated operational track. Repository feature completion never implies rollout.

Outstanding production changes, deployment of post-UX01 code, permanent-delete decisions, autostart/reboot policy, certificate lifecycle, backup scheduling/off-host delivery, and other live mutations require explicit Owner approval and the applicable runbook.

## Approved Pre-OCR Continuous Objective

The previous repository/local objective through OPS01A is complete.

The Owner has now approved a new **Pre-OCR Research Foundation** continuous program. The immediate executable step is the planning-only task `RF-PLAN01`, which must compile this roadmap into dependency-safe, independently reviewable Ready task cards and an explicit queue before product implementation continues.

After `RF-PLAN01` itself is green and checkpointed, the Agent may autonomously consume the task cards it materializes **only within the approved Pre-OCR boundaries above**, one green Epic at a time:

```text
RF-PLAN01 — decompose approved Pre-OCR program
        ↓
Core Research UX foundations
        ↓
Personal Research Overlay
        ↓
Scholarly Records / Metadata / Provenance / Relationships
        ↓
Research Intake
        ↓
Annotation / Citation / Evidence / Research Questions
        ↓
Shared Academic Library
        ↓
Pre-OCR Integrity / Identity / Derived-artifact hardening
        ↓
STOP BEFORE OCR
```

Large workstreams must be split into smaller cards before implementation when needed. The queue, not elapsed time, controls execution.

Still separately Owner-gated:
- production access/mutation/deployment;
- main merge;
- real credentials or paid infrastructure;
- destructive/irreversible real-data operations;
- OCR execution;
- embeddings/retrieval/RAG;
- any product boundary not captured by this roadmap and the resulting approved queue.
