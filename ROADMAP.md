# AcademicCloud Roadmap

**Last reconciled:** 2026-08-19

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
→ RF-META01
→ PROD-07A
→ PROD-07B
→ STOP for Owner review
```

Completed outcomes include:
- deterministic canonical Library and automatic active-account membership;
- Member pending contribution → Owner approval; Owner direct admission;
- preserved stable IDs, object keys/bytes, checksums, provenance, lineage and private Favorites/overlay state;
- Owner-assisted digest-only one-time credential reset and retired self-service password route/UI;
- canonical shell/admin hierarchy and stale-state recycle safety;
- production release `bc5788633e0295744905b4ae2dcdfcc5d97635bf` at schema v18/history 001–018, with the inseparable rollback pair recorded by `PROD-07B`.

## Catalogue and Bibliographic Usability Round

Actual use after PROD-06A confirmed the authority/data model but exposed a narrower usability problem: root `资料库` visually stacked canonical holdings above a legacy Owner table, misplaced Name/Size/Updated headers, dropped established file-type icons, repeated filename-derived labels, left redundant descriptive copy, and lacked an authority-correct recoverable lifecycle action for Library-owned holdings. L1-UX06 repaired the presentation and recycle transition; subsequent Owner review found the Library-domain item could not be listed/restored through the account-scoped Recycle product, and the bounded closure repair completed that lifecycle without merging authority domains.

Owner review also established that cleaner scholarly titles and basic catalogue search must arrive in the same near-term round. ADR-025 records the bilingual front-matter bibliographic evidence model and keeps OCR separately gated.

The durable round sequence for the current Owner continuation is:

```text
L1-UX06   ← COMPLETE
→ RF-META01   ← COMPLETE
→ PROD-07A   ← COMPLETE
→ PROD-07B   ← COMPLETE
→ STOP for Owner/ChatGPT review   ← REACHED

Preserved later cards: RF-METASUGGEST01 → RF-SEARCH01
```

The Owner-authorized RF-META01 continuation, separately authorized PROD-07A release, and separately authorized PROD-07B hotfix are complete. RF-METASUGGEST01, RF-SEARCH01, and the later Pre-OCR cards remain preserved but unauthorized; migration 019 was not deployed.

### L1-UX06 — Canonical Catalogue Presentation Repair — Complete

Completed outcome:
- one coherent catalogue surface rather than `SharedLibraryPanel` stacked above a second legacy table;
- desktop headers above and aligned with the rows they describe;
- restored PDF/image/text/generic badges;
- remove redundant `当前账户可访问的共享学术资料。`-style copy;
- suppress duplicate migrated `recordLabel` when it merely repeats the filename;
- preserve Preview/Download/Favorites;
- At the L1-UX06 checkpoint, Owner/Manager got an authority-correct **recoverable** `移入回收站` → normal Recycle list → CAS restore path for eligible Library-owned resources; Members cannot list or restore Library governance entries. PROD-07B later added the separate global-Owner-only permanent-delete control and Library purge lifecycle;
- Library restore performs read-only storage verification and atomic file activation/group consumption/audit; Library rows remain outside account bulk lifecycle operations and use a distinct Library-domain permanent-delete route;
- preserve responsive/mobile/accessibility, CAS/revision safety, stable identity, provenance, lineage and private overlays.

L1-UX06 itself performed no permanent deletion or production cleanup; PROD-07B is the later bounded control/lifecycle hotfix and also performed no real resource deletion during acceptance.

### RF-META01 — Canonical Metadata / 资料详情 — Complete

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

**Status:** Foundation, L1-UX06, RF-META01, PROD-07A, and the separately authorized PROD-07B hotfix are complete; STOP is in force.

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

**Status:** L1-UX06 and canonical metadata RF-META01 are complete and deployed through PROD-07A; PROD-07B added the bounded recycle/permanent-delete correction. Suggestion/search and the remaining personal-workspace cards are preserved but not active.

Stable Scholarly Record / Artifact / Artifact Version identities already exist.

Completed:
- `L1-UX06` catalogue presentation/lifecycle.
- `RF-META01` canonical metadata/templates/minimal Library-domain authorities through ordinary `资料详情`.

Preserved future sequence, requiring Owner continuation:
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

Production runs exact release `bc5788633e0295744905b4ae2dcdfcc5d97635bf` at schema v18/history 001–018 from completed `PROD-07B`.

PROD-07B evidence:
- previous release `2322169bc33415734d025010c465900c7fbc6bd9`;
- no migration command ran; schema/history/checksums 001–018 remain exact; rollback was not used;
- integrity `ok`, foreign-key violations zero, health/readiness green, API loopback-only, autostart disabled, and protected systemd/Nginx/logrotate hashes unchanged;
- Linux x64 / Node 24 archive SHA-256 `ad084372db6e128cc4a7ff2beae4dbbe7c8b1077c0bb07db926d69bacfbcbca6` and manifest SHA-256 `7fe3b0608dddf7431af9cc3bb0ff4a0de40401c2257b2a6eadd4e76eb69287e8`;
- fresh schema-v18 rollback backup `academiccloud-pre-hotfix-20260818T161319Z.sqlite` SHA-256 `5233f0866384ef774f5def211721c6f114c4aef0b3acef96731ee30581a11963`, with private off-host backup commit `49e72e5`;
- root-row spacer, direct folder recycle, Owner-only account/Library permanent-delete controls, exclusivity proof/revalidation, and forged-request denial are recorded in `tasks/done/PROD-07B.md`.

Current rollback pair:
- previous release `2322169bc33415734d025010c465900c7fbc6bd9`;
- schema-v18 backup `academiccloud-pre-hotfix-20260818T161319Z.sqlite`, SHA-256 `5233f0866384ef774f5def211721c6f114c4aef0b3acef96731ee30581a11963`;
- receipt SHA-256 `aebe203e88ad047e97f765aa0ccbad441dabe6cf193a7fe9bc10125391d55e67`;
- age ciphertext SHA-256 `2a5c0decfab2133db708c027416e5f558dfc08ed25e5c7fe11a9b5d29eb0f7ec`;
- encrypted off-host evidence in private backup commit `49e72e5`.

The consumed PROD-07B window leaves no continuing authority for another production release, real resource recycle/purge, or infrastructure mutation. Any later release or destructive confirmation remains separately Owner-gated.

`PROD-03C2` disposable-object permanent-delete confirmation/cleanup remains separately parked; PROD-07B deployed the controls and lifecycle but did not perform that destructive acceptance.

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
STOP for Owner/ChatGPT review
```

RF-META01 is complete and no repository Epic is active. Later cards require new Owner continuation. No further authority exists for production contact/mutation, main merge, real-data cleanup, destructive acceptance, OCR execution, whole-book text extraction, full-text indexing, embeddings, retrieval, RAG, external metadata services, ISBN/web lookup or AI extraction.
