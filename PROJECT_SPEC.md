# AcademicCloud Project Specification

**Version:** 2.1  
**Status:** Approved product baseline  
**Last reconciled:** 2026-08-18

## 1. Purpose

AcademicCloud is long-term academic digital infrastructure for a small invitation-only academic community.

Near-term purpose: provide a reliable, self-controlled academic corpus where approved resources are shared across authorized members while each member's research activity remains private.

Long-term purpose: evolve from reliable resource storage and governance into a structured scholarly workspace and finally a source-grounded AI research assistant.

The product must evolve in explicit layers. Original academic files remain authoritative and must never depend on later AI features for availability or integrity.

Durable product rule:

> **Owner-curated shared academic corpus + private per-user research activity.**

The ordinary product is not a private Drive plus a separate optional Shared Library.

## 2. Product Architecture by Layer

### Layer 1 — Core Resource Handling

Goal:

> Reliable, secure, maintainable academic resource storage and lifecycle handling.

Implemented foundation includes:
- authentication and server-side authorization;
- logical folder hierarchy;
- direct browser upload to object storage;
- signed/direct download;
- list/browse;
- rename/move;
- recycle/restore;
- conservative permanent-file deletion safeguards;
- revision/CAS protection for lifecycle mutations;
- safe inline preview;
- Favorites;
- bilingual desktop interface;
- drag/drop upload and upload queue/retry behavior;
- dedicated mobile presentation and fullscreen mobile Preview;
- zero-descriptive-copy UI cleanup;
- security/reliability hardening;
- deployment, backup, and recovery foundation.

`L1-UX03` is a completed baseline. Later UI work must preserve the accepted mobile/Preview/accessibility/copy behavior rather than reopen it as pending work.

### Layer 2 — Accounts & Governance

Goal:

> Operate a controlled known-member academic service without public registration or unnecessary identity infrastructure.

Completed foundation:
- global roles `owner | member`;
- deterministic legacy account migration;
- first-Owner bootstrap;
- invite-only registration;
- digest-only invitation capabilities;
- invitation listing/revocation for Owner;
- Owner Member administration;
- Member enable/disable/archive lifecycle;
- session revocation on account-state changes;
- Global Homepage Announcements;
- bounded governance/security audit without private research surveillance;
- historical authenticated self-service password-change implementation.

Current product correction:
- ADR-022 supersedes self-service password change as a desired user-facing feature;
- `L2-CREDENTIALRESET01` replaces it with an Owner-authorized, short-lived, single-use reset capability;
- only capability digest/state is persisted;
- the Member chooses the final password, so the Owner does not learn it;
- successful reset invalidates prior sessions;
- no email, SMTP, SMS, OAuth, public recovery, security-question, or support-ticket infrastructure is introduced.

Later separately scoped work may include One-Time External Sharing if explicitly reopened.

### Layer 3 — Personal Scholarly Workspace and Scholarly Model

Goal:

> Turn shared academic resources into private per-user scholarly workspaces without conflating shared holdings with shared research behavior.

Implemented foundation:
- stable Scholarly Record identity;
- Physical Artifact identity;
- Artifact Version identity;
- explicit separation between uploader/contributor provenance and ownership domain.

Owner-approved remaining Pre-OCR capabilities include:
- canonical metadata and templates;
- minimal authority foundations;
- provenance/acquisition records and fingerprints;
- edition/scan/translation/transcription/derived-artifact relationships;
- private Reading State/progress;
- Important / To Cite;
- Recent;
- Personal Tags;
- Collections distinct from Folders;
- Saved Research Views;
- private acquisition/research notes;
- Research Inbox/intake boundary;
- sidecar annotations, highlights, and page notes;
- Citation Workspace;
- page-level Evidence and Evidence Bundles;
- Research Questions;
- structured export foundations.

`Scholarly Record`, `Artifact`, and `Artifact Version` are internal domain concepts. They should not become primary navigation labels merely because they exist in the backend. User-facing scholarly identity should surface naturally through `资料` / `资料详情`.

### Layer 4 — Shared Academic Library

Goal:

> Maintain one governed canonical academic corpus while preserving private per-user research overlays.

Completed core primitives:
- explicit `account | library` ownership domains (`RF-OWNERSHIP01`);
- Library membership/authorization/holdings (`RF-LIBRARY01`);
- guarded contribution lifecycle `submitted | approved | rejected | withdrawn` and transactional ownership promotion (`RF-LIBRARY02`).

Current durable semantics from ADR-022:

```text
Member upload
  → 待审核
  → Owner review
      → approve → shared 资料库
      → reject  → not admitted
```

Owner-originated uploads may be admitted directly because the Owner already holds admission authority.

Approved resources are visible to all active authorized members for normal browse/preview/download. Contributor/uploader remains provenance, not continuing exclusive ownership of the admitted resource.

Pending submissions are intake/review state, not a permanent private Drive product.

Ordinary Members do not gain shared folder hierarchy, destructive corpus lifecycle, or canonical metadata governance authority merely because they may contribute.

Approval/promotion should preserve stable IDs, OSS object keys/bytes, checksums, uploader provenance, lineage, Favorites, and private Personal Research Overlay state rather than copy bytes or recreate scholarly identity.

Core privacy invariant:

> **Shared resource does not imply shared research activity.**

Owner/Admin authority does not implicitly reveal another user's private Reading State, progress, Personal Tags, Collections, Saved Views, notes, annotations, citations, evidence, Research Questions, or equivalent Personal Research Overlay state.

Later Layer 4 work may add Library Tags, shared catalog/canonical naming, provenance/source confidence, and duplicate/version grouping after the current correction and Owner review.

### Layer 5 — Research Infrastructure and Pre-OCR Hardening

Goal:

> Represent academic materials as durable research assets rather than isolated files.

Approved Pre-OCR foundations include:
- provenance/source records;
- document relationships;
- version/scan/edition/translation lineage;
- citations and page references;
- research-question links;
- structured export;
- integrity monitoring and bounded metadata recovery foundations;
- complete permission/ownership matrix verification;
- stable Resource/Artifact/Version/Page identity;
- derived-artifact authorization contracts;
- OCR adapter, extracted-text storage, and future index/retrieval authorization contracts only, with execution disabled until separately authorized.

### Layer 6 — Intelligence

Goal:

> Add source-grounded machine assistance without becoming authoritative over originals.

Future capabilities not authorized by the current program:
- OCR and text extraction execution;
- full-text indexing/search;
- embeddings and retrieval;
- RAG;
- evidence/page citation and source-grounded research assistance.

Compute-heavy OCR/embedding/RAG jobs should be isolated from the small core application host rather than turning the authoritative drive service into a compute worker.

## 3. Cross-Cutting Operations Track

Operations is not a product layer.

The repository contains deployment, backup/restore, systemd, Nginx, log rotation, health/readiness, migration verification, immutable artifact, and production runbooks.

Completed repository/local OPS01A preparation includes:
- lightweight operations/readiness checks;
- backup verification/freshness checks;
- disk/memory/swap checks;
- certificate-expiry checks;
- isolated restore-drill tooling;
- retention planning/dry-run;
- systemd service/timer templates;
- restart-policy review;
- exact production artifact verification.

Repository completion does not authorize production mutation. Production deployment, SSH, live migration/backfill, OSS mutation, DNS/TLS/Nginx/systemd changes, credentials, destructive real-data operations, or main merge remain explicit Owner gates.

## 4. Current Infrastructure Constraints

Current control-plane host:
- Alibaba Cloud Simple Application Server;
- 2 vCPU;
- 1 GiB-class RAM (`916,044 KiB` accepted Linux `MemTotal` measurement);
- 1 GiB swap;
- 20 GB system disk;
- Ubuntu 24.04;
- Malaysia region.

Current service resource policy retains the 320/384 MiB cgroup limits and a 128 MiB whole-host headroom gate unless superseded by a later accepted production decision.

Implications:
- file bytes live in object storage, not the 20 GB system disk;
- backend remains a control/authorization/metadata plane, not a large-file proxy;
- avoid unnecessary resident services;
- SQLite remains appropriate for current low-concurrency/private-community scale;
- accounts, invitations, scholarly metadata, and shared-Library metadata fit this host class;
- OCR/embedding/local-model work should move to isolated workers/services when introduced.

Expected near-term academic material volume remains under approximately 100 GB, with object storage carrying file bytes.

## 5. Storage Direction

Current provider: private Alibaba Cloud OSS behind `StorageAdapter`.

Application logic must remain provider-neutral:

```text
Application Resource Logic
        ↓
Storage Interface
        ↓
Storage Adapter
        ↓
Provider
```

Future providers may include S3-compatible object storage, R2, NAS, or another approved backend.

Large upload/download bytes should not be proxied through Fastify merely to add product features.

## 6. Data Model Principles

Logical scholarly resources and physical object-storage objects are distinct.

A logical resource should retain authoritative metadata such as:
- owning domain (`account | library` where applicable);
- uploader/contributor provenance;
- logical folder/collection placement where compatible with authority;
- display/original filename;
- object reference;
- checksum;
- media type;
- size;
- lifecycle state;
- timestamps;
- stable scholarly/artifact/version identity where implemented.

Moving/promoting logical resources should generally mutate metadata and ownership authority rather than copy object bytes.

Deletion is recoverable before permanent purge. Recursive folder recycle must preserve independently pre-deleted descendants instead of resurrecting them during parent restore.

Favorites and later Personal Research Overlay relations are per-user state, never global properties of a shared resource.

Approved Library resources must not become orphaned merely because a contributor account is later disabled or archived.

## 7. Authentication and Account Principles

Current authentication baseline:
- Argon2id password hashing (`m=65536`, `t=3`, `p=1`);
- bounded KDF concurrency;
- 32-byte opaque session secrets;
- only SHA-256 session digests persisted;
- seven-day absolute sessions;
- exact-origin unsafe-request protection;
- production `__Host-ac_session` Strict/Secure/HttpOnly cookie.

Global account roles remain deliberately small:
- `owner`;
- `member`.

Library/corpus governance authority is distinct from global authentication identity.

No public signup is planned. New normal users enter through Owner-issued invitations.

Password recovery follows the small known-member operating model after `L2-CREDENTIALRESET01`: contact Owner, receive one-time reset capability, choose new password privately, revoke prior sessions.

## 8. Reliability Principles

AcademicCloud must account for:
- incomplete uploads;
- database/object-storage inconsistency;
- interrupted connections;
- invalid/stale metadata;
- failed deletes;
- concurrent lifecycle mutations;
- unauthorized/guessed-resource access;
- server restart/redeployment;
- migration mismatch;
- backup/restore integrity;
- account/session revocation;
- invitation/reset capability redemption races;
- contribution approval/reject/withdraw races;
- ownership promotion and shared/private authorization boundaries.

State transitions should be explicit and transactionally safe where multiple rows must change together.

Fail closed rather than silently relocating, promoting, resurrecting, overwriting, disclosing, or guessing data/security state.

## 9. Security Baseline

- server-side authorization;
- server-derived account identity;
- secret isolation;
- input validation;
- protected object access;
- no permanent privileged cloud credentials in frontend code;
- short-lived scoped browser storage authorization;
- HTTPS in production;
- secret-safe audit/error logging;
- recoverable deletion by default;
- development/production separation;
- capability tokens stored digest-only when practical;
- raw invitation/session/reset/password material never logged or persisted to browser storage;
- Owner governance authority never implies private-research surveillance;
- derived/AI authority may never exceed the requesting user's effective source authority.

## 10. Development Strategy

AcademicCloud is repository-driven:

```text
Repository policy + durable decisions
↓
TASK_BOARD approved queue
↓
Ready task specification
↓
Doing task
↓
implementation
↓
focused tests
↓
independent/adversarial review where risk warrants
↓
repair concrete findings
↓
durable-state reconciliation
↓
Git checkpoint + push
↓
local synchronization / verification
↓
next approved task if the continuous objective allows
```

Repository files and Git are the source of truth; chat history is planning context only.

The Owner may authorize a continuous objective across multiple Epics. That authorization permits autonomous progression only through tasks explicitly listed in the approved queue, with each Epic independently bounded, verified, reconciled, and checkpointed.

Durable product/architecture/workflow decisions accepted in chat must be written into the appropriate repository memory (`ROADMAP`, `CURRENT_STATUS`, `TASK_BOARD`, ADR/decision log, task cards, `AGENTS.md`, or equivalent) rather than remaining chat-only. After push, an execution agent with local repository access must synchronize the local checkout safely and verify local/remote convergence according to ADR-023. Unknown local work must never be destroyed merely to force synchronization.

## 11. Current Production State

Production runs exact release:

`25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`

at schema v15 / migrations 1–15.

The deployed release contains the independently green first-use polish, ownership/scholarly identity foundations, RF-LIBRARY01, and RF-LIBRARY02 product/runtime generation. Live production Library/membership/contribution tables remain intentionally empty; deployment did not silently migrate real account-owned corpus data into shared ownership.

Production remains closed during the current repository correction. Any later transition of existing live account-owned holdings into the canonical shared Library requires a separate Owner-gated production deployment/migration after repository implementation and review are green.

## 12. Current Approved Continuous Objective

The current Owner-approved repository-only correction queue is:

```text
RF-SHAREDDEFAULT01
        ↓
L2-CREDENTIALRESET01
        ↓
L1-UX05
        ↓
STOP for Owner review
```

### RF-SHAREDDEFAULT01
Make the single canonical Library the default corpus authority. Member upload automatically enters pending review; Owner approval admits the resource to the shared corpus; Owner upload may be admitted directly. Preserve stable IDs, OSS bytes/object keys, checksums, provenance, lineage, Favorites, and Personal Research Overlay state. Define/test the append-only transition path for existing account-owned corpus resources, but do not deploy it to production in this task.

### L2-CREDENTIALRESET01
Remove the authenticated self-service password-change product path and replace it with Owner-authorized, digest-only, short-lived, single-use reset capability plus Member-chosen final password and old-session invalidation. No email/SMS/OAuth recovery infrastructure.

### L1-UX05
Correct information architecture and visual hierarchy around the shared-corpus model:
- remove duplicate top-level `共享资料库`;
- remove standalone `学术记录`;
- remove `管理账户`, `管理公告`, `治理审计`, and `修改密码` from global navigation;
- expose Owner `管理后台` with `成员管理 / 投稿审核 / 公告 / 操作记录`;
- make `上传资料` the single strong Library-page CTA and demote secondary actions;
- fix the reproducible stale-state folder recycle/delete failure without weakening revision/CAS protection;
- preserve the completed `L1-UX03` mobile/fullscreen Preview/zero-descriptive-copy baseline rather than reimplementing it.

After `L1-UX05`, STOP for Owner first-use review. Do not automatically resume `RF-META01` or later Pre-OCR work.

Not authorized by this continuous objective:
- production deployment/migration/SSH/config mutation;
- main merge;
- real credentials, paid infrastructure, or destructive real-data operations;
- direct cleanup/permanent deletion of visible test residue;
- `PROD-03C2`;
- One-Time External Sharing;
- OCR/text-extraction execution, full-text indexing, embeddings, retrieval, RAG, or unrelated parked Pre-OCR work.

## 13. Parked Pre-OCR Sequence

After the current correction reaches STOP and the Owner explicitly reopens research development, the preserved sequence is:

```text
RF-META01
→ RF-PROV01
→ RF-LINEAGE01
→ RF-STATS01
→ RF-OVERLAY01
→ RF-ORGANIZE01
→ RF-SEARCH01
→ RF-VIEWS01
→ RF-INTAKE01
→ RF-ANNOTATE01
→ RF-CITE01
→ RF-EVIDENCE01
→ RF-EXPORT01
→ RF-LIBRARY03
→ RF-LIBRARY04
→ RF-INTEGRITY01
→ RF-RECOVERY01
→ RF-AUTHMATRIX01
→ RF-DERIVED01
→ STOP BEFORE OCR
```

`RF-LIBRARY01` and `RF-LIBRARY02` are already complete and are not repeated.

## 14. Long-Term Design Intent

```text
Reliable Core Resource Handling
        ↓
Controlled Accounts & Governance
        ↓
Owner-curated Shared Academic Corpus
        +
Private Personal Scholarly Workspace
        ↓
Research Infrastructure
        ↓
Source-Grounded Intelligence
```

Future flexibility is a design constraint. Future complexity is not a reason to weaken the authoritative core or pull unapproved work forward.
