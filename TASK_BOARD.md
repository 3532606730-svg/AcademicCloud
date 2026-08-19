# AcademicCloud Task Board

**Last reconciled:** 2026-08-19

## Current Phase

**RF-METASUGGEST-HARDEN01 is PASS/CLOSED. Production runs exact immutable release `604cb8daf310696353e99c30ce7a924dc71ef9d2` (previous `a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a`) at unchanged schema v21/history 001–021; production was NOT touched for search. RF-SEARCH01 development is complete and green (development only); STOP FOR OWNER REVIEW before any search production.**

## Doing

| Task | Task card | Bounded objective |
|---|---|---|
| RF-SEARCH01 | `tasks/doing/RF-SEARCH01.md` | Bounded authority-safe metadata/name catalogue search; development complete, awaiting Owner review |

## Done

| Task | Task card | Bounded result |
|---|---|---|
| RF-METASUGGEST-HARDEN01 | `tasks/done/RF-METASUGGEST-HARDEN01.md` | A–L realistic fixture corpus, bounded random-access PDF reading, parser hardening, release-local Tesseract E2E, no-persistence private smoke, and same-schema release `604cb8d…` |
| RF-META01 | `tasks/done/RF-META01.md` | Canonical metadata, templates, minimal authorities, exact holding-scoped CAS, and ordinary `资料详情` |
| RF-METASUGGEST01 | `tasks/done/RF-METASUGGEST01.md` | Deterministic bounded bilingual text-layer suggestions with explicit manager acceptance; deployed by PROD-08R |
| PROD-07A | `tasks/done/PROD-07A.md` | Exact RF-META01 release and migration 018 deployed to production |
| PROD-07B | `tasks/done/PROD-07B.md` | Bounded production hotfix for row alignment, folder recycle, and global-Owner-only account/Library permanent-delete lifecycle |
| L1-UX07 | `tasks/done/L1-UX07.md` | v19 forward-port plus scope-aware selection, capability actions, coherent Favorites/Recycle, exact fixture suppression, and future acceptance-residue prevention; deployed by PROD-08R |
| PROD-08R | `tasks/done/PROD-08R.md` | Repaired the PDF.js Linux artifact runtime, independently verified the immutable package, deployed v19/001–019 with fresh off-host rollback protection, and completed changed-risk acceptance |
| RF-FRONTMATTEROCR01 | `tasks/done/RF-FRONTMATTEROCR01.md` | Exact first-15/last-5 native-text-first local OCR fallback with migration-020 provenance, bounded Tesseract adapter, review-only metadata evidence, and preserved PROD-08R runtime repair |
| RF-TRANSFER01 | `tasks/done/RF-TRANSFER01.md` | Provider-backed 8 MiB/640-part multipart resume with server CAS state, completed-part reuse, exact abandonment, legacy compatibility, and browser-native Range download resume; development schema v21/history 001–021 |
| PROD-09 | `tasks/done/PROD-09.md` | Independently verified release-local Tesseract artifact, fresh encrypted off-host v19 rollback backup, exact migrations 020–021, immutable v21 cutover, and bounded production acceptance |
| PROD-09A | `tasks/done/PROD-09A.md` | Repaired the exact metadata-suggestion receiver/runtime error and raw-error leak, deployed exact same-schema artifact `a5e2bc21…` without migrations, and completed non-mutating acceptance |

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
→ exact receiver/error-boundary hotfix `a5e2bc21…`
→ artifact run `32234343552` independently green
→ immutable no-migration cutover at unchanged v21 / 001–021
→ authenticated suggestion POST 200, no `.anonymous`/raw-error exposure, canonical metadata unchanged
→ PROD-09A PASS / CLOSED
→ RF-METASUGGEST-HARDEN01 recovered first slice committed+pushed at 9e0414e; whole-pipeline hardening and conditional same-schema release — ACTIVE
→ STOP before RF-SEARCH01
```

## Authorized Next / Parked

| Order | Task / direction | State |
|---:|---|---|
| 1 | STOP | Required now: RF-SEARCH01 development is complete; await Owner review before any search production |
| 2 | RF-SEARCH01 production | Requires a new explicit Owner production authorization (not granted by Round 2) |
| 3 | Remaining Pre-OCR queue | Preserved cards; requires a new Owner continuation |
| 4 | Whole-document extraction / full-text / retrieval / RAG | Future; prohibited without new explicit authorization |
| 5 | Infrastructure-policy repair | Separate production/operations gate; not authorized |

RF-METASUGGEST-HARDEN01 is PASS/CLOSED. RF-SEARCH01 development is complete and green; production for search remains a later explicit decision. RF-FRONTMATTEROCR01 and RF-TRANSFER01 remain closed; the later Pre-OCR queue, whole-document OCR/extraction, external lookup, and AI extraction remain durable future scope.

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
PRODUCTION=604cb8daf310696353e99c30ce7a924dc71ef9d2
PREVIOUS_RELEASE=a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a
PRODUCTION_SCHEMA=v21 / migrations 001–021
PROD09A_CLOSED=true
RF_METASUGGEST_HARDENED=true
L1_UX07_DEPLOYED=true
OCR_DEPLOYED=true
RF_TRANSFER_DEPLOYED=true
ROLLBACK_USED=false
```

Production integrity is `ok`, foreign-key violations are zero, loopback/public health and readiness are green, one loopback-only API listener is present, service restart count is stable at zero, and public assets match the immutable release. Exact migrations 001–021 are applied with unchanged checksums; release-local Tesseract 5.5.3 with `chi_sim`, `chi_tra`, and `eng`, bounded random-access PDF inspection, true multipart upload/resume, and Range download resume passed. The A–L fixture corpus, release-local real-Tesseract E2E, and no-persistence private smoke are green; no candidate was accepted and canonical metadata was not mutated.

The immediate same-schema rollback target is exact prior application `a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a` against unchanged v21; RF-METASUGGEST-HARDEN01 rollback was not used. The older deep rollback remains exact application `f62766cd96c3f1e07bd32e5c1ced99a3ebbfdce7` plus fresh schema-v19 backup `academiccloud-pre-prod09-20260819T061155Z.sqlite` (SHA-256 `21af5882483c21cfa65854fa592a7805b029b4f31c06c598114d161412c36436`), encrypted off-host in private commit `702695ee9bfd65ee69c2f8cb6c8f105bd4320755`; never run that application against live v21.

`PROD-03C2` remains parked. RF-SEARCH01 (Owner Round 2) authorizes only a development-only bounded metadata/name catalogue search path; it does not authorize production deployment, migrations, index servers, full-text/OCR search, query history, external lookup, or AI extraction.

## Next Action

RF-SEARCH01 development is complete and green. Reconcile the development checkpoint, push, prove local/tracking/remote equality with a clean worktree, then STOP FOR OWNER REVIEW before any RF-SEARCH01 production.
