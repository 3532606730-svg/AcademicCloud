# AGENTS.md

## Project

**AcademicCloud** is long-term academic digital infrastructure.

**Current execution phase:** Core Drive repository closure, Accounts I, Global Homepage Announcements, Authenticated Password Change, OPS01A, and the independently reviewed RF-PLAN01 execution decomposition are complete while the accepted UX01 production release remains live. The Owner-authorized repository-local **Pre-OCR Research Foundation** queue is recorded in `docs/architecture/pre-ocr-execution-plan.md` and `TASK_BOARD.md`; `RF-AUDIT01` is the next Ready Epic.

**Approved continuous objective (repository/local only):** RF-PLAN01 is complete; consume its dependency-safe Pre-OCR task queue one independently verified/checkpointed Epic at a time, beginning with `RF-AUDIT01`; stop after terminal `RF-DERIVED01` and before OCR/text-extraction execution, full-text indexing, embeddings, retrieval, or RAG. Production deployment/migration/mutation, main merge, real credentials/cost, and destructive real-data work remain separately Owner-gated.

## Engineering Workflow

Ordinary AcademicCloud engineering follows `.agents/skills/academiccloud-workflow/SKILL.md`. The repository is durable project memory. Product and architecture facts come from current code, Git, task cards, current-state documents, and accepted ADRs—not from chat memory.

## Highest-Priority Rules

1. **Modularity first.** Core modules have clear boundaries/interfaces; optional research/intelligence modules must not become hard dependencies of the core file system.
2. **Fault isolation is mandatory.** Failure/replacement in one module must not unnecessarily break unrelated modules.
3. **Do not expand beyond the approved objective.** Record later ideas rather than implementing them.
4. **Do not change architecture silently.** Durable product/architecture/security changes require an ADR with migration/rollback consequences where relevant.
5. **Prefer simple, maintainable solutions.** The current 1 GiB-class control-plane host is intentionally small; do not add unnecessary resident services.
6. **Data safety outranks feature count.** Never silently overwrite, destroy, resurrect, misattribute, or expose academic data.
7. **External services stay abstracted.** File bytes remain behind storage adapters; compute-heavy OCR/RAG/AI stays isolated from Core Drive.
8. **Server authority is mandatory.** Never trust client-provided owner, role, membership, privacy, or authorization claims.
9. **Production is a separate gate.** Repository implementation never authorizes SSH, live migration, DNS/TLS/OSS mutation, deployment, destructive production tests, or main merge.
10. **Every Epic ends at an evidence-backed checkpoint.** Tests, adversarial review, task-state reconciliation, and Git checkpoint precede autonomous progression.
11. **Shared resource does not imply shared research activity.** ADR-014 governs future research data boundaries.
12. **AI authority never exceeds the requesting user's effective authority.** There is no AI super-admin research view.

## Durable Data / Privacy Model

Follow `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`.

### Physical Artifact
Stored bytes/file representation, object identity, checksum, media/lifecycle metadata. Visibility follows the owning resource/Library authorization.

### Scholarly Resource / Scholarly Record
Logical academic object and canonical scholarly facts. One Record may relate to several artifacts/versions/editions/scans/translations/derived artifacts.

### Personal Research Overlay
Private per-account research state, including when implemented: Reading State/progress, Important/To Cite, Favorites/Recent, Personal Tags, Collections, Saved Research Views, private research/acquisition notes, annotations, citation/evidence organization, Evidence Bundles, Research Questions, and private search/history state.

**Owner/Admin has no implicit product/API read authority over another account's Personal Research Overlay.** Infrastructure operator access is a separate production-security matter, not a product permission.

### Collaborative Overlay
Explicit Library/shared state such as Library Tags, contribution review, shared catalog/canonical records, shared provenance, or future explicitly shared research objects. A Personal Overlay never crosses into this plane implicitly.

### Governance / Operations
Accounts, invitations, account status, permissions, announcements, quota/statistics, security audit, integrity/recovery evidence. Administrative audit must not become default research surveillance.

### Derived Intelligence
OCR/extracted text/index/embeddings/retrieval/RAG-derived state. Authorization must inherit source-resource and applicable private-overlay authority.

Additional invariants:
- Folder = storage hierarchy; Collection = research-semantic organization.
- Personal Tags and Library Tags are distinct.
- canonical metadata and private interpretation/notes are distinct.
- original acquired artifacts remain preservable evidence; derived artifacts have explicit lineage.
- duplicate/fingerprint results must not reveal inaccessible resources across accounts.

## Product Layers

### Layer 1 — Core Drive

**Repository-development foundation complete.** Authentication, account isolation, folders, browser-direct upload/download, listing/move/rename, Favorites, recycle/restore, Preview, mobile/desktop UI, security/reliability, and deployment/recovery foundation are green. Pre-OCR work may add bounded Core Research UX such as metadata/name Search, private Recent, Bulk Operations, governance Audit, and storage/quota statistics.

### Layer 2 — Accounts & Governance

**Foundation complete.** Exact `owner | member`, invite-only registration, Owner administration, disable/enable/session revocation, Global Homepage Announcements, and Authenticated Password Change are green. One-Time External Sharing remains a separate later Layer 2 capability unless explicitly queued.

### Layer 3 — Personal Scholarly Workspace & Scholarly Model

Owner-approved Pre-OCR direction includes:
- Personal Research Overlay (Reading State/progress/flags, Personal Tags, Collections, Saved Views, private research notes);
- Scholarly Records separate from physical Artifacts;
- metadata templates, canonical metadata, provenance/acquisition records;
- fingerprints/safe duplicate detection;
- artifact/version/edition/scan/translation/transcription relationships and derived lineage;
- minimal Authority Records foundation without turning the phase into a mature RDF system;
- Research Inbox/intake;
- sidecar annotations, citations, page-level evidence, Evidence Bundles, Research Questions, structured export foundations.

### Layer 4 — Shared Academic Library

Owner-approved within the Pre-OCR program after prerequisite private/resource models are green:
- Library as real ownership/domain boundary;
- membership/permissions;
- Library-scoped contributor roles/Trusted Contributor where appropriate;
- contribution review;
- Library Tags;
- shared catalog/canonical records/naming;
- provenance/source confidence;
- duplicate/version grouping.

Shared Library resources never implicitly expose members' Personal Research Overlays.

### Layer 5 — Research Infrastructure & Pre-OCR Hardening

Owner-approved final pre-OCR foundation:
- integrity monitoring;
- metadata snapshot/recovery foundations where justified;
- permission-matrix verification;
- structured-export contracts;
- stable Resource/Artifact/Version/Page identity;
- derived-artifact lineage;
- OCR adapter and extracted-text storage/authorization contracts only.

### Layer 6 — Intelligence

**Future / not authorized by the current program:** OCR/text extraction execution, full-text indexing/search, embeddings/retrieval, RAG, evidence-grounded assistance.

### Operations Track

Operations is cross-cutting. OPS01A repository/local preparation is complete. Any live activation, scheduling, restore, pruning, certificate action, or production mutation remains separately Owner-gated.

## Architecture Principles

Business code must not directly depend on Alibaba Cloud OSS APIs.

```text
File Service
    ↓
Storage Interface
    ↓
Storage Adapter
    ↓
Provider
```

File bytes belong in object storage. Application/database state stores logical metadata and relationships. Moving, organizing, recursively recycling, or adding research overlays should primarily mutate metadata/relations rather than copy/delete object bytes unless a task explicitly requires a new artifact.

Do not use user-facing filenames as trusted physical storage keys.

## Security Rules

- Never commit secrets.
- Use environment variables/approved secret management; `.env.example`, never real secrets.
- Validate all input and verify authorization server-side for every protected operation.
- Never trust client-provided `owner_id`, account role, Library role, privacy scope, or creator identity.
- Never expose permanent privileged OSS credentials to the browser; prefer short-lived scoped authorization.
- Prevent path traversal/unsafe filename handling.
- Use established auth/crypto libraries; avoid custom cryptography.
- Log security failures without credentials, raw capabilities, signed URLs, password material, session secrets, or private research content.
- Destructive operations default to recoverable soft deletion.
- Do not use real production academic data for development tests.
- Cross-account tests must verify non-disclosure as well as write isolation.

## Working Method

Before changing code:
1. Follow `.agents/skills/academiccloud-workflow/SKILL.md`.
2. Recover active/next approved task from repository state.
3. Inspect relevant code/tests/task acceptance/ADRs.
4. Preserve unrelated work and bounded blast radius.

After implementation:
1. Run applicable real checks.
2. Repair task-caused failures.
3. Perform risk-appropriate adversarial review.
4. Update task card, `CURRENT_STATUS.md`, `TASK_BOARD.md`, and durable decisions when needed.
5. Review diff and create task-level Git checkpoint.
6. Continue only to the next task inside the approved continuous objective; otherwise stop.

## Documentation and Git

Project files, tests, task cards, ADRs, and Git history are persistent memory. Chat is temporary planning context.

- `ROADMAP.md` defines durable product sequencing/inventory.
- `TASK_BOARD.md` defines the executable queue.
- `tasks/ready/` stores approved future Epic specs.
- `tasks/doing/` stores the active Epic.
- `tasks/done/` stores completed Epic records.

Do not create parallel handoff/status/memory systems.
