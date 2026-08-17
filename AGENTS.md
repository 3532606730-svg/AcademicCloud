# AGENTS.md

## Project

**AcademicCloud** is long-term academic digital infrastructure.

**Current execution phase:** Core Drive repository closure, Accounts I, Global Homepage Announcements, Authenticated Password Change, OPS01A, RF-PLAN01, RF-AUDIT01, RF-OWNERSHIP01, RF-BULK01, RF-DOMAIN01, PROD-04A, L1-UX04, L2-ACCOUNTARCHIVE01, L2-ADMINPOLISH01, and RF-LIBRARY01 are complete and green. Exact OPS01A checkpoint `34a2eada158dcf08783dc9538d853f9361425e8a` is the accepted production generation at schema v8. Repository schema head is migration 014; the bounded objective continues with `RF-LIBRARY02`.

**Approved continuous objective:** the three polish cards and RF-LIBRARY01 are complete; execute only `RF-LIBRARY02`, then STOP. `RF-META01`, `RF-LIBRARY03`, `RF-LIBRARY04`, and every unrelated later Pre-OCR task remain parked. Repository HEAD remains newer than production HEAD. Any production SSH/deployment/migration/mutation, main merge, real credentials/cost, destructive real-data work, `PROD-03C2`, or OCR/RAG remains separately Owner-gated.

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
11. **Shared resource does not imply shared research activity.** ADR-014 governs future research data boundaries.
12. **AI authority never exceeds the requesting user's effective authority.** There is no AI super-admin research view.
13. **Verification must be proportionate, not performative.** Run the checks that materially cover changed risk, then stop when relevant evidence is green. Do not repeatedly rerun historical full acceptance, production artifact builds, backup/restore drills, benchmarks, or unrelated audits merely to increase ceremony. Escalate verification only when a concrete failure, migration/data-integrity risk, authorization/security change, production boundary, or other material evidence justifies it.
14. **Re-verify before changing a technical judgment.** Owner urgency or preference may change product priority, but it does not by itself invalidate an engineering/security/data-safety conclusion. Material reversals require a changed fact, constraint, or corrected reasoning that should be recorded when durable.

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

**Repository-development foundation complete.** Authentication, account isolation, folders, browser-direct upload/download, listing/move/rename, Favorites, recycle/restore, Preview, mobile/desktop UI, security/reliability, and deployment/recovery foundation are green. The approved `L1-UX04` first-use polish only improves same-folder duplicate-name feedback and persistent desktop sidebar behavior; it does not change storage identity/deduplication semantics.

### Layer 2 — Accounts & Governance

**Foundation complete.** Exact `owner | member`, invite-only registration, Owner administration, disable/enable/session revocation, Global Homepage Announcements, and Authenticated Password Change are green. The approved first-use polish adds non-destructive Member archival, Owner-only announcement deletion, and collapsed invitation history while preserving durable identity/history/security semantics. One-Time External Sharing remains a separate later Layer 2 capability unless explicitly queued.

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

These remain parked during the current accelerated first-use sharing objective unless explicitly named in the queue.

### Layer 4 — Shared Academic Library

The minimum Shared Library slice is now accelerated by Owner direction ahead of the parked metadata/overlay/export queue:
- `RF-LIBRARY01`: Library as a real ownership/domain boundary, minimal membership/manager-member authority, and authorized holdings list/preview/download;
- `RF-LIBRARY02`: explicit Member submission plus reviewer approve/reject/withdraw, with approval promoting the resource into Library ownership while preserving stable IDs/object bytes/contributor provenance.

Reviewer authority applies only to explicitly submitted resources. Global Owner does not gain arbitrary browse-all access to Member-private Drive or Personal Research Overlay state.

Still-later parked Layer 4 direction includes Trusted Contributor expansion where justified, Library Tags, shared catalog/canonical records/naming, provenance/source confidence, and duplicate/version grouping.

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

After implementation:
1. Run applicable real checks that cover the changed risk.
2. Repair task-caused failures.
3. Perform risk-appropriate review; do not repeat it without a concrete reason.
4. Update task card, `CURRENT_STATUS.md`, `TASK_BOARD.md`, and durable decisions when needed.
5. Review diff and create task-level Git checkpoint.
6. Continue only to the next task inside the approved continuous objective; otherwise stop.

When relevant checks are green and no material finding remains, record/commit instead of continuing to search for hypothetical issues.

## Documentation and Git

Project files, tests, task cards, ADRs, and Git history are persistent memory. Chat is temporary planning context.

- `ROADMAP.md` defines durable product sequencing/inventory.
- `TASK_BOARD.md` defines the executable queue.
- `tasks/ready/` stores approved future Epic specs.
- `tasks/doing/` stores the active Epic.
- `tasks/done/` stores completed Epic records.

Do not create parallel handoff/status/memory systems.
