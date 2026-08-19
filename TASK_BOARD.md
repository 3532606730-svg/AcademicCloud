# AcademicCloud Task Board

**Last reconciled:** 2026-08-19

## Current Phase

**PROD-09A is the sole active Owner-authorized bounded production hotfix for the metadata-suggestion `.anonymous` regression. Production is expected to remain on exact PROD-09 release `9d2fc9b08e2e02c821ef357f149ed928510c2825` at schema v21/history 001–021 until the exact new green artifact is ready. No migration or unrelated product work is authorized.**

## Doing

| Task | Task card | Bounded objective |
|---|---|---|
| PROD-09A | `tasks/doing/PROD-09A.md` | Diagnose and hotfix the exact metadata-suggestion runtime failure and raw internal-error leak; deploy a new exact artifact without migrations; reconcile evidence; STOP |

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
| RF-TRANSFER01 | `tasks/done/RF-TRANSFER01.md` | Provider-backed 8 MiB/640-part multipart resume with server CAS state, completed-part reuse, exact abandonment, legacy compatibility, and browser-native Range download resume; development schema v21/history 001–021 |
| PROD-09 | `tasks/done/PROD-09.md` | Independently verified release-local Tesseract artifact, fresh encrypted off-host v19 rollback backup, exact migrations 020–021, immutable v21 cutover, and bounded production acceptance |

Current execution boundary:

```text
Failed artifact run 32168164654   ← FAILED CLOSED BEFORE UPLOAD / PRODUCTION
→ exact PDF.js/canvas runtime repair f62766c…
→ artifact run 32171340265 independently green
→ fresh v18 rollback backup and off-host publication
→ final app + database cutover to f62766c… / v19 / 001–019
→ PROD-08R PASS / CLOSED
→ RF-FRONTMATTEROCR01 PASS / CLOSED in development; production unchanged
→ workflow proportionality clarification PASS
→ RF-TRANSFER01 PASS / CLOSED in development
→ exact combined artifact gate PASS (`32218607374`, source `9d2fc9b…`)
→ fresh schema-v19 rollback backup and independent off-host verification
→ exact migrations 020–021 and immutable cutover to `9d2fc9b…` / v21 / 001–021
→ OCR/transfer/Range/health/readiness changed-risk acceptance PASS
→ PROD-09 PASS / CLOSED
→ STOP
```

## Authorized Next / Parked

| Order | Task / direction | State |
|---:|---|---|
| 1 | PROD-09A | Active bounded production hotfix |
| 2 | STOP | Required after PROD-09A evidence is closed and synchronized |
| 3 | RF-SEARCH01 | Preserved metadata/name search card; resume only after Owner review |
| 3 | Remaining Pre-OCR queue | Preserved cards; requires a new Owner continuation |
| 4 | Whole-document extraction / full-text / retrieval / RAG | Future; prohibited in this objective |
| 5 | Infrastructure-policy repair | Separate production/operations gate; not authorized |

RF-FRONTMATTEROCR01 authorizes only the completed bounded local/offline fallback. RF-TRANSFER01 is closed in development and adds no production authority. RF-SEARCH01, the later Pre-OCR queue, whole-document OCR/extraction, external lookup, and AI extraction remain durable future scope.

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
PRODUCTION=9d2fc9b08e2e02c821ef357f149ed928510c2825
PREVIOUS_RELEASE=f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7
PRODUCTION_SCHEMA=v21 / migrations 001–021
RF_METASUGGEST_DEPLOYED=true
L1_UX07_DEPLOYED=true
OCR_DEPLOYED=true
RF_TRANSFER_DEPLOYED=true
ROLLBACK_USED=false
```

Production integrity is `ok`, foreign-key violations are zero, loopback/public health and readiness are green, one loopback-only API listener is present, service restart count is stable at zero, and public assets match the immutable release. Exact migrations 020–021 are applied; release-local Tesseract 5.5.3 with `chi_sim`, `chi_tra`, and `eng`, true multipart upload/resume, and Range download resume passed bounded acceptance. Synthetic destructive acceptance was skipped safely because no uniquely owned run-created target existed; no task-owned synthetic residue exists.

The rollback pair is exact prior application `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` plus fresh schema-v19 backup `academiccloud-pre-prod09-20260819T061155Z.sqlite` (SHA-256 `21af5882483c21cfa65854fa592a7805b029b4f31c06c598114d161412c36436`), encrypted off-host in private commit `702695ee9bfd65ee69c2f8cb6c8f105bd4320755`. Application rollback without the paired database restore is prohibited.

`PROD-03C2` remains parked only as a possible future real production confirmation/operations window. PROD-09 did not authorize destructive use of pre-existing resources, incident-database inspection, infrastructure-policy changes, main merge, RF-SEARCH01, whole-document extraction, full-text indexing/search, embeddings, retrieval, RAG, external metadata services, ISBN APIs, web lookup, AI extraction, or unrelated cleanup. Any further production or product work requires a new explicit Owner authorization.

## Next Action

Complete and close PROD-09A, publish and synchronize its exact evidence checkpoint, then STOP. Resume RF-SEARCH01 only after Owner review.
