# AcademicCloud Task Board

**Last reconciled:** 2026-08-19

## Current Phase

**PROD-08R is complete and closed. Exact repaired release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` is deployed at schema v19/history 001–019. RF-METASUGGEST01 and L1-UX07 are deployed, PROD-07B behavior is preserved, rollback was used, and execution is stopped.**

## Doing

None.

## Done

| Task | Task card | Bounded result |
|---|---|---|
| RF-META01 | `tasks/done/RF-META01.md` | Canonical metadata, templates, minimal authorities, exact holding-scoped CAS, and ordinary `资料详情` |
| RF-METASUGGEST01 | `tasks/done/RF-METASUGGEST01.md` | Deterministic bounded bilingual text-layer suggestions with explicit manager acceptance; deployed by PROD-08R |
| PROD-07A | `tasks/done/PROD-07A.md` | Exact RF-META01 release and migration 018 deployed to production |
| PROD-07B | `tasks/done/PROD-07B.md` | Bounded production hotfix for row alignment, folder recycle, and global-Owner-only account/Library permanent-delete lifecycle |
| L1-UX07 | `tasks/done/L1-UX07.md` | v19 forward-port plus scope-aware selection, capability actions, coherent Favorites/Recycle, exact fixture suppression, and future acceptance-residue prevention; deployed by PROD-08R |
| PROD-08R | `tasks/done/PROD-08R.md` | Repaired the PDF.js Linux artifact runtime, independently verified the immutable package, deployed v19/001–019 with fresh off-host rollback protection, and completed changed-risk acceptance |

Current execution boundary:

```text
Failed artifact run 32168164654   ← FAILED CLOSED BEFORE UPLOAD / PRODUCTION
→ exact PDF.js/canvas runtime repair f62766c…
→ artifact run 32171340265 independently green
→ fresh v18 rollback backup and off-host publication
→ final app + database cutover to f62766c… / v19 / 001–019
→ PROD-08R PASS / CLOSED
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
| 9 | STOP | Required after PROD-08R |

RF-SEARCH01 and the later Pre-OCR queue remain durable future scope. RF-METASUGGEST01 did not authorize OCR, external lookup, or AI extraction, and PROD-08R did not broaden that boundary.

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

```text
PRODUCTION=f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7
PREVIOUS_RELEASE=bc5788633e0295744905b4ae2dcdfcc5d97635bf
PRODUCTION_SCHEMA=v19 / migrations 001–019
RF_METASUGGEST_DEPLOYED=true
L1_UX07_DEPLOYED=true
ROLLBACK_USED=true
```

Production integrity is `ok`, foreign-key violations are zero, loopback/public health and readiness are green, one loopback-only API listener is present, service restart count is stable at zero, public assets match the immutable release, and migration 020/OCR/search/RAG residue is absent. Synthetic destructive acceptance was skipped safely because no uniquely owned run-created target existed; no task-owned synthetic residue exists.

The rollback pair is exact prior application `bc5788633e0295744905b4ae2dcdfcc5d97635bf` plus schema-v18 backup `academiccloud-pre-prod08r-20260818T184801Z.sqlite` (SHA-256 `338d245d0e0aeb7fec063df069e0750bf3830aceedf32a0f4aad716fb868453b`), encrypted off-host in private commit `a7369933f31af7839bc833d3d24d30688504276d`. Application rollback without the paired database restore is prohibited.

`PROD-03C2` remains parked only as a possible future real production confirmation/operations window. No authority exists for more production contact or mutation, destructive use of pre-existing resources, incident-database inspection, infrastructure-policy changes, main merge, migration 020, OCR, RF-SEARCH01, whole-document extraction, full-text indexing/search, embeddings, retrieval, RAG, external metadata services, ISBN APIs, web lookup, AI extraction, or unrelated cleanup.

## Next Action

STOP. Do not select another task without new explicit Owner authorization.
