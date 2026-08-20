# OCR-METADATA-GHA01 — Asynchronous Front-Matter OCR and Metadata Suggestions

## State
COMPLETE IN DEVELOPMENT — STOP for Owner review before production cutover.

## Goal
Migrate the existing heavy front-matter OCR/Metadata Suggestion execution from
the Core request process to durable asynchronous Compute while preserving its
bounded academic and authority semantics.

## Delivered

- Existing PDF.js, page selection, native-text preference, native canvas,
  Tesseract, bilingual extraction, provenance, fixtures, and regression
  expectations moved from `backend` to standalone `compute`.
- Core retains filename/lightweight rules, authorization, identity, source/object
  revalidation, candidate persistence/review, and canonical metadata acceptance.
- Metadata Suggestion POST returns HTTP 202 with durable job identity promptly;
  no user request waits for OCR.
- Existing UI adds only queued, processing, succeeded, and failed states, restores
  the latest job after reload, and stops polling on terminal state.
- The worker loads/cleans one selected page at a time and releases page, canvas,
  PNG, and child-process buffers before advancing.
- Dedicated Compute CI owns PDF.js/canvas, pinned Tesseract construction,
  realistic OCR E2E, memory evidence, and execution. Core artifact verification
  forbids the heavy modules and accepts only Argon2/better-sqlite3 native modules.
- Local HTTP vertical slice proves Core job creation → adapter identity → worker
  Range read/extraction → authenticated callback → persisted candidate → existing
  Core canonical acceptance.

## Memory evidence

Five identical 20-page runs with two rendered OCR fallback pages and a
deterministic OCR fixture (Node/PDF.js/native-canvas RSS, not a Linux Tesseract
child-process measurement):

```text
CLEAN_START_RSS=248520704
PEAK_RSS=501194752
POST_JOB_RSS=476028928
RUN1_TO_RUN5_POST_RSS_DRIFT=1134592
RUNS=5
```

The large first-run residency is isolated in one clean process/job. Repeated
post-run RSS is stable rather than growing with each identical run.

## Verification checkpoint

```text
BACKEND_TESTS=326/326 PASS
FRONTEND_TESTS=247/247 PASS
COMPUTE_TESTS=52 PASS / 0 FAIL / 1 EXPECTED LOCAL-RUNTIME SKIP
CONTRACT_TESTS=1/1 PASS
COMPILED_ACCEPTANCE=PASS / schema 22 in disposable development database
BUILD=PASS
```

The dedicated GitHub worker is the release-local Tesseract/realistic-OCR gate;
the local expected skip records that no release-local Linux runtime is installed
on the Windows development machine.

## Non-goals preserved

No production deployment/restart/memory-limit change, production migration,
credential change, OSS/RAM/CORS mutation, Search/RF-SEARCH01 change, full Activity
Center, whole-document OCR, indexing, embeddings, retrieval, RAG, or automatic
canonical metadata write occurred.

## Next

Owner reviews the development checkpoint and, if accepted, separately authorizes
the exact production backup/migration/secrets/environment/artifact/cutover plan
in ADR-031. Do not progress automatically.
