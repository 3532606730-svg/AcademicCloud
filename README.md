# AcademicCloud

AcademicCloud is long-term academic digital infrastructure for a small invitation-only academic community.

Current durable product model:

> **Owner-curated shared academic corpus + private per-user research activity**

Long-term direction:

> **Reliable Core → Accounts & Governance → Shared Academic Corpus + Personal Scholarly Workspace → Research Infrastructure → Source-grounded Intelligence**

The repository and Git are durable project memory. Chat is planning context only.

## Current Status

**Production:** exact release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e` runs at `https://cloud.ajtlab.top`, schema v15 / migrations 1–15. Its product/runtime baseline is `ec6a79aedb201bd6164a7c68f859c1aa492c218a`; the exact release adds verification-only schema-head repairs and no runtime, migration, dependency, or infrastructure delta. Production remains a separate Owner-gated track.

**Development baseline:** Core Drive, Accounts I, announcements, repository/local OPS01A, RF-PLAN01, RF-AUDIT01, RF-OWNERSHIP01, RF-BULK01, RF-DOMAIN01, L1-UX03/L1-UX04 first-use polish, RF-LIBRARY01, RF-LIBRARY02, RF-SHAREDDEFAULT01, and L2-CREDENTIALRESET01 are independently green. Schema head is append-only migration 017; production remains separately at v15.

**Current approved repository objective:**

```text
RF-SHAREDDEFAULT01
→ L2-CREDENTIALRESET01
→ L1-UX05
→ STOP for Owner review
```

Production is closed during this correction queue. The remaining Pre-OCR research queue, `PROD-03C2`, OCR/text extraction, indexing, embeddings, retrieval, and RAG remain parked.

Read first:
- `AGENTS.md` — mandatory repository policy, Owner gates, and product/privacy boundaries;
- `.agents/skills/academiccloud-workflow/SKILL.md` — autonomous engineering workflow;
- `CURRENT_STATUS.md` — concise current truth;
- `TASK_BOARD.md` — executable approved queue;
- `ROADMAP.md` — durable product sequencing and parked Pre-OCR inventory;
- `DECISION_LOG.md` and `docs/decisions/` — accepted durable decisions, especially ADR-014, ADR-022, and ADR-023;
- `tasks/ready/`, `tasks/doing/`, `tasks/done/` — bounded Epic state and evidence.

## Product Model

AcademicCloud distinguishes:

1. **Physical Artifact** — stored file/byte representation and lifecycle identity.
2. **Scholarly Resource / Scholarly Record** — logical academic identity and shared canonical scholarly facts.
3. **Personal Research Overlay** — private per-account reading, organization, annotation, citation, evidence, and research state.
4. **Shared Library / Collaborative Plane** — admitted corpus, contribution/review, shared catalog, and corpus governance.
5. **Governance / Operations** — accounts, invitations, permissions, announcements, security audit, integrity/recovery evidence.
6. **Derived Intelligence** — future OCR/index/retrieval/RAG state whose authority may never exceed source authorization.

Core privacy rule:

> **Shared resource does not imply shared research activity.**

Owner/Admin has no implicit product/API read authority over another user's private reading state, progress, Personal Tags, Collections, notes, annotations, citation/evidence work, Research Questions, or equivalent Personal Research Overlay state.

### Canonical corpus behavior

The ordinary product is not a private Drive plus a separate optional Shared Library. There is one canonical `资料库` of Owner-approved academic resources.

For a normal Member:

```text
upload
→ 待审核
→ Owner review
    → approve → shared 资料库
    → reject  → not admitted
```

Owner-originated uploads may be admitted directly because the Owner already holds admission authority. Pending submissions are intake/review state, not a permanent private storage product.

## Product Layers

### Layer 1 — Core Resource Handling

Foundation complete: authentication, folders, browser-direct object-storage upload/download, Preview, move/rename, Favorites, transactional recycle/restore, revision/CAS protection, bilingual responsive UI, dedicated mobile/fullscreen Preview, security/reliability hardening, and deployment/recovery foundations.

`L1-UX03` already completed dedicated mobile presentation and zero-descriptive-copy cleanup. Later UI work must preserve that baseline rather than reopen it.

### Layer 2 — Accounts & Governance

Foundation complete:
- exact global roles `owner | member`;
- first-Owner bootstrap;
- invite-only registration and invitation management;
- Owner Member administration;
- disable/enable/archive lifecycle with session revocation;
- Global Homepage Announcements;
- bounded governance/security audit.

ADR-024 retires authenticated self-service password change from the development product surface. The active Owner can issue a digest-only, 30-minute, one-time reset link for an active or disabled Member; the Member chooses the final password, all old sessions are revoked atomically, and disabled state is preserved. No email/SMS/OAuth recovery infrastructure is introduced. The deployed production baseline remains unchanged until a separate Owner-gated release.

### Layer 3 — Personal Scholarly Workspace & Scholarly Model

Stable Scholarly Record / Artifact / Artifact Version identity is already implemented. Remaining approved Pre-OCR work includes canonical metadata/templates, provenance, lineage, private reading/research overlays, Personal Tags, Collections, Saved Views, intake, annotations, citations, page evidence, Evidence Bundles, Research Questions, and structured export.

These internal entities are not primary navigation labels. User-facing scholarly identity should surface naturally through `资料` / `资料详情`.

### Layer 4 — Shared Academic Library

Core primitives are complete:
- explicit `account | library` ownership domains with separate uploader/contributor provenance;
- Library membership/authorization/holdings (`RF-LIBRARY01`);
- guarded `submitted | approved | rejected | withdrawn` contribution review and ownership promotion (`RF-LIBRARY02`).

ADR-022 changes the default product semantics: these primitives now support the single canonical shared corpus rather than an optional side Library. `RF-SHAREDDEFAULT01` performs that correction while preserving stable IDs, object keys/bytes, checksums, provenance, lineage, Favorites, and private overlays.

### Layer 5 — Research Infrastructure & Pre-OCR Hardening

Planned foundations include provenance/relationship modeling, integrity monitoring, bounded metadata recovery, complete permission-matrix verification, structured export, stable page/derived-artifact authorization contracts, and production-disabled OCR/index adapter contracts.

### Layer 6 — Intelligence

Future and not currently authorized: OCR/text extraction execution, full-text indexing/search, embeddings/retrieval, RAG, and source-grounded research assistance.

Compute-heavy intelligence should remain isolated from the small authoritative core host.

## Operations Track

Operations is cross-cutting. The repository contains deployment, backup/restore, systemd, Nginx, health/readiness, migration verification, production artifact tooling, and runbooks. Production work is always an explicit Owner gate; repository green never implies deployment authorization.

## Core Principles

- modularity and fault isolation;
- data safety before feature count;
- server-authoritative identity/authorization;
- browser-direct large-file transfer through object storage;
- storage portability;
- explicit lifecycle, provenance, and lineage;
- shared-resource/private-research separation;
- no research-surveillance-by-default;
- independently reviewable bounded Epic checkpoints;
- repository-driven autonomous progression;
- durable decisions reconciled into repository memory and synchronized back to local state;
- production as a separate explicit gate;
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
→ focused verification
→ independent/adversarial review where warranted
→ repair concrete findings
→ reconcile durable repository state
→ commit/push checkpoint
→ synchronize local state
→ next approved task if the continuous objective allows
```

Long Agent runs consume only the explicitly approved queue. They do not invent work or depend on giant chat prompts.

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

Original acquired artifacts remain preservable evidence. Derived artifacts such as later OCR/transcription/translation/annotated exports require explicit lineage rather than silently overwriting the source.

Production configuration, credentials, migrations, DNS/TLS/OSS, destructive real-data operations, deployment, main merge, OCR execution, and RAG remain separately gated according to the active task/objective.

## License

No public licensing or distribution decision has been made.
