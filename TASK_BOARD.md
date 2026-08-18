# AcademicCloud Task Board

**Last reconciled:** 2026-08-19

## Current Phase

**PROD-08R is active to diagnose and minimally repair the failed extracted Linux x64 / Node 24 v19 artifact. Failed run `32168164654` stopped before artifact upload or production mutation. Production must not be contacted until the exact repaired commit passes both the build/runtime-verification job and independent fresh-runner artifact-download verification.**

The catalogue now preserves account versus Library resource scope through selection, capabilities, Favorites, Recycle, restore, and permanent-delete routing. ADR-028 preserves global-Owner-only permanent-delete authority, Library exclusivity revalidation at the destructive transaction boundary, and fail-closed protection for shared objects and unrelated lineage. No production contact or mutation occurred in L1-UX07.

## Doing

| Task | Task card | Bounded result |
|---|---|---|
| PROD-08R | `tasks/doing/PROD-08R.md` | Active: bounded diagnostics, exact Linux runtime reproduction, minimum artifact repair, complete immutable verification, then gated v19 deployment resume |

## Done

| Task | Task card | Bounded result |
|---|---|---|
| RF-META01 | `tasks/done/RF-META01.md` | Canonical metadata, templates, minimal authorities, exact holding-scoped CAS, and ordinary `资料详情` |
| RF-METASUGGEST01 | `tasks/done/RF-METASUGGEST01.md` | Deterministic bounded bilingual text-layer suggestions with explicit manager acceptance; undeployed |
| PROD-07A | `tasks/done/PROD-07A.md` | Exact RF-META01 release and migration 018 deployed to production |
| PROD-07B | `tasks/done/PROD-07B.md` | Bounded production hotfix for row alignment, folder recycle, and global-Owner-only account/Library permanent-delete lifecycle |
| L1-UX07 | `tasks/done/L1-UX07.md` | v19 forward-port plus scope-aware selection, capability actions, coherent Favorites/Recycle, exact fixture suppression, and future acceptance-residue prevention |

Current execution boundary:

```text
Failed run 32168164654   ← STOPPED BEFORE UPLOAD / PRODUCTION
→ PROD-08R artifact runtime repair   ← ACTIVE
→ both production artifact workflow jobs green
→ revalidate live v18 truth and resume only the authorized v19 deployment
→ STOP
```

## Ready / Parked — Preserved, Not Authorized

| Order | Task / direction | State |
|---:|---|---|
| 1 | RF-FRONTMATTEROCR01 | Future bounded front-matter OCR only; not started or authorized |
| 2 | RF-SEARCH01 | Preserved metadata/name search card; not started or authorized |
| 3 | Remaining Pre-OCR queue | Preserved cards; requires a new Owner continuation |
| 4 | Whole-document extraction | Future; prohibited in this checkpoint |
| 5 | Full-text search | Future; prohibited in this checkpoint |
| 6 | Semantic retrieval | Future; prohibited in this checkpoint |
| 7 | RAG | Future; prohibited in this checkpoint |
| 8 | Infrastructure-policy repair | Separate production/operations gate; not authorized |
| 9 | STOP | Required after L1-UX07 |

RF-SEARCH01 and the later Pre-OCR queue remain durable future scope. RF-METASUGGEST01 did not authorize OCR, external lookup, or AI extraction, and L1-UX07 did not broaden that boundary.

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

Ordinary Members do not gain shared folder, canonical-metadata, or destructive corpus authority merely because they can contribute. `Scholarly Record`, `Artifact`, `Artifact Version`, ownership domains, and audit tables remain internal concepts; normal UI uses `资料` / `资料详情`.

## Parked Pre-OCR Queue

The preserved later order remains:

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

Starting any parked card requires a new Owner decision.

## Production State and Gates

Production is exact release `bc5788633e0295744905b4ae2dcdfcc5d97635bf`, previous release `2322169bc33415734d025010c465900c7fbc6bd9`, at schema v18/history 001–018. PROD-07A and PROD-07B are closed; rollback was not used. Migration 019/RF-METASUGGEST01 and L1-UX07 remain undeployed.

The PROD-07B product decision and implementation now own the global-Owner-only permanent-delete rule. `PROD-03C2` remains parked only as a possible future real production confirmation/operations window: no real disposable-object purge, production cleanup, autostart/reboot decision, or infrastructure-policy repair is authorized by repository implementation.

PROD-08R authorizes production contact/deployment only after a completely green immutable artifact. Before that gate, no production contact or mutation is allowed. No authority exists for main merge, destructive use of pre-existing production resources, infrastructure-policy changes, migration 020, OCR work, RF-SEARCH01, whole-document extraction, full-text indexing/search, embeddings, semantic retrieval, RAG, external metadata services, ISBN APIs, web lookup, or AI extraction.

## Next Action

Implement bounded startup diagnostics, reproduce and prove the exact extracted runtime failure, make only the evidence-backed minimum artifact repair, and require both artifact workflow jobs green before any production contact.
