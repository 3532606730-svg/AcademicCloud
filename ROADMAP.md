# AcademicCloud Roadmap

**Last reconciled:** 2026-08-18

The roadmap records durable product sequencing and approved boundaries. `TASK_BOARD.md` is the executable queue; task cards define bounded implementation contracts. A roadmap item never bypasses an Owner production/cost/destructive-data gate.

## Product Direction

AcademicCloud is a small invitation-only academic database and research workspace.

Its durable product model is:

> **Owner-curated shared academic corpus + private per-user research activity.**

ADR-022 governs this model. The ordinary user experience is one canonical `资料库`, not a private Drive plus a separate Shared Library.

```text
Member upload
  → 待审核
  → Owner review
      → approve → shared 资料库
      → reject  → not admitted
```

Owner-originated uploads may be admitted directly. Once admitted, the resource is shared to active authorized members for browse/search/preview/download. Contributor/uploader identity remains provenance, not exclusive ownership.

Personal Research Overlay remains private per account: Favorites, Recent, reading state/progress, Important/To Cite, Personal Tags, Collections, Saved Views, notes, annotations/highlights, Citation Workspace, Evidence, Research Questions, and equivalent personal research state.

> **Shared resource does not imply shared research activity.**

`Scholarly Record`, `Artifact`, `Artifact Version`, ownership domains, audit rows and equivalent implementation entities remain internal concepts. Normal UI uses `资料` / `资料详情`.

## Completed First-Use Correction

The previous bounded correction and production release are complete:

```text
RF-SHAREDDEFAULT01
→ L2-CREDENTIALRESET01
→ L1-UX05
→ PROD-06A
→ STOP for Owner review
```

Completed outcomes include:
- deterministic canonical Library and automatic active-account membership;
- Member pending contribution → Owner approval; Owner direct admission;
- preserved stable IDs, object keys/bytes, checksums, provenance, lineage and private Favorites/overlay state;
- Owner-assisted digest-only one-time credential reset and retired self-service password route/UI;
- canonical shell/admin hierarchy and stale-state recycle safety;
- production release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017.

## Catalogue and Bibliographic Usability Round

Actual use after PROD-06A confirmed the authority/data model but exposed a narrower usability problem: root `资料库` visually stacked canonical holdings above a legacy Owner table, misplaced Name/Size/Updated headers, dropped established file-type icons, repeated filename-derived labels, left redundant descriptive copy, and lacked an authority-correct recoverable lifecycle action for Library-owned holdings. L1-UX06 has repaired that gap.

Owner review also established that cleaner scholarly titles and basic catalogue search must arrive in the same near-term round. ADR-025 records the bilingual front-matter bibliographic evidence model and keeps OCR separately gated.

The durable round sequence remains:

```text
L1-UX06   ← COMPLETE
→ STOP for Owner/ChatGPT review

Preserved future cards: RF-META01 → RF-METASUGGEST01 → RF-SEARCH01
```

The L1-UX06 run did not start the preserved future cards. A new Owner continuation is required before RF-META01; completing RF-SEARCH01 in any later run would not automatically authorize the later Pre-OCR cards.

### L1-UX06 — Canonical Catalogue Presentation Repair — Complete

Completed outcome:
- one coherent catalogue surface rather than `SharedLibraryPanel` stacked above a second legacy table;
- desktop headers above and aligned with the rows they describe;
- restored PDF/image/text/generic badges;
- remove redundant `当前账户可访问的共享学术资料。`-style copy;
- suppress duplicate migrated `recordLabel` when it merely repeats the filename;
- preserve Preview/Download/Favorites;
- Owner/Manager gets an authority-correct **recoverable** `移入回收站` path for eligible Library-owned resources; Members remain non-destructive;
- preserve responsive/mobile/accessibility, CAS/revision safety, stable identity, provenance, lineage and private overlays.

No permanent deletion, production cleanup or broad visual redesign.

### RF-META01 — Canonical Metadata / 资料详情

Add bounded versioned canonical metadata contracts and minimal authority records for Book, Article, Manuscript, Inscription and Archival Document.

Key outcome:
- a clean human-facing canonical title and scholarly metadata can exist independently from the acquisition filename;
- original filename remains retrievable as provenance/detail;
- canonical metadata appears through normal `资料详情`, not a standalone `学术记录` browser;
- private research interpretation remains outside shared canonical facts.

### RF-METASUGGEST01 — Front-Matter Bibliographic Suggestions

After RF-META01, generate deterministic, reviewable bibliographic proposals from already-authorized local evidence.

For PDFs with a usable text layer, default discovery is bounded to:

```text
first 15 pages + last 5 pages
```

The classifier may identify:
- cover;
- half-title;
- title page;
- copyright / title-page verso;
- Chinese 版权/CIP page;
- Library of Congress / British Library CIP;
- colophon;
- series page;
- contents/preface;
- ordinary body text.

Field-specific evidence precedence follows ADR-025.

For title/subtitle and primary creator roles:

```text
title page
→ CIP / colophon / copyright evidence
→ embedded PDF metadata
→ filename
```

For publisher/place/year/edition/ISBN:

```text
copyright / title-page verso / CIP / colophon
→ title page
→ embedded PDF metadata
→ filename
```

Chinese and English/Latin-script bibliographic cues are first-class. Older books without a modern copyright page may use title-page publication statements as primary evidence.

Every proposal records source type, source page, page class, ruleset version and confidence. Suggestions require explicit authorized confirmation before becoming canonical. Original filename, OSS object key, bytes/checksum and provenance remain unchanged.

Pure image-only/scanned PDFs must not guess. They return an `OCR deferred` state. This round defines a future page-text/OCR adapter boundary but does **not** execute OCR, AI/LLM extraction, external catalogue/ISBN lookup, web lookup or fuzzy merge.

### RF-SEARCH01 — Authority-Scoped Catalogue Search

Basic catalogue findability is now near-term usability infrastructure.

After canonical metadata/suggestion work:
- add one quiet search field to normal `资料库`;
- search authorized original/display names plus canonical metadata;
- filter effective authority before ranking/counting/serialization;
- no persisted query history;
- deterministic bounded ranking/pagination;
- no OCR/full-text claim.

RF-SEARCH01 no longer waits for personal organization work merely to provide basic catalogue search.

## Cross-Layer Data Model

AcademicCloud retains six conceptual planes:

1. **Physical Artifact** — stored bytes/file representation and lifecycle identity.
2. **Scholarly Resource / Scholarly Record** — logical academic object and canonical shared facts.
3. **Personal Research Overlay** — private per-account research activity/state.
4. **Collaborative / Library Plane** — admitted shared corpus, contribution/review, catalog and shared governance state.
5. **Governance / Operations** — accounts, invitations, permissions, announcements, security audit, integrity/recovery evidence.
6. **Derived Intelligence** — OCR/text/index/embeddings/retrieval/RAG subject to source authorization.

## Layer 0 — Project Setup

**Status:** Complete.

Repository structure, persistent project memory, ADR/task workflow, local environment baseline and repository-driven engineering are established.

## Layer 1 — Core Resource Handling

**Status:** Foundation and the focused L1-UX06 catalogue repair are complete; STOP for Owner review.

Completed foundations include SQLite/auth/storage abstraction, file/folder lifecycle, responsive frontend, Favorites, bulk operations, recursive recycle/restore, duplicate-name UX, upload recovery, mobile/fullscreen Preview, sticky navigation, shared-corpus authority and first-use shell repair.

## Layer 2 — Accounts & Governance

**Status:** Foundation complete.

Completed:
- Owner/Member accounts and invitation-only registration;
- enable/disable/archive lifecycle and session revocation;
- announcements;
- bounded governance/security audit;
- Owner-issued, Member-redeemed one-time credential reset.

Later optional backlog includes one-time external sharing if separately reopened.

## Layer 3 — Scholarly Workspace and Model

**Status:** L1-UX06 is complete. Canonical metadata/suggestion/search and the remaining personal-workspace cards are preserved but not active.

Stable Scholarly Record / Artifact / Artifact Version identities already exist.

Completed:
- `L1-UX06` catalogue presentation/lifecycle.

Preserved future sequence, requiring Owner continuation:
- `RF-META01` canonical metadata/templates/minimal authorities;
- `RF-METASUGGEST01` bilingual front-matter evidence suggestions;
- `RF-SEARCH01` authority-scoped catalogue search.

Later work includes provenance/fingerprint handling, lineage, storage statistics, private overlay features, organization/views, intake, annotations, citation/evidence/export and related research tooling.

## Layer 4 — Shared Academic Library

**Status:** Core primitives and canonical default semantics complete.

Completed:
- `RF-LIBRARY01` — Library ownership/membership/holdings foundation;
- `RF-LIBRARY02` — guarded contribution review and ownership promotion;
- `RF-SHAREDDEFAULT01` — canonical default Library and corpus transition.

Later approved cards remain `RF-LIBRARY03` shared catalog/tags/canonical-original naming and `RF-LIBRARY04` provenance confidence/duplicate-version grouping.

## Layer 5 — Pre-OCR Hardening

**Status:** Approved but parked after the current four-card round.

Later foundations include integrity monitoring, no-clobber metadata recovery, complete authorization/non-disclosure matrix, structured export, stable page/derived-artifact authorization contracts, and production-disabled OCR/text/index adapter contracts.

## Layer 6 — Intelligence

**Status:** Future; not authorized.

Future sequence may include OCR/text extraction, full-text indexing/search, embeddings/retrieval, RAG and source/page-grounded assistance. Derived authority must never exceed effective authority over the underlying shared resource and any private overlay used in the request.

## Parked Pre-OCR Order After Current STOP

When and only when the Owner starts another round after RF-SEARCH01 review, the preserved later sequence is:

```text
RF-PROV01
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

`RF-LIBRARY01` and `RF-LIBRARY02` are already complete and are not repeated.

## Cross-Cutting Operations

OPS01A and the production runbook remain the operational baseline. Repository HEAD is never automatically a production candidate.

Verification is proportionate, not performative. Run checks that materially cover changed risk; once relevant evidence is green and focused review finds no material issue, record/checkpoint instead of replaying broad historical campaigns.

## Production Track

Production runs exact release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017 from completed `PROD-06A`.

Current rollback pair:
- previous release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema-v15 backup `academiccloud-pre-prod06a-20260818T073533Z.sqlite`, SHA-256 `cdc2aec14888d04172bce4555dd6d17f10b5fb7c45efa9c7133070ce4f5bf7c4`;
- encrypted off-host evidence in private backup commit `9c8f4503e48e55ea7b65aebe35dd242e878c95e8`.

The consumed PROD-06A window leaves no continuing authority for production mutation. Any later release remains separately Owner-gated.

`PROD-03C2` permanent-delete confirmation remains separately parked.

## Non-Blocking Future Backlog

Preserved but non-blocking:
- Private Vault / client-side encryption;
- External Deposit Link;
- polished browser extension after intake APIs stabilize;
- mature Authority/RDF/semantic-web work;
- full Time Machine/Rewind;
- native desktop/mobile apps if future use justifies them.

## Current Repository Objective

Only:

```text
STOP for Owner/ChatGPT review after completed L1-UX06
```

RF-META01 and later cards require new Owner continuation. No current authority exists for production contact/mutation, main merge, permanent deletion, real-data cleanup, OCR execution, whole-book text extraction, full-text indexing, embeddings, retrieval, RAG, external metadata services, ISBN/web lookup or AI extraction.
