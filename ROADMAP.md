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

## Historical First-Use Correction

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
- production release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017 at that checkpoint; PROD-07A and PROD-07B later advanced production to the current release recorded below.

## Catalogue and Bibliographic Usability Round

Actual use after PROD-06A confirmed the authority/data model but exposed a narrower usability problem: root `资料库` visually stacked canonical holdings above a legacy Owner table, misplaced Name/Size/Updated headers, dropped established file-type icons, repeated filename-derived labels, left redundant descriptive copy, and lacked an authority-correct recoverable lifecycle action for Library-owned holdings. L1-UX06 repaired the presentation and recycle transition; subsequent Owner review found the Library-domain item could not be listed/restored through the account-scoped Recycle product, and the bounded closure repair completed that lifecycle without merging authority domains.

Owner review established that cleaner scholarly titles and eventual basic catalogue search are near-term usability needs. RF-META01 and RF-METASUGGEST01 completed the canonical/reviewable metadata layer, and RF-FRONTMATTEROCR01 later added only bounded local/offline fallback for unusable pages in the same exact first-15/last-5 window. RF-SEARCH01 remains parked. PROD-07B supplied the production recycle/permanent-delete hotfix, and L1-UX07 reconciled those product changes into the v19 line while fixing the catalogue interaction model. ADR-025/027 govern the bounded OCR boundary; ADR-028 governs permanent-delete authority, exclusivity, and destructive-boundary revalidation.

The durable completed sequence is:

```text
L1-UX06
→ RF-META01
→ RF-METASUGGEST01
→ PROD-07A
→ PROD-07B
→ L1-UX07 Catalogue Interaction Consistency
→ PROD-08R v19 Artifact Repair and Production Release
→ RF-FRONTMATTEROCR01 bounded local OCR development
→ workflow proportionality clarification
→ RF-TRANSFER01 true resumable transfer development
→ exact combined artifact and bounded final production deployment
→ STOP
```

L1-UX07, PROD-08R, and RF-FRONTMATTEROCR01 development are complete. Development is schema v20/history 001–020; production remains exact repaired release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` at schema v19/history 001–019, with RF-METASUGGEST01/L1-UX07 deployed and PROD-07B behavior preserved. The previous release remains `bc5788633e0295744905b4ae2dcdfcc5d97635bf`; rollback was used during fail-closed PROD-08R attempts before final success. RF-TRANSFER01 is the next authorized feature task after the workflow clarification. RF-SEARCH01 and the later Pre-OCR cards remain parked.

### L1-UX07 — Catalogue Interaction Consistency and State Reconciliation — Complete

Completed outcome:

- resource-scope-aware catalogue and Recycle selection across account folders/files and Library holdings;
- capability-aware actions that preserve domain-specific authority and lifecycle routing;
- coherent contextual Favorites, including Member-private Favorites and Library Preview/Download identity;
- coherent account/Library Recycle selection, restore, and truthful sequential permanent-delete reporting;
- exact suppression of the one historical `production-e2e:e73af1945d52:root-folder` fixture from normal projections;
- future production acceptance cleanup of only its exact run-owned root after all gates pass, preventing persistent catalogue residue;
- no migration 020, production contact, deployment, or real destructive operation.

### L1-UX06 — Canonical Catalogue Presentation Repair — Complete

Completed outcome:
- one coherent catalogue surface rather than `SharedLibraryPanel` stacked above a second legacy table;
- desktop headers above and aligned with the rows they describe;
- restored PDF/image/text/generic badges;
- remove redundant `当前账户可访问的共享学术资料。`-style copy;
- suppress duplicate migrated `recordLabel` when it merely repeats the filename;
- preserve Preview/Download/Favorites;
- Owner/Manager gets an authority-correct **recoverable** `移入回收站` → normal Recycle list → CAS restore path for eligible Library-owned resources; Members cannot list or restore Library governance entries;
- Library restore performs read-only storage verification and atomic file activation/group consumption/audit; Library rows never enter account bulk/permanent-delete controls;
- preserve responsive/mobile/accessibility, CAS/revision safety, stable identity, provenance, lineage and private overlays.

No permanent deletion, production cleanup or broad visual redesign.

### RF-META01 — Canonical Metadata / 资料详情 — Complete

Add bounded versioned canonical metadata contracts and minimal authority records for Book, Article, Manuscript, Inscription and Archival Document.

Key outcome:
- a clean human-facing canonical title and scholarly metadata can exist independently from the acquisition filename;
- original filename remains retrievable as provenance/detail;
- canonical metadata appears through normal `资料详情`, not a standalone `学术记录` browser;
- private research interpretation remains outside shared canonical facts.

### RF-METASUGGEST01 — Front-Matter Bibliographic Suggestions — Complete

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

Pure image-only/scanned PDFs must not guess. Completed RF-FRONTMATTEROCR01 may render and locally OCR only unusable selected pages inside the exact deduplicated first-15/last-5 window, after preferring native text. It persists only bounded proposal provenance, never raw OCR page text/images or canonical metadata writes, and does not authorize whole-document OCR, AI/LLM extraction, external catalogue/ISBN lookup, web lookup, or fuzzy merge.

### RF-SEARCH01 — Authority-Scoped Catalogue Search

Basic catalogue findability is now near-term usability infrastructure.

After canonical metadata/suggestion work:
- add one quiet search field to normal `资料库`;
- search authorized original/display names plus canonical metadata;
- filter effective authority before ranking/counting/serialization;
- no persisted query history;
- deterministic bounded ranking/pagination;
- no OCR/full-text claim.

RF-SEARCH01 remains a separately parked future usability Epic; this checkpoint does not authorize it.

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

**Status:** Foundation, L1-UX06, RF-META01, RF-METASUGGEST01, L1-UX07, and RF-FRONTMATTEROCR01 development are complete. The authorized continuous objective now proceeds through RF-TRANSFER01 and the bounded combined release gate.

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

**Status:** L1-UX06, canonical metadata RF-META01, bounded suggestions RF-METASUGGEST01, and L1-UX07 catalogue consistency are complete. Search and the remaining personal-workspace cards are preserved but not active.

Stable Scholarly Record / Artifact / Artifact Version identities already exist.

Completed:
- `L1-UX06` catalogue presentation/lifecycle.
- `RF-META01` canonical metadata/templates/minimal Library-domain authorities through ordinary `资料详情`.
- `RF-METASUGGEST01` bounded bilingual front-matter evidence suggestions and explicit manager acceptance.

Current completed sequence:
- `RF-METASUGGEST01` bilingual front-matter evidence suggestions.

Preserved future sequence, requiring Owner continuation:
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

**Status:** Approved but parked after the completed L1-UX07 checkpoint.

Later foundations include integrity monitoring, no-clobber metadata recovery, complete authorization/non-disclosure matrix, structured export, stable page/derived-artifact authorization contracts, and production-disabled OCR/text/index adapter contracts.

## Layer 6 — Intelligence

**Status:** Future; not authorized.

Future sequence may include OCR/text extraction, full-text indexing/search, embeddings/retrieval, RAG and source/page-grounded assistance. Derived authority must never exceed effective authority over the underlying shared resource and any private overlay used in the request.

## Parked Pre-OCR Order

When and only when the Owner starts another round after this checkpoint, the preserved later sequence is:

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

PROD-08R repaired the Linux x64 / Node 24 PDF.js runtime artifact boundary and deployed exact release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` at schema v19/history 001–019. The previous release is `bc5788633e0295744905b4ae2dcdfcc5d97635bf`. RF-METASUGGEST01 and L1-UX07 are deployed, and PROD-07B destructive-lifecycle behavior remains preserved. Rollback was used during two fail-closed post-migration verification attempts; the final app-plus-database cutover and changed-risk acceptance passed.

Current rollback pair:
- previous application `bc5788633e0295744905b4ae2dcdfcc5d97635bf`;
- schema-v18 backup `academiccloud-pre-prod08r-20260818T184801Z.sqlite`, SHA-256 `338d245d0e0aeb7fec063df069e0750bf3830aceedf32a0f4aad716fb868453b`;
- encrypted off-host evidence in private backup commit `a7369933f31af7839bc833d3d24d30688504276d`.

Because production schema advanced to v19, the existing rollback is an inseparable application-plus-database operation: never select `bc578863…` while leaving the v19 database in place. The new continuous objective authorizes one later bounded combined deployment only after OCR/transfer development and exact artifact gates are green; development work does not itself authorize production contact.

PROD-07B consumed the product authority/implementation decision for global-Owner-only account/Library permanent deletion. `PROD-03C2` remains separately parked only for any future real production disposable-object confirmation and the other explicit operations gates.

## Non-Blocking Future Backlog

Preserved but non-blocking:
- Private Vault / client-side encryption;
- External Deposit Link;
- polished browser extension after intake APIs stabilize;
- mature Authority/RDF/semantic-web work;
- full Time Machine/Rewind;
- native desktop/mobile apps if future use justifies them.

## Current Repository Objective

In order:

```text
PROD-08R truth preserved
→ RF-FRONTMATTEROCR01 development complete
→ workflow proportionality clarification
→ RF-TRANSFER01 development
→ exact Linux x64 / Node 24 combined artifact
→ bounded final production deployment and reconciliation
→ STOP
```

RF-META01, RF-METASUGGEST01, L1-UX07, PROD-08R, and RF-FRONTMATTEROCR01 development are complete. RF-METASUGGEST01 and L1-UX07 remain deployed in exact production release `f62766c…`; bounded OCR and development migration 020 remain undeployed. RF-TRANSFER01 is the next authorized feature task after the narrow workflow clarification. Production contact is deferred to the final exact-artifact gate. Incident-database inspection, main merge, real permanent deletion, real-data cleanup, infrastructure-policy repair, whole-document extraction, full-text indexing/search, semantic retrieval, RAG, external metadata services, ISBN/web lookup, web search, AI extraction, and unrelated work remain prohibited.
