# AcademicCloud Decision Log

Record only meaningful product, architecture, security, infrastructure, or workflow decisions.

## ADR-001 — Modular Architecture Is Mandatory

**Date:** 2026-08-11  
**Status:** Accepted / Owner-amended 2026-08-28

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

## ADR-029 — Provider-Backed Multipart Transfer and Browser-Native Range Resume

**Date:** 2026-08-19
**Status:** Accepted through RF-TRANSFER01 development checkpoint
**Full record:** `docs/decisions/ADR-029-provider-backed-multipart-transfer-and-browser-native-range-resume.md`

RF-TRANSFER01 makes provider-backed multipart transfer a durable provider-neutral
architecture. New uploads use a bounded 8 MiB/640-part contract with
server-authoritative migration-021 session state, CAS lifecycle transitions,
exact identity/MD5 checks, completed-part reuse, missing-part-only resume,
exact abandonment, and bounded stale cleanup. Browsers send short-lived signed
parts directly to object storage; the backend never buffers large file bytes.

Completion reconciles provider state and activates the logical file exactly
once, including lost completion responses and concurrent tabs. Legacy pending
uploads remain explicitly non-resumable. Authorized downloads keep stable size,
ETag, `Accept-Ranges: bytes`, and browser-native Range/206/If-Range behavior
without whole-file JavaScript Blob buffering. Account/Library authority and
private research-overlay boundaries are unchanged. A post-migration rollback
requires the paired pre-migration database backup; this ADR authorizes no
production contact or provider/infrastructure policy change.

## ADR-030 — Release-Local Tesseract Runtime

**Date:** 2026-08-19
**Status:** Accepted by Owner for the final combined release
**Full record:** `docs/decisions/ADR-030-release-local-tesseract-runtime.md`

The final artifact builds exact official Tesseract 5.5.3 source in controlled
Linux x86_64 CI and packages a bounded audited runtime with exact
`tessdata_fast` 4.1.0 `eng`, `chi_sim`, and `chi_tra`. Source, builder,
toolchain, dependency closure, binary/library/model hashes, licenses, extracted
runtime probes, and independent fresh-runner verification are mandatory.

AcademicCloud invokes the release-local engine with child-scoped library/model
paths. Production receives no package installation, host-library replacement,
global environment change, daemon, cloud OCR, runtime download, or unrelated
infrastructure authority.

## ADR-031 — Core Authority and Ephemeral Derived Compute

**Date:** 2026-08-21
**Status:** Accepted by Owner; development implementation complete, production cutover separately gated
**Full record:** `docs/decisions/ADR-031-core-derived-compute-boundary.md`

The first physical Core/Compute separation migrates only the existing heavy
front-matter PDF rendering/OCR and Metadata Suggestion recognition path.
SQLite-backed durable jobs, authorization, source identity, candidate
persistence/review, and canonical metadata CAS remain in Core. GitHub Actions is
the first adapter behind a provider-neutral contract and receives only opaque
job/attempt routing before claiming one short-lived exact source capability.

Compute runs one clean process/job at concurrency one, preserves the existing
bounded page-selection/OCR/extraction semantics, releases page/canvas/buffer
state sequentially, and returns strictly validated candidates only. Metadata
Suggestion becomes asynchronous with queued/processing/succeeded/failed state.
The Core release artifact no longer packages PDF.js, native canvas, Tesseract,
or OCR E2E for this path; the dedicated Compute workflow inherits ADR-030's
exact pinned runtime verification. Development migration 022 is not applied to
production, and all production secrets, environment, artifact, backup/migration,
deployment, and rollback work remains a separate Owner gate.

## ADR-032 — Intelligent Bibliographic Domain and Human Field Authority

**Date:** 2026-08-22
**Status:** Accepted by Owner through L1-INTELLIGENT-LIBRARY01
**Full record:** `docs/decisions/ADR-032-intelligent-bibliographic-domain-and-human-authority.md`

Layer 1 adopts one authoritative 19-value `materialClass` taxonomy, normalized
contributors with controlled conceptual roles plus evidence labels, and
separate current-carrier and historical-source edition structures. The older
migration-018 discriminator remains compatibility-only; migration 023 adds the
new profile, contributor, source-edition, field-authority, and query index
structures without rewriting old rows or migration-019/020 evidence.

AI supplies default metadata. A human edit establishes durable authority only
for the fields actually populated or changed; later AI evidence cannot silently
replace them. Returning a field to AI control is an explicit, field-scoped user
action. Automatic contributor Authority binding requires one unique exact
canonical-label or exact-alias person match in the same Library domain; fuzzy,
invented, and ambiguous binding is prohibited.

## ADR-033 — PP-OCRv6 Small plus Qwen3 for Ephemeral Bibliographic Compute

**Date:** 2026-08-22
**Status:** Accepted
**Full record:** `docs/decisions/ADR-033-paddleocr-qwen-ephemeral-bibliographic-compute.md`

The accepted Layer-1 production path is sequential PP-OCRv6 small document
reading, Qwen3-1.7B Q8_0 bibliographic reasoning, and deterministic strict
validation. Exact official runtime/model revisions and hashes are release-local
to a clean ephemeral Compute job; raw OCR text and rendered pages remain in
memory and are never logged, cached, returned as evidence, or persisted.

Core remains authoritative and applies only high-confidence warning-free
defaults to fields that are not human-authoritative. Direct Qwen3-VL-2B and
PaddleOCR-VL 1.6 remain future evidence candidates, not ordinary or automatic
Layer-1 production dependencies. Exact hosted run `32574319098` passed the real
PaddleOCR E2E, selected-path 3/3 visual cases, seven-case 7/7 reasoning gate,
both sub-6-GiB probes, privacy/shell safety, and zero-artifact requirement; the
bounded direct Qwen3-VL comparison did not complete and is excluded from
production.

## ADR-034 — Metadata-Aware Catalogue Query and Display Identity

**Date:** 2026-08-22
**Status:** Accepted
**Full record:** `docs/decisions/ADR-034-metadata-aware-catalogue-query-and-display-identity.md`

Library Search remains authorization-first and server-authoritative while
expanding across migration-023 material class, contributor, publication,
language, carrier-edition, historical-source-edition, series, and volume
facts. Title/contributor relevance stays stronger than low-value metadata;
query, normalized filters, and sort mode form one cursor identity; the existing
six normal Library sorts remain unchanged.

Modern and historical catalogue labels are non-persisted presentation
projections. Positively classified modern scholarship uses `author + title`;
positively classified historical/primary sources use `title + supported version`.
Unknown, other, and unprofiled records never borrow a person field to guess the
modern form. Carrier and source editions remain separate and unsupported
precision is omitted. The projection may become an authorized attachment
filename with only the safe original extension, but never changes the original
filename, `canonicalTitle`, or `objectKey`. The 2026-08-28 amendment adds only
this display/download projection rule; schema v28 separately admits exact v3
AI provenance for the work-versus-manifestation classification repair.

## ADR-035 — Deterministic CSL Citation Projection and Style Pinning

**Date:** 2026-08-22
**Status:** Accepted
**Full record:** `docs/decisions/ADR-035-deterministic-csl-citation-projection-and-style-pinning.md`

Authorized canonical bibliographic metadata is projected into a style-neutral
CSL-compatible item and rendered locally by exact-pinned `citeproc@2.4.63`.
The release owns four exact-hashed, source-attributed `production_subset`
definitions: Chicago Notes & Bibliography, 《历史研究》, 《文史哲》, and current
GB/T 7714—2025. No runtime style fetch, AI formatting, client-supplied
canonical facts, or citation-history persistence is permitted.

Page, page range, volume, fascicle, chapter, 卷, 叶面, line, item, document
number, archive call number, and labelled custom locators remain typed and are
rendered deterministically. Full note, supported subsequent note,
bibliography, normalized CSL item, completeness, and style provenance are
returned together. No schema, data, object, provider, or production change is
part of this decision.

## Owner execution decision — Final stabilization, full corpus, zero cost

**Date:** 2026-08-24
**Status:** Active Owner-authorized continuous execution program
**Task:** `tasks/doing/ACADEMICCLOUD-FINAL-STABILIZATION-FULL-CORPUS-ZERO-COST-PERFORMANCE.md`

The Owner reopened `INCIDENT-L1-AI-PRODUCTION01` and revoked the earlier
whole-product production acceptance and Internal Beta readiness until every
currently implemented critical path, all available Owner-supplied relevant
files, and all AI-eligible production Library resources pass the new final
contract. Existing upload/multipart optimization is part of this integrated
program; stale next-task pointers do not start a separate Epic.

Functional correctness, data authority/privacy/security, production stability,
and zero additional cost all outrank performance. The former hard 30-second AI
SLA is retired; measured structural improvement is required without inventing
an arbitrary latency threshold. Internal Beta, invitations, new product scope,
whole-document OCR/indexing, embeddings/RAG, paid services, new billable GitHub
usage, irreversible real-data risk, and forbidden artifact `9405764771` remain
outside authority.

## ADR-036 — Automatic AI Admission Queue and Provider-Backed Golden Gate

**Date:** 2026-08-23
**Status:** Accepted
**Full record:** `docs/decisions/ADR-036-ai-admission-queue-and-production-golden-gate.md`

Eligible Library admission creates one durable asynchronous bibliographic job
for the source generation without coupling upload/admission success to AI
success. Current-generation queued/running state outranks terminal history;
Core remains the canonical and human-authority gate. Foreground admission and
interactive retry work outrank separately authorized historical work.

Provider acceptance is an ambiguous external boundary, while Core's conditional
claim is the exactly-once effective-execution gate. The original GitHub adapter
recovers accepted dispatch receipts without duplicate provider execution. Under
ADR-037 this GitHub-specific receipt logic remains only in the disabled normal-
production fallback; Local Pull uses a lease and heartbeat while preserving the
same durable-generation and idempotent-result invariants.

## ADR-037 — Local Pull Worker as the Production Compute Control Plane

**Date:** 2026-08-24
**Status:** Accepted by Owner; local implementation/runtime qualification passed; immutable release and production cutover pending
**Full record:** `docs/decisions/ADR-037-local-pull-compute-control-plane.md`

The active final-stabilization program moves normal production bibliographic AI
from per-document GitHub-hosted Actions to an outbound-only Local Pull worker on
the Owner's existing Windows/WSL2 machine. Core remains the sole authority and
adds the smallest provider-neutral atomic claim, bounded lease, heartbeat,
expiry recovery, and attempt-bound callback protocol. Laptop absence leaves AI
queued/recoverable and cannot reduce non-AI Core availability.

The local executor uses one narrow revocable machine credential, immutable
exact releases under `D:\AcademicCloudCompute`, whole-job concurrency one,
measured CPU/RAM/VRAM limits, demand-driven model warming, and no persistent
production PDF/OCR/page cache. GitHub remains for source control,
CI/qualification, and separately authorized emergency fallback, but
`GITHUB_HOSTED_PRODUCTION_COMPUTE=false` for normal production and the final
corpus. Existing Core/Compute authority, exact PP-OCRv6-small → Qwen3-1.7B
semantics, human authority, source integrity, and zero-cost requirements remain
unchanged.

The 2026-08-24 implementation checkpoint passed WSL2-on-D, actual CUDA
execution, exact Paddle/Qwen CPU/GPU comparisons, the 7/7 bibliographic gate,
and focused atomic-claim/heartbeat/expiry/replacement/late-callback tests.
Development migration head is v26; production remains v25 and has not switched
providers.

The 2026-08-26 Owner code-review override did not alter ADR-037's architecture;
it added five pre-corpus implementation gates. Exact pushed checkpoint
`d1bddb6d7bd6e66d0ed52586c17dd51afd358d99` passes script-neutral native PDF
text (including real Russian/Mongolistic fixture coverage), exact-attempt source
authorization renewal, bounded/cancellable Local Pull network I/O, lazy warm
Paddle/Qwen reuse with failure invalidation and idle unload, and a structured
15-second systemd activation stability gate. Backend 374/374, Frontend 283/283,
Compute contracts 2/2, Compute 81/81 plus two expected Windows runtime skips,
all-workspace typecheck/build, migration-v26/compiled acceptance, shell syntax,
state JSON, and diff checks pass. Production remains v25; a new immutable
release, real warm-runtime benchmark, cutover, canaries, forced-loss recovery,
and corpus execution remain pending.
