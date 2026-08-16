# L1-PERF01 — Evidence-First Transfer Performance

## Task ID
L1-PERF01 — Evidence-First Transfer Performance

## Goal
Measure where AcademicCloud upload/download latency actually occurs and make only evidence-supported, low-risk client-side improvements while preserving the existing direct-to-object-storage architecture.

## Scope
- Reconstruct and verify the current upload/download byte path from code.
- Instrument or benchmark upload stages:
  - checksum start/finish;
  - reserve request/response;
  - direct object transfer start/finish;
  - complete/stat verification start/finish;
  - total time to active.
- Model download authorization/signing separately from actual object transfer.
- Benchmark synthetic checksum fixtures at 1 MiB, 10 MiB, 50 MiB, 100 MiB, and 250 MiB without committing large fixtures.
- Measure wall time and effective throughput; assess main-thread responsiveness/memory where practical.
- Inspect current upload-queue concurrency and separate single-large-file latency from aggregate multi-file throughput.
- Implement only clearly justified low-risk optimizations that preserve integrity, abort/retry, destination pinning, and direct storage byte paths.
- Record measured, inferred, and not-measured performance facts separately.

Potential low-risk investigations:
- off-main-thread MD5 via a build/CSP-compatible Worker with no new dependency;
- checksum chunk-size tuning if benchmarks justify it;
- a modest bounded queue-concurrency adjustment if aggregate measurements justify it.

## Non-goals
- No production performance benchmark or production mutation.
- No backend proxying of large upload/download bytes.
- No Alibaba OSS Transfer Acceleration activation.
- OSS Multipart Upload API implementation is not required for this task and should normally remain design-only unless extraordinary measured evidence, repository fit, and remaining review capacity justify it.
- No new dependency.
- No speculative browser multi-range downloader.
- No feature work unrelated to transfer performance.

## Acceptance Criteria
- Current upload/download architecture is explicitly verified from code.
- Stage measurements/benchmark tooling distinguish local measurement, real-network measurement, and not-measured claims.
- Checksum benchmarks exist for all five target sizes using generated data.
- No flaky exact-millisecond unit-test thresholds are introduced.
- Any implemented optimization has behavioral tests for integrity and relevant abort/retry/error paths.
- Direct browser upload and signed/direct download remain authoritative.
- `DEPENDENCY_DELTA=0`.
- Canonical frontend/backend tests, typecheck, build, acceptance tools/compiled acceptance, and diff checks pass where applicable.
- A dedicated adversarial review confirms no integrity, queue, stale-state, CSP, or direct-byte-path regression.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`

## Relevant Modules / Files
- `frontend/src/direct-upload.ts`
- `frontend/src/md5.ts`
- upload queue/state in `frontend/src/App.tsx` and related tests
- `frontend/src/api.ts`
- backend upload/download authorization and storage adapter code
- performance note/tooling added by this task

## Current State
Evidence gathered. Local synthetic checksum benchmark complete; architecture
verified from code; conclusion recorded: **no client-side optimization is
justified by measurement** (checksum is not the upload bottleneck and is already
near its local ceiling). Awaiting adversarial review + checkpoint.

## Completed
- Verified the browser-direct upload (enqueue → bounded pump → checksum →
  reserve → direct XHR POST → complete) and signed-direct download/preview paths
  from code; backend is control-plane only.
- Added `frontend/scripts/checksum-benchmark.ts` (generated-data, five sizes,
  three chunk sizes; prints results, asserts no timing thresholds).
- Measured SparkMD5 at 1/10/50/100/250 MiB: ≈350–390 MiB/s; 250 MiB ≈ 0.65–0.71 s.
- Documented measured / inferred / not-measured facts and the no-optimization
  decision in `docs/performance/L1-PERF01-transfer-performance.md`.

## Remaining
None — evidence, documentation, adversarial review (APPROVE-WITH-NITS, fixed),
and full gates are complete. Checkpoint and proceed to L1-FOLDER01.

## Blockers
None.

## Last Verification
2026-08-17 benchmark run (Node v24.16.0): 250 MiB MD5 = 0.71 s @ 4 MiB chunks,
0.66 s @ 8 MiB, 0.65 s @ 16 MiB; chunk-size delta <10%, negligible vs transfer.
Full gates PASS (backend 127/127, frontend 121/121, typecheck/build,
acceptance-tools 25/25, acceptance:compiled, diff-check clean, dependency delta
0). Adversarial review APPROVE-WITH-NITS; documentation-precision NITs applied.

## Next Action
Checkpoint PERF01, then begin L1-FOLDER01.
