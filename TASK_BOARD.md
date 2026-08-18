# AcademicCloud Task Board

**Last reconciled:** 2026-08-19

## Current Phase

**RF-FRONTMATTEROCR01 development is complete and green at schema v20/history 001–020. Production remains exact repaired release `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` at schema v19/history 001–019. The next authorized steps are one narrow workflow clarification and RF-TRANSFER01 development; production remains untouched until the final combined artifact gate passes.**

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
| RF-FRONTMATTEROCR01 | `tasks/done/RF-FRONTMATTEROCR01.md` | Exact first-15/last-5 native-text-first local OCR fallback with migration-020 provenance, bounded Tesseract adapter, review-only metadata evidence, and preserved PROD-08R runtime repair |

Current execution boundary:

```text
Failed artifact run 32168164654   ← FAILED CLOSED BEFORE UPLOAD / PRODUCTION
→ exact PDF.js/canvas runtime repair f62766c…
→ artifact run 32171340265 independently green
→ fresh v18 rollback backup and off-host publication
→ final app + database cutover to f62766c… / v19 / 001–019
→ PROD-08R PASS / CLOSED
→ RF-FRONTMATTEROCR01 PASS / CLOSED in development; production unchanged
→ workflow proportionality clarification
→ RF-TRANSFER01
→ exact combined artifact gate
→ bounded final deployment and reconciliation
→ STOP
```

## Authorized Next / Parked

| Order | Task / direction | State |
|---:|---|---|
| 1 | Workflow proportionality clarification | Authorized next; workflow-only, no product/schema change |
| 2 | RF-TRANSFER01 | Authorized after the workflow clarification; true multipart upload and standards-based Range download resume |
| 3 | Final combined artifact/deployment | Authorized only after OCR and transfer development checkpoints are closed and the exact artifact jobs are green |
| 4 | RF-SEARCH01 | Preserved metadata/name search card; not authorized |
| 5 | Remaining Pre-OCR queue | Preserved cards; requires a new Owner continuation |
| 6 | Whole-document extraction / full-text / retrieval / RAG | Future; prohibited in this objective |
| 7 | Infrastructure-policy repair | Separate production/operations gate; not authorized |
| 8 | STOP | Required after final production reconciliation |

RF-FRONTMATTEROCR01 authorizes only the completed bounded local/offline fallback. RF-SEARCH01, the later Pre-OCR queue, whole-document OCR/extraction, external lookup, and AI extraction remain durable future scope.

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

Production integrity is `ok`, foreign-key violations are zero, loopback/public health and readiness are green, one loopback-only API listener is present, service restart count is stable at zero, public assets match the immutable release, and migration 020/OCR/search/RAG residue is absent. This remains the durable starting production truth; development migration 020 has not been applied. Synthetic destructive acceptance was skipped safely because no uniquely owned run-created target existed; no task-owned synthetic residue exists.

The rollback pair is exact prior application `bc5788633e0295744905b4ae2dcdfcc5d97635bf` plus schema-v18 backup `academiccloud-pre-prod08r-20260818T184801Z.sqlite` (SHA-256 `338d245d0e0aeb7fec063df069e0750bf3830aceedf32a0f4aad716fb868453b`), encrypted off-host in private commit `a7369933f31af7839bc833d3d24d30688504276d`. Application rollback without the paired database restore is prohibited.

`PROD-03C2` remains parked only as a possible future real production confirmation/operations window. No production contact is authorized during development. The later bounded final deployment may apply only the exact combined release and repository-authorized pending migrations after all artifact gates pass; it does not authorize destructive use of pre-existing resources, incident-database inspection, infrastructure-policy changes, main merge, RF-SEARCH01, whole-document extraction, full-text indexing/search, embeddings, retrieval, RAG, external metadata services, ISBN APIs, web lookup, AI extraction, or unrelated cleanup.

## Next Action

Publish and verify the RF-FRONTMATTEROCR01 closure checkpoint, reconcile the narrow workflow proportionality clarification, then create/activate RF-TRANSFER01. Do not contact production.
