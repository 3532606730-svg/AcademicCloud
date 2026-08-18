# AGENTS.md

## Project

**AcademicCloud** is long-term academic digital infrastructure.

**Current execution phase:** Core Drive and Accounts foundations, the canonical shared Library, first-use polish through L1-UX07, RF-META01, RF-METASUGGEST01, PROD-07A, PROD-07B, PROD-08R, RF-FRONTMATTEROCR01 development, and the narrow workflow proportionality reconciliation are complete and independently green. Development is at schema v20/history 001–020. Production remains exact repaired release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7`, previous release `bc5788633e0295744905b4ae2dcdfcc5d97635bf`, at schema v19/history 001–019; RF-FRONTMATTEROCR01 is not yet deployed. The current authorized sequence is RF-TRANSFER01 development, the exact combined Linux x64 / Node 24 artifact gate, and only then the bounded final production deployment and evidence reconciliation.

**Approved continuous objective:** on `codex/project-memory-reconcile-20260817`, preserve the closed PROD-08R truth; integrate and close exactly bounded local/offline `RF-FRONTMATTEROCR01`; reconcile one narrow workflow proportionality clarification; implement and close `RF-TRANSFER01` true multipart upload and standards-based resumable download; produce an independently verified immutable Linux x64 / Node 24 combined artifact; perform the Owner-authorized bounded final deployment only after every development/artifact gate is green; reconcile exact production/project truth; then STOP. No production contact is authorized during development. `RF-SEARCH01`, remaining Pre-OCR work, whole-document extraction, indexing/search, semantic retrieval, RAG, desktop/native sync, incident-database inspection, real permanent deletion/`PROD-03C2`, reboot/autostart, main merge, infrastructure-policy changes, credentials, paid infrastructure, unrelated OSS mutation, external catalogue/ISBN/web lookup, AI extraction, and unrelated cleanup remain parked or prohibited.

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
10. **Every Epic ends at an evidence-backed checkpoint.** Applicable tests, risk-appropriate review, task-state reconciliation, and Git checkpoint precede autonomous progression.
11. **Shared resource does not imply shared research activity.** ADR-014 governs private research-state boundaries; ADR-022 defines the canonical shared-corpus default.
12. **AI authority never exceeds the requesting user's effective authority.** There is no AI super-admin research view.
13. **Verification must be proportionate, not performative.** Run the checks that materially cover changed risk, then stop when relevant evidence is green. Do not repeatedly rerun historical full acceptance, production artifact builds, backup/restore drills, benchmarks, or unrelated audits merely to increase ceremony. Escalate verification only when a concrete failure, migration/data-integrity risk, authorization/security change, production boundary, or other material evidence justifies it.
14. **Re-verify before changing a technical judgment.** Owner urgency or preference may change product priority, but it does not by itself invalidate an engineering/security/data-safety conclusion. Material reversals require a changed fact, constraint, or corrected reasoning that should be recorded when durable.
15. **Durable decisions must be reconciled and synchronized.** Per ADR-023, accepted durable product/architecture/security/workflow/roadmap/task-boundary decisions must be written into the smallest complete authoritative repository set rather than left in chat. After authorized remote publication, synchronize the accessible active local checkout non-destructively and verify local HEAD equals the intended remote HEAD; never discard unknown local work to force equality, and never claim local synchronization without actual local evidence.

## Durable Data / Privacy Model

Follow `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md` and ADR-022.

### Physical Artifact
Stored bytes/file representation, object identity, checksum, media/lifecycle metadata. Visibility follows the owning resource/Library authorization.

### Scholarly Resource / Scholarly Record
Logical academic object and canonical scholarly facts. One Record may relate to several artifacts/versions/editions/scans/translations/derived artifacts. These are internal domain concepts, not primary navigation labels.

### Personal Research Overlay
Private per-account research state, including when implemented: Reading State/progress, Important/To Cite, Favorites/Recent, Personal Tags, Collections, Saved Research Views, private research/acquisition notes, annotations, citation/evidence organization, Evidence Bundles, Research Questions, and private search/history state.

**Owner/Admin has no implicit product/API read authority over another account's Personal Research Overlay.** Infrastructure operator access is a separate production-security matter, not a product permission.

### Collaborative / Library Plane
The canonical shared academic corpus, contribution review, Library Tags, shared catalog/canonical records, shared provenance, and future explicitly shared research objects. A Personal Overlay never crosses into this plane implicitly.

### Governance / Operations
Accounts, invitations, account status, permissions, announcements, quota/statistics, security audit, integrity/recovery evidence. Administrative audit must not become default research surveillance and appears to users only under Owner administration as `操作记录`.

### Derived Intelligence
OCR/extracted text/index/embeddings/retrieval/RAG-derived state. Authorization must inherit source-resource and applicable private-overlay authority.

Additional invariants:
- AcademicCloud presents one canonical `资料库`; approved academic resources are shared to active authorized members after Owner admission.
- For a normal Member, upload is contribution intake/review, not creation of a permanent private Drive corpus.
- Owner-originated uploads may be admitted directly because the Owner already holds admission authority.
- Shared resource does not expose another member's Personal Research Overlay.
- Folder = storage hierarchy; Collection = research-semantic organization.
- Personal Tags and Library Tags are distinct.
- canonical metadata and private interpretation/notes are distinct.
- original acquired artifacts remain preservable evidence; derived artifacts have explicit lineage.
- duplicate/fingerprint results must not reveal inaccessible resources.

## Product Layers

### Layer 1 — Core Drive / Resource Handling

**Foundation complete, including the L1-UX06 catalogue repair.** Authentication, folders, browser-direct upload/download, listing/move/rename, Favorites, recycle/restore, Preview, mobile/desktop UI, security/reliability, deployment/recovery foundation, canonical shared `资料库`, and the unified catalogue presentation/lifecycle are green. Repository execution is stopped for Owner review.

### Layer 2 — Accounts & Governance

**Foundation complete.** Exact `owner | member`, invite-only registration, Owner administration, disable/enable/archive/session revocation, Global Homepage Announcements, and Owner-assisted credential reset are green. ADR-024 retires the authenticated self-service password HTTP/UI path: the active Owner may issue a digest-only, 30-minute, one-time capability for an active or disabled Member, and the Member chooses the final password while session/auth-revision safety remains atomic. One-Time External Sharing remains a separate later Layer 2 capability unless explicitly queued.

### Layer 3 — Personal Scholarly Workspace & Scholarly Model

Owner-approved Pre-OCR direction includes:
- Personal Research Overlay (Reading State/progress/flags, Personal Tags, Collections, Saved Views, private research notes);
- Scholarly Records separate from physical Artifacts, while keeping those implementation entities out of primary navigation;
- metadata templates, canonical metadata, provenance/acquisition records;
- fingerprints/safe duplicate detection;
- artifact/version/edition/scan/translation/transcription relationships and derived lineage;
- minimal Authority Records foundation without turning the phase into a mature RDF system;
- Research Inbox/intake;
- sidecar annotations, citations, page-level evidence, Evidence Bundles, Research Questions, structured export foundations.

`RF-META01` is complete: canonical information is surfaced through normal `资料详情`, not a standalone `学术记录` browser. `RF-METASUGGEST01` is complete, and RF-FRONTMATTEROCR01 now adds only local/offline fallback for unusable pages inside the same exact first-15/last-5 window. Usable native text remains preferred; provenance-rich proposals remain reviewable and may never silently write canonical metadata. No raw OCR page text or rendered page image is persisted. `RF-SEARCH01` and the remaining Pre-OCR queue remain parked.

### Layer 4 — Shared Academic Library

`RF-LIBRARY01` and `RF-LIBRARY02` are complete and remain valid implementation substrate:
- `RF-LIBRARY01`: Library ownership/domain boundary, membership/manager authority, authorized holdings list/preview/download;
- `RF-LIBRARY02`: explicit submitted/approved/rejected/withdrawn contribution review with guarded ownership promotion preserving stable identities/object bytes/contributor provenance/private overlays.

ADR-022 supersedes their earlier optional-Shared-Library product framing. The ordinary product is one Owner-curated shared academic corpus. Completed `RF-SHAREDDEFAULT01` made that canonical Library the default authority/data flow and defined/tested the append-only transition path for existing account-owned corpus data.

Later parked Layer 4 direction includes Library Tags, shared catalog/canonical records/naming, provenance/source confidence, and duplicate/version grouping.

### Layer 5 — Research Infrastructure & Pre-OCR Hardening

Owner-approved final pre-OCR foundation remains parked:
- integrity monitoring;
- metadata snapshot/recovery foundations where justified;
- permission-matrix verification;
- structured-export contracts;
- stable Resource/Artifact/Version/Page identity;
- derived-artifact lineage;
- OCR adapter and extracted-text storage/authorization contracts only.

### Layer 6 — Intelligence

**Future / not authorized by the current program:** whole-document OCR/text extraction, full-text indexing/search, embeddings/retrieval, RAG, evidence-grounded assistance. The completed bounded local front-matter OCR fallback does not authorize any of those capabilities.

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

File bytes belong in object storage. Application/database state stores logical metadata and relationships. Moving, organizing, recursively recycling, sharing through Library ownership, or adding research overlays should primarily mutate metadata/relations rather than copy/delete object bytes unless a task explicitly requires a new artifact.

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

After implementation or an Owner-approved durable planning decision:
1. Run applicable real checks that cover the changed risk when code/configuration changed.
2. Repair task-caused failures.
3. Perform risk-appropriate review; do not repeat it without a concrete reason.
4. Reconcile the smallest complete authoritative repository set: task card, `CURRENT_STATUS.md`, `TASK_BOARD.md`, `ROADMAP.md`, ADR/`DECISION_LOG.md`, `AGENTS.md`, or workflow skill as appropriate to the decision.
5. Review diff and create a task/decision-level Git checkpoint.
6. Push only to the authorized non-main branch when publication is within scope.
7. If the active local checkout is accessible, synchronize it non-destructively to the intended remote branch and verify local HEAD == remote HEAD. If local access is unavailable, report synchronization as outstanding rather than guessing.
8. Continue only to the next task inside the approved continuous objective; otherwise stop.

When relevant checks are green and no material finding remains, record/commit instead of continuing to search for hypothetical issues.

## Documentation and Git

Project files, tests, task cards, ADRs, and Git history are persistent memory. Chat is temporary planning context.

- `ROADMAP.md` defines durable product sequencing/inventory.
- `CURRENT_STATUS.md` defines concise project-level truth.
- `TASK_BOARD.md` defines the executable queue.
- `tasks/ready/` stores approved future Epic specs.
- `tasks/doing/` stores the active Epic.
- `tasks/done/` stores completed Epic records.
- accepted durable workflow/product/architecture/security decisions must be reconciled into their authoritative files per ADR-023.
- after an authorized push, remote publication and local synchronization are separate states; verify the accessible local checkout instead of assuming it followed the remote.

Do not create parallel handoff/status/memory systems.
