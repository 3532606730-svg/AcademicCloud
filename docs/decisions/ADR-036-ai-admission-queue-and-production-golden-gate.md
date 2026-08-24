# ADR-036 — Automatic AI Admission Queue and Provider-Backed Golden Gate

**Status:** Accepted for `INCIDENT-L1-AI-PRODUCTION01`
**Date:** 2026-08-23

**2026-08-24 provider amendment:** ADR-037 preserves admission, generation,
priority, current-state, and exactly-once effective-claim semantics. Its Local
Pull lease/heartbeat protocol becomes the normal production hand-off; the
GitHub dispatch-receipt logic below remains only for the retained disabled
normal-production fallback adapter.

## Decision

1. Admission of an eligible PDF into the canonical Library creates exactly one
   asynchronous durable bibliographic job for the admitted source generation.
2. Upload/admission success is independent from downstream AI success. AI
   dispatch, worker, callback, and canonical application failures are durable
   job outcomes and never roll back the admitted source.
3. Jobs carry an immutable origin and queue priority. Admission and interactive
   retry work use foreground priority; separately authorized historical
   catalogue work uses lower priority and is dispatched by the bounded
   reconciler after foreground work already queued.
4. Core validates candidates and remains the sole authority for canonical
   metadata and CAS writes. Human-authoritative fields are never silently
   overwritten, and physical source/object identity is never changed by
   cataloguing.
5. The current job projection prefers a queued/running generation over terminal
   history for the same resource. Historical terminal evidence remains
   addressable by its opaque job identity.
6. Normal users enter one `编辑信息` flow. Scholarly facts are presented under
   `书目信息`; technical artifact facts are presented under mostly read-only
   `文件信息`. Internal Resource/Artifact terminology is not a parallel user
   action model.
7. Provider-backed production paths are not declared complete from unit/CI,
   artifact, and health evidence alone. A bounded real Golden E2E covering
   browser, storage, Core, Compute, callback, and UI state is required.
8. The provider hand-off is treated as an ambiguous external boundary. The
   GitHub adapter first lists recent `workflow_dispatch` runs and matches the
   immutable `run-name` `(job_id, attempt_id)` key. If an accepted run already
   exists, recovery returns that run identity and does not POST a second
   dispatch. The workflow concurrency group remains a defense-in-depth guard,
   and Core's conditional `queued -> running` claim is the durable exactly-once
   execution gate. A Core restart may recover a lost receipt, but only one
   provider run can reach range/OCR/model work; later duplicate workers
   terminate at claim without source access.

## Consequences

- The durable job schema records `origin` and `queue_priority` (migration 025).
- Startup and periodic reconciliation only re-dispatches already-created
  queued rows without a provider receipt; it does not invent a historical wave.
- Historical backfill remains a separate Owner-gated operation with bounded,
  resumable progress and an explicit exception list. No backfill is started by
  this incident release until the required new-upload, legacy, and smoke gates
  are green.
- The admission trigger is best-effort at the request boundary but recoverable
  from the durable queued row; upload/admission remains fault-isolated from
  provider availability.

## Rejected alternatives

- In-process PDF/OCR work in Core: rejected under ADR-031 memory/fault-isolation
  constraints.
- Automatic retry of every failed historical job on startup: rejected because
  it would create an uncontrolled wave and could mask persistent failures.
- Treating the latest-created terminal job as current UI state: rejected because
  it lets an old failure masquerade as a new active retry.

## Ambiguous provider hand-off verification

The acceptance boundary is intentionally split:

```text
durable job creation
→ provider dispatch accepted
→ Core receipt persistence (ambiguous crash boundary)
→ worker claim (durable exactly-once gate)
→ range/OCR/model execution
```

The restart regression keeps one durable job and one attempt identity, models a
provider acceptance followed by a lost receipt, runs the fresh reconciler, and
submits both accepted worker attempts to the same Core claim. The provider
execution counter remains one, exactly one claim transitions the job to
`running`, and the other is rejected before source access. The GitHub adapter
has a focused HTTP regression proving that an already visible accepted run is
recovered without a second dispatch POST. The workflow uses
`cancel-in-progress: false` so an accidentally concurrent same-attempt run is
allowed to finish and is still stopped by Core claim before source access.
