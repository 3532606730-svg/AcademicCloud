# AcademicCloud Task Board

**Last reconciled:** 2026-08-18

## Current Phase

**`PROD-06A` is complete. Production runs exact release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017. No implementation task is active. Owner first-use review has approved one bounded repository-only catalogue/bibliographic round; production remains closed.**

The canonical shared-corpus authority is correct, but actual use exposed a presentation gap: root `资料库` stacks the canonical holdings feed above the legacy Owner table, producing a misplaced Name/Size/Updated header, missing file-type icons on holdings, duplicated filename-derived labels, redundant descriptive copy, and no authority-correct recoverable lifecycle action for Library-owned holdings.

Owner review also approved bilingual front-matter bibliographic suggestions for PDFs that already have text layers. ADR-025 defines title/copyright/CIP/colophon evidence, field-level precedence, and the strict OCR-deferred boundary.

Verification remains proportionate: focused changed-risk tests and focused independent review. Do not replay PROD-05A/PROD-06A or broad historical production acceptance.

## Doing

None. Planning/synchronization only.

## Ready — Current Owner-Approved Round

| Order | Task | Task card | Bounded result |
|---:|---|---|---|
| 1 | L1-UX06 | `tasks/ready/L1-UX06.md` | One coherent canonical catalogue; header/icon/duplicate-copy repair; Owner/Manager recoverable Library lifecycle without Member destructive authority |
| 2 | RF-META01 | `tasks/ready/RF-META01.md` | Canonical metadata/templates and `资料详情`; original filename retained as detail/provenance |
| 3 | RF-METASUGGEST01 | `tasks/ready/RF-METASUGGEST01.md` | Bounded Chinese/English title/copyright/CIP/colophon + embedded-metadata + filename evidence suggestions; source/page/confidence visible; OCR deferred |
| 4 | RF-SEARCH01 | `tasks/ready/RF-SEARCH01.md` | Early authority-scoped catalogue name/metadata search field; no OCR/full-text claim |
| 5 | STOP | — | Independent Owner/ChatGPT review before any later Pre-OCR card or production gate |

This round ends after RF-SEARCH01. Starting later Pre-OCR work is **not** implicitly authorized by completing these four cards.

## Bibliographic Suggestion Contract — ADR-025 Short Form

For PDFs with a usable existing text layer, RF-METASUGGEST01 uses a bounded default discovery window:

```text
first 15 pages + last 5 pages
```

It may classify cover, half-title, title page, copyright/title-page verso, Chinese 版权/CIP, Library of Congress/British Library CIP, colophon, series page, contents/preface, and body pages.

Field-level evidence precedence:

```text
Title / subtitle / primary creator:
  title page
  → CIP / colophon / copyright evidence
  → embedded PDF metadata
  → filename

Publisher / place / year / edition / ISBN:
  copyright / title-page verso / CIP / colophon
  → title page
  → embedded PDF metadata
  → filename
```

Older books without a modern copyright page may use title-page publication statements as primary evidence. Every proposal records source/page/page-class/ruleset/confidence and requires authorized confirmation before becoming canonical.

Pure image-only/scanned PDFs must not guess; this round reports `OCR deferred` and preserves manual metadata entry. No OCR execution, AI extraction, external catalogue lookup, or network metadata enrichment is authorized.

## Product Model — Authoritative Short Form

```text
Member upload
  → 待审核
  → Owner approve
      → shared 资料库
      → all active authorized members can browse / preview / download

Shared resource
  + User A private Favorites / reading / tags / notes / annotations / citations
  + User B private Favorites / reading / tags / notes / annotations / citations
```

Owner upload may be admitted directly because the Owner already holds review authority. Ordinary Members do not gain shared folder/canonical-metadata/destructive corpus authority merely because they can contribute.

`Scholarly Record`, `Artifact`, `Artifact Version`, ownership domains, and audit event tables remain internal implementation/domain concepts. Normal UI uses `资料` / `资料详情`.

## Parked Pre-OCR Queue After This Round

After STOP, the preserved later order is:

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

`RF-LIBRARY01` and `RF-LIBRARY02` are complete and are not repeated. Starting any parked card requires a new Owner execution decision after the four-card review.

## Production State and Gate

Production is exact release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history and exact checksums 001–017. `PROD-05A` and `PROD-06A` are closed and must not be rerun.

Current rollback pair:
- release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema-v15 backup `academiccloud-pre-prod06a-20260818T073533Z.sqlite`, SHA-256 `cdc2aec14888d04172bce4555dd6d17f10b5fb7c45efa9c7133070ce4f5bf7c4`;
- age ciphertext SHA-256 `8349ef5e90e72ff763d7730aadd98df56600e091f431a2c07d2b5a432eda8bf6`, verified off-host at private backup commit `9c8f4503e48e55ea7b65aebe35dd242e878c95e8`.

No continuing authority exists for production mutation, visible test-data cleanup/permanent deletion, `PROD-03C2`, reboot/autostart/infrastructure changes, main merge, OCR/text extraction, full-text indexing, embeddings, retrieval, RAG, external metadata services, ISBN APIs, web lookup, or AI extraction.

## Completed Milestones Relevant to This Round

- `RF-AUDIT01` — bounded governance/security audit without research surveillance.
- `RF-OWNERSHIP01` — explicit `account | library` ownership domains and separate provenance.
- `RF-DOMAIN01` — stable Scholarly Record / Artifact / Artifact Version identities.
- `RF-LIBRARY01` — Library ownership/membership/holdings foundation.
- `RF-LIBRARY02` — guarded contribution review and ownership promotion.
- `RF-SHAREDDEFAULT01` — canonical default `资料库`, automatic active-account access, Member pending intake, Owner direct admission and preserved private overlays.
- `L2-CREDENTIALRESET01` — Owner-assisted digest-only one-time credential reset and retired self-service password route.
- `L1-UX05` — canonical shell/admin hierarchy and stale-state recycle safety.
- `PROD-06A` — production release `855b63c…`, schema v17, transition and focused acceptance green.

## Separate Parked Production Work

`PROD-03C2` permanent-delete confirmation remains a separate Owner gate. The current catalogue repair may expose normal recoverable `移入回收站` behavior, but it must not bypass lifecycle semantics or permanently delete production data.