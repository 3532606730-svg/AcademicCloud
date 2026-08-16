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
Ready, not started. Current accepted architecture is expected to remain browser-direct upload/download with the backend acting as authorization/metadata control plane. Production UX01 recorded noticeably slow initial PDF Preview loading, but no measured bottleneck has yet been established.

## Completed
None.

## Remaining
- verify actual architecture;
- add measurements/benchmarks;
- identify measured bottlenecks;
- make only justified low-risk improvements;
- run adversarial review and full gates;
- reconcile task/project state and checkpoint.

## Blockers
None known. If a desired optimization requires a new dependency, CSP weakening, production OSS configuration, credentials, or a product-architecture change, stop that optimization and continue with measurement/documentation rather than expanding scope.

## Last Verification
2026-08-17 planning reconciliation: PERF01 is approved after L1-UX03 closure. Current development baseline is `dd42cab…`; no PERF01 code has been implemented yet.

## Next Action
After L1-UX03 is green and checkpointed, move this task to `tasks/doing/`, recover the current upload/download implementation, and begin with measurement rather than optimization.
