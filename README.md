# AcademicCloud

AcademicCloud is long-term academic digital infrastructure.

Current product direction:

> **Reliable Drive → Accounts & Governance → Personal Scholarly Workspace → Shared Academic Library → Research Infrastructure → Source-grounded Intelligence**

The repository and Git are durable project memory. Chat is planning context only.

## Current Status

**Production:** the accepted UX01 generation remains live at `https://cloud.ajtlab.top`. Production is a separate Owner-gated track.

**Development:** Core Drive closure, Accounts I, Global Homepage Announcements, Authenticated Password Change, and repository/local OPS01A are independently green on the current development line. This newer repository generation is not deployed.

**Next:** the independently reviewed `RF-PLAN01` decomposition and `RF-AUDIT01` governance-audit foundation are complete. The Owner-authorized **Pre-OCR Research Foundation** continues with `RF-OWNERSHIP01` as the next Ready implementation card.

Read:
- `AGENTS.md` — mandatory repository policy and current product/privacy boundaries;
- `.agents/skills/academiccloud-workflow/SKILL.md` — autonomous engineering workflow;
- `ROADMAP.md` — durable product sequencing and complete approved Pre-OCR inventory;
- `CURRENT_STATUS.md` — concise current truth;
- `TASK_BOARD.md` — executable queue;
- `DECISION_LOG.md` — durable decisions;
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md` — research privacy/data model;
- `tasks/ready/`, `tasks/doing/`, `tasks/done/` — Epic state.

## Product Model

AcademicCloud distinguishes:

1. **Physical Artifact** — stored file/byte representation and checksum/lifecycle identity.
2. **Scholarly Resource / Scholarly Record** — the logical academic object and canonical scholarly metadata/provenance.
3. **Personal Research Overlay** — private per-account reading, organizing, annotation, citation, evidence, and research state.
4. **Collaborative Overlay** — explicitly shared Library/catalog/contribution state.
5. **Governance / Operations** — accounts, permissions, announcements, audit, quota, integrity/recovery evidence.
6. **Derived Intelligence** — OCR/index/retrieval/RAG state whose authority may never exceed source authorization.

Core privacy rule:

> **Shared resource does not imply shared research activity.**

Owner/Admin has no implicit product/API read authority over another user's private Reading State, progress, Personal Tags, Collections, annotations, citation/evidence work, Research Questions, or equivalent Personal Research Overlay state.

## Product Layers

### Layer 1 — Core Drive

Repository-development foundation complete: authentication, account isolation, folders, direct browser upload/download, Preview, move/rename, Favorites, transactional recycle/restore, responsive UI, security/reliability, and deployment/recovery foundation.

The approved Pre-OCR program may add bounded daily-use research UX: metadata/name Search, private Recent, Bulk Operations, governance Audit, and storage/quota statistics.

### Layer 2 — Accounts & Governance

Foundation complete:
- exact `owner | member`;
- first-Owner bootstrap;
- invite-only registration/invitation management;
- Owner Member administration;
- disable/enable with session revocation;
- Global Homepage Announcements;
- Authenticated Password Change.

One-Time External Sharing remains a separately scoped later Layer 2 capability.

### Layer 3 — Personal Scholarly Workspace & Scholarly Model

Owner-approved Pre-OCR direction includes:
- Reading State/progress and private Important/To Cite flags;
- Personal Tags;
- Collections distinct from Folders;
- Saved Research Views;
- private research/acquisition notes;
- Scholarly Records separate from physical Artifacts;
- Metadata Templates and canonical metadata;
- provenance/acquisition records;
- fingerprint/safe duplicate detection;
- edition/scan/translation/transcription/derived-artifact relationships;
- minimal Authority Records foundation;
- Research Inbox and Save-to-AcademicCloud intake boundary;
- sidecar annotations, highlights/page notes;
- Citation Workspace, page-level Evidence, Evidence Bundles, Research Questions;
- structured export foundations.

### Layer 4 — Shared Academic Library

Owner-approved after prerequisite private/resource models are green: real Library ownership boundary, membership/permissions, contributor roles/Trusted Contributor where appropriate, contribution review, Library Tags, shared catalog/canonical naming, provenance/source confidence, duplicate/version grouping.

A shared resource never implicitly exposes each member's Personal Research Overlay.

### Layer 5 — Research Infrastructure & Pre-OCR Hardening

Integrity monitoring, metadata recovery foundations, permission-matrix verification, structured-export contracts, stable Resource/Artifact/Version/Page identity, derived-artifact lineage, and the adapter/storage/authorization contracts required by future OCR.

### Layer 6 — Intelligence

Future and not authorized by the current program: OCR/text extraction execution, full-text indexing/search, embeddings/retrieval, RAG, evidence-grounded research assistance.

## Operations Track

Operations is cross-cutting. OPS01A repository/local preparation is complete: readiness auditing, backup receipt/freshness, retention dry-run, isolated restore rehearsal, restart/log-growth preparation, and production-artifact verification. No live activation is implied.

## Core Principles

- modularity and fault isolation;
- data safety before feature count;
- server-authoritative identity/authorization;
- storage portability;
- explicit lifecycle and lineage;
- independently reviewable Epic checkpoints;
- shared-resource/private-research separation;
- no research-surveillance-by-default;
- no silent architecture/product changes;
- repository-driven autonomous progression;
- production as a separate explicit gate;
- heavy intelligence isolated from authoritative Core Drive;
- AI authority ≤ requesting user's effective authority.

## Project Structure

```text
AcademicCloud/
├── backend/
├── frontend/
├── database/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── deployment/
│   ├── operations/
│   └── decisions/
├── tasks/
│   ├── ready/
│   ├── doing/
│   └── done/
├── workers/
├── plugins/
├── tests/
├── scripts/
└── deployment/
```

## Development Rule

Normal development follows:

```text
recover repository state
→ select approved Ready/Doing task
→ plan within task boundary
→ implement
→ verify
→ independent/adversarial review
→ repair
→ reconcile repository memory
→ Git checkpoint
→ next approved task if continuous objective allows
```

Completion is acceptance-driven, not clock-driven. Long Agent runs consume the repository queue; they do not invent work or depend on giant chat prompts.

## Local Development

Prerequisites: Node.js 24 and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

Frontend: `http://127.0.0.1:5173`  
Backend: `http://127.0.0.1:3000`

Initialize/upgrade local SQLite:

```powershell
npm.cmd run db:migrate
```

Repository checks:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:acceptance-tools
npm.cmd run acceptance:compiled
```

Use the actual scripts in `package.json` if they change.

## Security / Data Flow Summary

Authentication uses bounded Argon2id and SQLite-backed opaque sessions. Sessions are revocable and digest-only at rest.

Large file bytes use browser-direct object-storage paths. The backend authorizes/signs and maintains logical metadata; it must not become a large-byte proxy merely to add research features.

Original acquired artifacts should remain preservable evidence. Derived artifacts such as later OCR/transcription/translation/annotated exports must have explicit lineage rather than silently overwriting the source.

Production configuration, credentials, migrations, DNS/TLS/OSS, destructive real-data operations, deployment, main merge, OCR execution, and RAG remain separately gated according to the active task/objective.

## License

No public licensing or distribution decision has been made.
