# QA-GOLDEN01 — Real-Browser Golden Journeys

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
