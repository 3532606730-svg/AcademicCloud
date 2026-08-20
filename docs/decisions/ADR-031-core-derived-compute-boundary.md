# ADR-031 — Core Authority and Ephemeral Derived Compute

**Date:** 2026-08-21
**Status:** Accepted and deployed; COMPUTE-PRECUTOVER01 and GOAL-BETA-PREP01 Phase 2 production cutover complete

## Context

The completed front-matter OCR and Metadata Suggestion implementation preserved
the right academic authority boundary, but its heavy execution still ran inside
the single AcademicCloud Core Node.js process. A production Metadata Suggestion
request loaded PDF.js, native canvas rendering, PNG encoding, and Tesseract while
Core was constrained by `MemoryHigh=320MiB` and `MemoryMax=384MiB`. The process
remained alive and no OOM/OOM-kill or restart occurred, but cgroup reclaim blocked
the event loop and stalled unrelated Auth, Library, health, and other requests.

This is a physical execution-boundary problem, not an authorization, metadata,
OCR-algorithm, or scholarly-model rewrite. Existing bounded page selection,
recognition, evidence precedence, provenance, review, and canonical acceptance
semantics remain valid.

## Decision

### Core remains authoritative

AcademicCloud Core continues to own:

- authentication, active-account checks, Library membership and manager authority;
- resource identity, source fingerprinting, and provider-neutral storage authority;
- SQLite and durable job authority;
- filename parsing and other lightweight metadata rules;
- validation and persistence of reviewable derived candidates;
- the existing explicit manager review and canonical metadata CAS write path.

Compute receives no Library role, canonical metadata authority, SQLite access,
OSS credential, object key, permanent signed URL, or authority to mutate object
lifecycle. Its output is bounded derived candidate data only.

### Durable job slice

Development migration 022 adds the smallest SQLite-backed
`derived_compute_jobs` model needed for this slice. Its public lifecycle is:

```text
queued → running → succeeded
queued/running → failed
failed → queued (a new, correlated retry attempt only)
```

Rows retain opaque job/resource/scope identity, kind, state, progress, attempts,
active attempt, timestamps, a source-version fingerprint, idempotency key,
provider receipt, stable safe error code, result reference/digest, and deadline.
Only a SHA-256 digest of an ephemeral callback capability is stored. No dispatch,
bootstrap, storage, signed-URL, or callback secret is persisted.

The source fingerprint makes duplicate requests idempotent for the same resource
revision. Attempt-scoped transition guards, deterministic result digests, and the
existing immutable suggestion-run identity make duplicate execution and identical
callbacks safe; a changed duplicate fails closed. Expired queued/running jobs
become `compute_timeout` through a durable database transition performed by a
bounded maintenance sweep and by normal status reads. Core availability never
depends solely on an event-loop timer.

### Provider-neutral Compute boundary

`@academiccloud/compute-contracts` defines `DerivedComputeDispatcher`, opaque
dispatch identity, stable job/error states, strict candidate provenance, and the
bounded result envelope. Metadata/Library services do not contain GitHub API
logic.

GitHub Actions is the first adapter. Dispatch contains only the configured Git
ref, opaque job ID, opaque attempt ID, and exact non-secret Core origin. The
worker exchanges its environment-scoped bootstrap secret for one authorized
claim. Core revalidates actor, membership, resource revision/fingerprint, and
provider object metadata before issuing:

- one five-minute inline read URL for that exact PDF;
- one attempt-bound callback capability, retained by Core only as a digest;
- one exact callback URL.

The callback revalidates capability, job, attempt, authority, source identity,
object metadata, and a strict result schema before one transaction creates the
reviewable suggestion run and succeeds the job. Canonical metadata remains
unchanged until the existing manager acceptance path succeeds.

### Worker extraction and memory lifecycle

The existing PDF.js page selection, native-text preference, render bounds,
Tesseract adapter, bilingual deterministic extraction, fixtures, and regression
expectations move to the standalone `@academiccloud/compute` workspace. The
worker:

- reads the object through bounded HTTP Range requests;
- retains only page index and bounded derived text from the native-text pass;
- reopens only unusable selected pages, one at a time, for render/OCR;
- calls page cleanup after each use, resets each canvas, and releases transient
  image/output references before the next page;
- passes encoded PNG `Buffer` values directly as `Uint8Array` and avoids an
  unnecessary full copy;
- processes one job in one clean GitHub runner process with concurrency one.

The reproducible five-run local probe exercises the complete 20-page window and
two rendered OCR-fallback pages with a deterministic in-process OCR fixture so
the PDF.js/canvas allocation and cleanup lifecycle is repeatable on the Windows
development host. It does not claim to include a Linux Tesseract child-process
RSS measurement; the dedicated workflow verifies real Tesseract separately and
must record whole-runner resource evidence before production cutover. The local
probe enforces peak Node RSS below 512 MiB and repeat post-run drift below 64
MiB. The observed development checkpoint was
248,520,704-byte clean start, 501,194,752-byte peak, and 476,028,928-byte final
post-job RSS; post-run drift from run one to run five was 1,134,592 bytes. This
shows a substantial one-time PDF/native runtime residency but no proportional
per-run accumulation. The production design nevertheless uses one clean process
per job rather than depending on retained-runtime behavior.

COMPUTE-PRECUTOVER01 preserves that 512 MiB limit for the local-development
profile and adds one explicit provider-specific profile for GitHub-hosted
`ubuntu-24.04`: peak Node RSS must remain below 768 MiB (805,306,368 bytes),
while the five-run post-RSS drift remains below 64 MiB. This is not a Core
service limit and does not change production `MemoryHigh` or `MemoryMax`.
Historical unchanged-Compute hosted peaks of 547,672,064, 549,146,624, and
533,995,520 bytes all fit the provider-specific bound but crossed the old
512 MiB line inconsistently. Exact qualification source `1c3bb10…`, run
`32407660640`, then passed real Tesseract OCR at a 547,860,480-byte Node peak,
538,947,584-byte post-job RSS, and only 225,280 bytes of run-one-to-five
post-RSS drift. The evidence therefore classifies the hosted behavior as
bounded PDF.js/native-canvas/Tesseract first-use high-water rather than
repeating growth. Concurrency one and one clean process per job remain hard
requirements.

### Asynchronous product state

The existing Metadata Suggestion POST now authorizes, persists, dispatches, and
returns HTTP 202 with durable identity promptly. It does not wait for PDF access,
rendering, OCR, or candidate extraction. The existing details surface adds only
the four required states: queued, processing, succeeded, and failed. It restores
the latest job after reload, polls only non-terminal jobs, and loads the existing
suggestion run after success. The full Activity Center remains out of scope.

### Separate timeout controls

- Core owns a two-hour durable end-to-end job deadline and stale-job
  classification.
- The GitHub job has a 45-minute workflow limit.
- The final claim/compute/callback step has a five-minute workflow limit.
- The worker has a 120-second abort boundary; the existing per-page and total OCR
  command limits remain five and 25 seconds.
- Source and callback capabilities are minted only after the clean runner has
  built and verified its runtime, preventing build/queue time from consuming the
  source authorization window.

### Release artifact separation

The Core workspace and production artifact no longer depend on or package
`pdfjs-dist`, `@napi-rs/canvas`, Tesseract, trained data, or OCR fixtures solely
for Metadata Suggestion. Core CI verifies Core plus the shared contract. The
dedicated Compute workflow installs and verifies PDF.js/canvas, builds the same
pinned Tesseract 5.5.3 plus `tessdata_fast` 4.1.0 runtime, runs the realistic OCR
fixture, runs the memory probe, and then executes one job.

ADR-030 remains authoritative for Tesseract source/model/version provenance and
runtime verification. For the migrated Metadata Suggestion path, this ADR moves
that runtime from the Core release artifact to the clean Compute workflow; it
does not weaken or replace the pinned runtime contract.

## Migration and production gate

COMPUTE-PRECUTOVER01 is complete. The protected job now builds the pinned
runtime under `output/worker-stage`, where the output-only builder permits it,
verifies the runtime before use, atomically promotes the verified tree to
`output/worker`, and executes OCR only from that promoted path. A static
deployment contract ties builder, verification, runtime, memory-profile, peak,
and drift paths together. The exact hosted qualification used no production
secret or private PDF, uploaded no artifact, and kept the protected job
skipped.

GOAL-BETA-PREP01 Phase 2 completed the production gate. Writes were frozen and
the schema-v21 SQLite backup
`academiccloud-pre-compute-20260820T200600Z.sqlite` was verified locally and
through encrypted off-host commit `22b05321…`; its SHA-256 is
`1c00b6bcb9fe7e5aaf30a28c9e0b797753626d0ec99f79d2ebe799d097a8609a`.
Only migration 022 was applied once. Production now runs exact verified Core
source `1c3bb10a48082995924a2d9ec41a48d6d3d34acd` at schema v22/history
001–022, with previous application `08657727…` inseparably paired to that
pre-migration database/config state for rollback.

The cutover added exactly two secret values: one 30-day fine-grained token held
by Core, limited to only `3532606730-svg/AcademicCloud` with repository Actions
write plus required read-only metadata, and one strong shared bootstrap secret
installed in Core and protected Environment
`academiccloud-compute-production`. Only the exact non-secret Core origin and
branch-ref routing values accompany them. No secret value is recorded in this
ADR or Git.

One logical canary Core job
`2cb8a0b6-fb37-4b51-bd3b-f9330dbbbde7` succeeded on attempt 2 in final run
`32415058752`. Two first-boundary workflow defects were repaired without
weakening the output-only boundary: the runner owns the promotion ancestor, and
the compiled worker runs from the same staged release tree as its verified
release-local Tesseract runtime. Final real OCR/memory/callback evidence passed;
Core remained responsive; one candidate was reviewable but not accepted;
canonical metadata and the source object remained unchanged. Workflow artifact
count was zero and workflow/Core log scans found no signed source URL,
capability, document/candidate payload, or secret. No `MemoryHigh`/`MemoryMax`,
OSS, RAM, CORS, Nginx, or paid-infrastructure change was required. Later
ancestry verification proved the exact Core source already descended frozen
RF-SEARCH01 candidate `7bba7b8…`; that sequencing fact is reconciled in
GOAL-BETA-PREP01 and does not change this ADR's Compute authority boundary.

## Consequences and risks

- A Compute failure, queue delay, or timeout can fail one durable job without
  blocking Core request processing.
- GitHub Actions introduces provider queue/start latency and a protected
  environment/credential operational dependency; it is an adapter, not a domain
  dependency.
- A production GitHub-hosted runner would transiently process the exact selected
  private PDF bytes. Although no document content, signed URL, candidate payload,
  or capability is written to workflow logs/artifacts by this design, that
  provider/privacy boundary requires explicit Owner acceptance at cutover.
- A dispatched job whose acknowledgment is interrupted can be dispatched again;
  the attempt-scoped claim and callback boundaries make that safe, while the
  durable deadline prevents indefinite user state.
- The local memory probe intentionally reveals a large one-time PDF/native
  residency and keeps its 512 MiB local-development limit. GitHub-hosted
  `ubuntu-24.04` has a separate `<768 MiB` peak contract because three clean
  unchanged-Compute observations proved that the old hosted 512 MiB boundary was
  not reproducible. Clean-process execution, concurrency one, and the workflow
  drift assertion remain contract requirements rather than optional diagnostics.
- The recorded local RSS numbers cover Node/PDF.js/native canvas with a
  deterministic OCR fixture, not the separate Linux Tesseract process. A real
  clean-runner whole-job peak remains mandatory cutover evidence.
- Cancellation and a general Activity Center are not added by this slice.
- Whole-document OCR, full-text indexing, Search changes, embeddings, retrieval,
  RAG, and automatic canonical metadata writes remain unauthorized.
