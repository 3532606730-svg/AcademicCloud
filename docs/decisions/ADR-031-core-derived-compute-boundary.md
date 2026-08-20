# ADR-031 — Core Authority and Ephemeral Derived Compute

**Date:** 2026-08-21
**Status:** Accepted by Owner; development implementation complete, production cutover separately gated

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

Migration 022 is development-only at this checkpoint. Production remains exact
release `08657727a17a7ea766ad0d74cc663fa40f91eee1` at schema v21/history 001–021.
No production migration, deployment, restart, memory-limit change, provider
policy change, credential installation, SQLite mutation, or RF-SEARCH01 change
is authorized by this decision.

A later Owner-authorized cutover must separately provide a pre-migration backup,
deploy one exact verified Core artifact, apply migration 022 through the existing
explicit stopped-service procedure, configure only the minimal Compute routing
and secrets, configure the protected GitHub environment, and then verify Auth,
Library, health/readiness, durable async Metadata Suggestion, candidate review,
and rollback evidence. Production needs exactly two new secret values: a
least-scoped GitHub workflow-dispatch token held by Core and one strong shared
bootstrap secret installed in Core and the protected GitHub environment. It also
needs the non-secret exact Core origin and Compute ref routing values.

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
  residency and has limited headroom below 512 MiB. Clean-process execution and
  the workflow memory assertion are therefore part of the contract, not optional
  diagnostics.
- The recorded local RSS numbers cover Node/PDF.js/native canvas with a
  deterministic OCR fixture, not the separate Linux Tesseract process. A real
  clean-runner whole-job peak remains mandatory cutover evidence.
- Cancellation and a general Activity Center are not added by this slice.
- Whole-document OCR, full-text indexing, Search changes, embeddings, retrieval,
  RAG, and automatic canonical metadata writes remain unauthorized.
