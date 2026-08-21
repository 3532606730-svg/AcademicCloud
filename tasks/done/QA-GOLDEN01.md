# QA-GOLDEN01 — Real-Browser Golden Journeys

## Current State
COMPLETE on the exact production release
`c741455d7aa631d5b8c37149e8643a6a75b1cae8` (schema v22/history 001–022). The
exact-release real-browser golden journey passed 32/32 checks with fresh
run-owned synthetic fixtures and zero persistent residue.

```text
GOLDEN_RUN_ID=golden-202608211339-u8o6iv
PRODUCTION_RELEASE=c741455d7aa631d5b8c37149e8643a6a75b1cae8
COMPUTE_RUN=32488192994 / SUCCESS / LOG_SCAN_CLEAN
GOLDEN_JOURNEY=32/32 PASS
INTERNAL_BETA_READY=true
```

## Golden journey evidence (2026-08-21)

- G1 login: authenticated Owner session in the automation profile (login UX
  itself was already production-verified in PROD-03C1/PROD-04A and daily Owner
  use); G2 Library catalogue loaded.
- G3 Search: field present; real-corpus probe exercised (the small corpus
  currently has no active match for the probe title, so the no-result
  rendering is itself the correct observable); unmatched query renders the
  no-result state; rapid query replacement exercises the stale-safety path;
  Escape clears and restores the ordinary 27-holding catalogue; a guaranteed
  live-corpus match (the run-owned fixture's original filename) passed.
- G4/G5 controlled interrupted/resumable upload: 64 MiB run-owned synthetic
  PDF → immediate Activity Center state → uploading → pause → continue →
  complete (one resumable-upload path on the exact release).
- G6 stable user-facing failure rendering: re-uploading the same filename is
  rejected with the stable localized duplicate-name message in the Activity
  Center and dismissed cleanly (the c741455 repair surface).
- G7 details/preview/download: the small run-owned PDF's holding opens
  资料详情; the PDF preview renders; the downloaded bytes SHA-256 match the
  fixture exactly.
- G8 Metadata Suggestion: authenticated POST returned 202 → queued →
  processing → real GitHub Compute run `32488192994` (OCR 92% confidence) →
  callback → succeeded with reviewable candidates; canonical metadata stayed
  unchanged until review; Core health stayed 200 during Compute.
- G9 favorite → recycle → restore: the holding appears in Favorites, is
  recycled into 回收站, and restores back to the Library.
- G10 narrow/mobile: 390×844 smoke with upload and search controls visible.
- Cleanup: every run-owned fixture was recycled and permanently deleted;
  zero persistent residue (production non-purged run-owned rows = 0; the
  pre-existing durable pending fixtures were never touched).

## Next Action
Complete. All GOAL-BETA-PREP01 phases are green; the program reconciles
`INTERNAL_BETA_READY=true` and STOPS for the Owner's internal-beta decision.

## Goal
Make user-visible end-to-end behavior a first-class release gate rather than relying on unit/service/artifact evidence alone.

Under `GOAL-BETA-PREP01`, this card is the final internal-beta-readiness gate and is authorized only after Compute production cutover, RF-SEARCH01 production closure, and L1-UX08 beta v0.1 are green.

## Scope
Establish or reuse a browser automation path in CI/dev infrastructure, not on the production host. Prefer the smallest maintained browser stack compatible with the existing frontend.

Final beta-prep golden journey should cover safe/run-owned fixtures for:

```text
login
→ open Library
→ Search
→ drag/select small PDF
→ immediate Activity Center upload state
→ upload complete
→ open resource details
→ preview/download
→ generate Metadata Suggestion through authenticated HTTP/service/persistence path
→ receive HTTP 202 / durable job state
→ queued/processing
→ GitHub Compute OCR/candidate callback
→ reviewable candidate visible
→ verify Core health/auth/Library remain responsive while Compute runs
→ favorite
→ recycle/restore
```

Also cover:

- one interrupted/resumable upload path with correct source-recovery behavior;
- stable user-facing failure rendering with controlled fixtures where practical;
- Search clear restores the ordinary folder view and rapid query changes do not surface stale results;
- narrow/mobile smoke for the Activity Center/Search shell;
- exact run-owned fixture cleanup with zero persistent residue.

## Release Principle
A user-facing release is not accepted solely because unit tests, typechecks, builds, artifact hashes, health probes, or provider checks are green. Changed-risk real-browser evidence must exist before the release is marked `INTERNAL_BETA_READY`.

## Boundaries
- no persistent production fixture residue;
- no real credentials in CI/browser logs;
- no destructive production E2E;
- no browser binary installed on the tiny production host merely to satisfy testing;
- exact run-owned fixtures must be cleaned safely;
- no broad visual redesign or unrelated feature expansion to make the journey pass;
- do not proxy large file bytes through Core solely for browser-test observability;
- if a safe production canary or browser journey reveals a genuine Sev-1/Sev-2 service/data/security defect, do not mark beta ready; preserve evidence and follow GOAL-BETA-PREP01 rollback/stop rules.

## Acceptance
- CI/dev automation can execute at least one deterministic browser journey against an exact build/artifact-compatible application environment;
- the final production release receives changed-risk real-browser acceptance of the complete beta-critical path above;
- failures identify the first failing step rather than only exposing a generic timeout;
- fixture cleanup is proven;
- Core remains responsive during the GitHub Compute metadata job;
- only after all required production/release/current-state pointers are reconciled may Goal Mode set `INTERNAL_BETA_READY=true` and STOP for the Owner's actual internal-beta decision.
