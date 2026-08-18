# AcademicCloud Roadmap

**Last reconciled:** 2026-08-18

The roadmap records durable product sequencing and approved boundaries. `TASK_BOARD.md` is the executable queue; task cards define bounded implementation contracts. A roadmap item never bypasses an Owner production/cost/destructive-data gate.

## Product Direction

AcademicCloud is a small invitation-only academic database and research workspace.

Its durable product model is now:

> **Owner-curated shared academic corpus + private per-user research activity.**

This clarifies ADR-014 after first-use review and is recorded in ADR-022.

The ordinary user experience is **not** a private Drive plus a separate Shared Library. There is one canonical `资料库` containing Owner-approved academic resources. A normal Member can contribute material, but contribution is an intake/review action:

```text
Member upload
  → 待审核
  → Owner review
      → approve → shared 资料库
      → reject  → not admitted
```

Owner-originated uploads may be admitted directly because the Owner already holds review authority.

Once admitted, the academic resource is shared to all active authorized members for browse/search/preview/download. The contributor remains recorded as provenance, not as exclusive private owner of the approved holding.

Around the same shared resource, each account has a mutually private Personal Research Overlay: Favorites, Recent, reading state/progress, Important/To Cite, Personal Tags, Collections, Saved Views, notes, annotations/highlights, Citation Workspace, Evidence, Research Questions, and equivalent personal research state.

The core invariant remains:

> **Shared resource does not imply shared research activity.**

## Cross-Layer Data Model

AcademicCloud retains the six conceptual planes from ADR-014:

1. **Physical Artifact** — stored bytes/file representation and lifecycle identity.
2. **Scholarly Resource / Scholarly Record** — the logical academic object and canonical shared facts.
3. **Personal Research Overlay** — private per-account research activity/state.
4. **Collaborative / Library Plane** — admitted shared corpus, contribution/review, catalog and shared governance state.
5. **Governance / Operations** — accounts, invitations, permissions, announcements, security audit, integrity/recovery evidence.
6. **Derived Intelligence** — OCR/text/index/embeddings/retrieval/RAG subject to source authorization.

`Scholarly Record`, `Artifact`, `Artifact Version`, ownership domains, and audit rows are implementation/domain concepts. They should not become primary UI navigation labels merely because they exist internally.

## Completed First-Use Product Correction

The Owner-approved correction completed and deployed this bounded queue:

```text
RF-SHAREDDEFAULT01
        ↓
L2-CREDENTIALRESET01
        ↓
L1-UX05
        ↓
PROD-06A
        ↓
STOP for Owner review
```

### RF-SHAREDDEFAULT01 — Canonical Shared Library Default — Complete

One deterministic canonical Library now backs the ordinary `资料库`; active authorized members can see admitted holdings, Member uploads enter review, Owner uploads may be admitted directly, and production migration 016 preserved stable IDs, object keys/bytes, checksums, provenance, lineage, Favorites, and private-overlay boundaries.

### L2-CREDENTIALRESET01 — Owner-Assisted Credential Reset — Complete

The old authenticated self-service password route/UI is retired. Owner-issued 30-minute digest-only reset capabilities are single-use, Member-chosen passwords remain unknown to the Owner, successful redemption advances auth revision and revokes sessions, and migration 017 is deployed.

### L1-UX05 — Information Architecture and Visual Hierarchy Repair — Complete

The duplicate top-level `共享资料库` and standalone `学术记录` shell surfaces are removed; Owner administration is consolidated; `上传资料` is the dominant action; stale folder recycle uses revision-bearing atomic lifecycle semantics; L1-UX03 mobile/fullscreen/zero-copy foundations remain preserved.

## Owner Review Follow-up — Catalogue Usability

Actual use of production release `855b63c49f12f3375972774e7bc7385088b0495e` exposed a second, narrower first-use issue: the **data/authority model is correct, but the catalogue presentation still visually splices the new canonical holdings feed above the legacy Owner Drive table**. This creates a misplaced `名称 / 大小 / 更新时间` header, removes established file-type icons from canonical holdings, repeats migrated filename-derived labels, leaves redundant explanatory copy, and does not expose an authority-correct recoverable lifecycle action for Library-owned resources.

The Owner has approved the following repository roadmap adjustment. It does **not** authorize production deployment, cleanup, permanent deletion, OCR, external services, or AI extraction:

```text
L1-UX06  Canonical Catalogue Presentation Repair
   ↓
RF-META01  Canonical Metadata / 资料详情
   ↓
RF-METASUGGEST01  Deterministic Title & Metadata Suggestions
   ↓
RF-SEARCH01  Catalogue Metadata/Name Search
   ↓
remaining Pre-OCR program
```

### L1-UX06 — Canonical Catalogue Presentation Repair — Ready

Required outcome:
- one unified scholarly catalogue surface instead of `SharedLibraryPanel` followed by a second legacy table;
- desktop headers remain above and aligned with the rows they describe;
- canonical holdings reuse established PDF/image/text/generic file badges;
- remove redundant descriptive copy such as `当前账户可访问的共享学术资料。`;
- do not repeat migrated `recordLabel` when it merely duplicates the filename;
- keep Preview/Download/Favorites;
- Owner/Manager gets an authority-correct **recoverable** `移入回收站` path for eligible Library-owned resources while Members remain non-destructive;
- preserve mobile/accessibility, CAS/revision safety, object identity, provenance, lineage and private overlays.

This is a focused UX/lifecycle repair, not a broad redesign and not `PROD-03C2` permanent deletion.

### RF-META01 — Canonical Metadata, Templates, and Minimal Authorities — Ready After L1-UX06

Canonical shared facts for Book, Article, Manuscript, Inscription, and Archival Document appear through normal `资料详情`. The original filename remains a provenance/detail fact rather than the only human-facing title. RF-META01 still does not itself perform automatic extraction/suggestion.

### RF-METASUGGEST01 — Deterministic Title and Metadata Suggestions — New

After RF-META01 defines canonical fields, add a bounded suggestion layer using already-authorized local signals only: filename and safe embedded document metadata. It may conservatively remove obvious acquisition noise such as extensions, archive/source suffixes, opaque hashes and tested ISBN-like tails, but **suggestions are never silently authoritative**. Preserve the original filename, object key, bytes/checksum and provenance. Ambiguous/low-confidence cases fall back rather than invent facts.

No OCR, LLM/AI extraction, external catalogue/ISBN lookup, fuzzy authority merge or silent production bulk rewrite is authorized by this task.

### RF-SEARCH01 — Authority-Scoped Metadata and Name Search — Priority Moved Forward

Basic catalogue search is now treated as near-term usability infrastructure rather than waiting for Personal Tags/Collections/Saved Views. After canonical metadata/suggestion work, add one search field to the normal `资料库` and search authorized original/display names plus canonical metadata. Search remains authority-filtered before ranking/serialization, stores no query history, and makes no OCR/full-text claim.

`RF-SEARCH01` no longer depends on `RF-ORGANIZE01` merely to provide basic catalogue search.

## Layer 0 — Project Setup

**Status:** Complete.

Repository structure, persistent project memory, ADR/task workflow, local environment baseline, and repository-driven autonomous engineering are established.

## Layer 1 — Core Drive / Resource Handling

**Status:** Foundation complete; one focused post-deployment catalogue presentation/lifecycle repair (`L1-UX06`) is ready.

Completed foundations include architecture, SQLite/auth/storage abstraction, file/folder lifecycle, responsive frontend, security/reliability, Favorites, bulk operations, recursive recycle/restore, transfer-performance evidence, duplicate-name UX, `L1-UX03` dedicated mobile/fullscreen Preview plus zero-descriptive-copy cleanup, sticky desktop navigation, canonical shared-corpus authority, and first-use shell repair.

The old first-layer “private cloud drive” behavior is historical implementation substrate, not the final product concept for academic holdings after ADR-022.

## Layer 2 — Accounts & Governance

**Status:** Foundation complete; Owner-assisted credential recovery is implemented for the small known-member operating model.

Completed:
- Owner/Member accounts and invitation-only registration;
- Member enable/disable/archive lifecycle and session revocation;
- announcements and administration polish;
- bounded governance/security audit;
- Owner-issued, Member-redeemed one-time credential reset with atomic session invalidation.

Later separate backlog:
- one-time external sharing capability (`L2-SHARE01`) if explicitly reopened.

Explicitly not implied:
- public signup;
- SMTP/SMS/OAuth identity infrastructure;
- hard account deletion/username reuse;
- unrestricted global role editing.

## Layer 3 — Personal Scholarly Workspace & Scholarly Model

**Status:** Approved Pre-OCR program; canonical catalogue/metadata/search usability is now sequenced first.

### Personal Research Overlay

Private per-account capabilities include reading state/progress, Important / To Cite, Recent, Personal Tags, Collections, Saved Research Views, private notes, annotations/highlights/page notes, Citation Workspace, Evidence Bundles, Research Questions and private links. Owner/Admin authority does not implicitly expose another user's Personal Research Overlay.

### Scholarly identity, metadata, provenance, lineage

Stable Scholarly Record / Artifact / Artifact Version identities are already implemented by `RF-DOMAIN01`.

Near-term work now includes:
- coherent canonical catalogue presentation/lifecycle (`L1-UX06`);
- bounded canonical metadata/templates and minimal authorities (`RF-META01`);
- deterministic, reviewable local title/metadata suggestions (`RF-METASUGGEST01`);
- authority-scoped catalogue name/metadata search (`RF-SEARCH01`).

Later work includes provenance/fingerprint/leak-safe duplicate handling (`RF-PROV01`), artifact/version/derived lineage (`RF-LINEAGE01`), storage statistics (`RF-STATS01`), and the Personal Research Overlay program.

### Research intake

Later `RF-INTAKE01` should build on ADR-022: acquisition/contribution intake is a staging/review workflow, not justification for reintroducing a permanent private Drive product. Its deterministic/manual suggestion boundary must reuse, not duplicate or broaden, the title/metadata suggestion contracts established earlier. OCR/AI/external lookup remains separately gated.

## Layer 4 — Shared Academic Library

**Status:** Core primitives and canonical default semantics complete; catalogue polish and later catalog governance remain.

Completed:
- `RF-LIBRARY01` — Library ownership domain, membership/manager authority, holdings read/preview/download;
- `RF-LIBRARY02` — guarded submitted/approved/rejected/withdrawn contribution review and ownership promotion;
- `RF-SHAREDDEFAULT01` — one canonical default Library and live corpus transition.

Later approved cards remain:
- `RF-LIBRARY03` — shared catalog, Library Tags, canonical/original naming;
- `RF-LIBRARY04` — shared provenance confidence and duplicate/version grouping.

## Layer 5 — Research Infrastructure & Pre-OCR Hardening

**Status:** Approved and parked.

Remaining foundations include integrity monitor, no-clobber metadata snapshot/recovery, complete cross-plane authorization/non-disclosure matrix, structured scholarly export, stable page/derived-artifact authorization contracts, and production-disabled OCR/text/index adapter contracts only.

## Layer 6 — Intelligence

**Status:** Future; not authorized.

Future sequence remains OCR/text extraction, full-text indexing/search, embeddings/retrieval, RAG, and source/page-grounded research assistance. Derived authority must never exceed the requesting account's effective authority over shared resources and any private overlay used in the request.

## Remaining Pre-OCR Execution Order

After Owner explicitly starts repository development again, the revised sequence is:

```text
L1-UX06
→ RF-META01
→ RF-METASUGGEST01
→ RF-SEARCH01
→ RF-PROV01
→ RF-LINEAGE01
→ RF-STATS01
→ RF-OVERLAY01
→ RF-ORGANIZE01
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

`RF-LIBRARY01` and `RF-LIBRARY02` were completed early and are not repeated. `RF-SEARCH01` is deliberately moved before personal organization because first-use review showed that basic catalogue findability is a core requirement at the current corpus scale and will become mandatory as holdings grow.

## Cross-Cutting Operations

OPS01A and the production runbook remain the operational baseline. Production release selection is explicit; repository HEAD is never automatically a production candidate.

Verification is proportionate, not performative. Run checks that materially cover changed risk; once relevant evidence is green and focused review finds no material issue, record/checkpoint instead of replaying broad historical campaigns.

## Production Track

Production runs exact release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017 from completed `PROD-06A`.

Current rollback pair:
- previous release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema-v15 backup `academiccloud-pre-prod06a-20260818T073533Z.sqlite`, SHA-256 `cdc2aec14888d04172bce4555dd6d17f10b5fb7c45efa9c7133070ce4f5bf7c4`;
- encrypted off-host evidence in private backup commit `9c8f4503e48e55ea7b65aebe35dd242e878c95e8`.

The completed correction and consumed PROD-06A window do not authorize any further production access or mutation. Any later release remains separately Owner-gated.

`PROD-03C2` permanent-delete confirmation remains separately parked.

## Non-Blocking Future Backlog

Preserved but non-blocking:
- Private Vault / client-side encryption;
- External Deposit Link;
- polished browser extension after intake APIs stabilize;
- mature Authority/RDF/semantic-web work;
- full Time Machine/Rewind;
- native desktop/mobile apps unless future real use justifies them.

## Current Repository Objective

Planning is reconciled. No implementation task is active yet. The next Owner-approved repository queue is now durably recorded as:

```text
L1-UX06
→ RF-META01
→ RF-METASUGGEST01
→ RF-SEARCH01
→ continue revised Pre-OCR sequence
```

This planning update does not authorize production contact/mutation, main merge, permanent deletion/`PROD-03C2`, real-data cleanup, OCR/text extraction, full-text indexing, embeddings, retrieval, RAG, external metadata services, or AI extraction.