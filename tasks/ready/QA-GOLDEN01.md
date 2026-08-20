# QA-GOLDEN01 — Real-Browser Golden Journeys

## Goal
Make user-visible end-to-end behavior a first-class release gate rather than relying on unit/service/artifact evidence alone.

## Scope
Establish a browser automation path in CI/dev infrastructure, not on the production host. Prefer the smallest maintained browser stack compatible with the existing frontend.

Core golden journey should cover safe fixtures for:

```text
login
→ open Library
→ drag/select small PDF
→ immediate upload activity
→ upload complete
→ open resource details
→ generate metadata suggestion through authenticated HTTP/service/persistence path
→ preview/download
→ search
→ favorite
→ recycle/restore
```

Also cover interrupted/resumable upload and stable error rendering with controlled fixtures.

## Release Principle
A user-facing release is not accepted solely because unit tests, typechecks, builds and artifact hashes are green. Changed-risk real-browser evidence must exist before cutover where practical.

## Boundaries
- no persistent production fixture residue;
- no real credentials in CI logs;
- no destructive production E2E;
- no browser binary installed on the tiny production host merely to satisfy testing;
- exact run-owned fixtures must be cleaned safely.

## Acceptance
CI can execute at least one deterministic browser journey against an exact build/artifact-compatible application environment, and failures identify the step rather than only exposing a generic timeout.
