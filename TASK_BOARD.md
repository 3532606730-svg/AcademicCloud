# AcademicCloud Task Board

**Last reconciled:** 2026-08-18

## Current Phase

**`L1-UX06 — Canonical Catalogue Presentation Repair` is complete and independently green after its bounded Owner-review closure repair. Repository execution is stopped for Owner/ChatGPT review. Production remains exact release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017 and was never contacted by this task.**

The canonical shared-corpus authority and catalogue presentation/lifecycle repair are green: root `资料库` uses one established catalogue table for holdings and Owner-managed rows, restores file badges/actions, and provides a manager-only Library-domain recycle → Recycle list → CAS restore lifecycle without widening Member authority or exposing Library permanent delete.

Verification remains proportionate: changed-risk tests and focused independent review only. Do not replay PROD-05A/PROD-06A or broad historical production acceptance.

## Doing

None. The authorized L1-UX06 run is complete and stopped.

## Ready — Preserved, Not Started

| Order | Task | Task card | Bounded result |
|---:|---|---|---|
| 1 | RF-META01 | `tasks/ready/RF-META01.md` | Canonical metadata/templates and `资料详情`; original filename retained as detail/provenance |
| 2 | RF-METASUGGEST01 | `tasks/ready/RF-METASUGGEST01.md` | Bounded Chinese/English title/copyright/CIP/colophon + embedded-metadata + filename evidence suggestions; source/page/confidence visible; OCR deferred |
| 3 | RF-SEARCH01 | `tasks/ready/RF-SEARCH01.md` | Authority-scoped catalogue name/metadata search field; no OCR/full-text claim |
| 4 | STOP | — | Independent Owner/ChatGPT review before any later Pre-OCR card or production gate |

Current execution boundary:

```text
L1-UX06   ← DONE
→ STOP for Owner/ChatGPT review
```

The listed Ready cards remain durable future scope; this run did not start them. Owner review/continuation is required before selecting RF-META01. Completing any repository card never authorizes production deployment.

## Bibliographic Suggestion Contract — Later in This Round

ADR-025 governs RF-METASUGGEST01 after L1-UX06 and RF-META01. For PDFs with a usable existing text layer, default discovery is first 15 pages + last 5 pages and may classify title/copyright/CIP/colophon/front-matter evidence. Every proposal is evidence-backed and requires authorization before becoming canonical. Pure image-only PDFs return `OCR deferred`; no OCR, AI extraction, external catalogue lookup or network enrichment is authorized.

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

Ordinary Members do not gain shared folder/canonical-metadata/destructive corpus authority merely because they can contribute. `Scholarly Record`, `Artifact`, `Artifact Version`, ownership domains, and audit tables remain internal concepts; normal UI uses `资料` / `资料详情`.

## Parked Pre-OCR Queue After This Round

After STOP, preserved later order begins:

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

Starting any parked card requires a new Owner decision after this four-card review.

## Production State and Gate

Production is exact release `855b63c49f12f3375972774e7bc7385088b0495e` at schema v17/history 001–017. `PROD-05A` and `PROD-06A` are closed and must not be rerun.

Current rollback pair:
- release `25cdab1d0e2188bf36d1324b1e53972a1f9cda8e`;
- schema-v15 backup `academiccloud-pre-prod06a-20260818T073533Z.sqlite`, SHA-256 `cdc2aec14888d04172bce4555dd6d17f10b5fb7c45efa9c7133070ce4f5bf7c4`;
- age ciphertext SHA-256 `8349ef5e90e72ff763d7730aadd98df56600e091f431a2c07d2b5a432eda8bf6`, verified off-host at private backup commit `9c8f4503e48e55ea7b65aebe35dd242e878c95e8`.

No continuing authority exists for production mutation, visible test-data cleanup/permanent deletion, `PROD-03C2`, infrastructure changes, main merge, OCR/text extraction, full-text indexing, embeddings, retrieval, RAG, external metadata services, ISBN APIs, web lookup, or AI extraction.

## Completed Milestones Relevant to This Round

RF-AUDIT01, RF-OWNERSHIP01, RF-DOMAIN01, RF-LIBRARY01, RF-LIBRARY02, RF-SHAREDDEFAULT01, L2-CREDENTIALRESET01, L1-UX03/04/05/06, PROD-05A and PROD-06A are completed baselines. Final L1-UX06 record: `tasks/done/L1-UX06.md`.

## Separate Parked Production Work

`PROD-03C2` permanent-delete confirmation remains a separate Owner gate. L1-UX06 may expose normal recoverable `移入回收站` behavior only; it must not bypass lifecycle semantics or permanently delete production data.
