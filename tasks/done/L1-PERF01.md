# L1-PERF01 — Evidence-First Transfer Performance

## Task ID
L1-PERF01 — Evidence-First Transfer Performance

## Goal
Measure where AcademicCloud upload/download latency actually occurs and make only evidence-supported, low-risk client-side improvements while preserving direct-to-object-storage architecture.

## Scope
- verify upload/download byte paths from code;
- benchmark generated checksum fixtures;
- distinguish checksum/reserve/direct-transfer/complete stages;
- inspect bounded upload concurrency;
- implement only clearly justified low-risk optimizations.

## Non-goals
No production benchmarking, backend large-byte proxy, Transfer Acceleration, speculative multipart implementation, new dependency, or unrelated feature work.

## Acceptance Criteria
Architecture verified; generated checksum benchmarks cover target sizes; measured/inferred/not-measured claims separated; any optimization requires evidence and regression coverage; direct upload/download architecture preserved; dependency delta zero; canonical checks and adversarial review green.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`

## Relevant Modules / Files
- `frontend/src/direct-upload.ts`
- `frontend/src/md5.ts`
- upload queue/API paths
- backend authorization/storage adapter code
- `docs/performance/L1-PERF01-transfer-performance.md`.

## Current State
**Complete.** Evidence showed no client-side optimization was justified; checksum was not the dominant upload bottleneck and no product-code optimization or dependency was added.

## Completed
- verified browser-direct upload and signed/direct download/preview paths;
- added generated-data checksum benchmark tooling;
- measured 1/10/50/100/250 MiB fixtures and chunk-size variants;
- recorded measured/inferred/not-measured facts;
- concluded no optimization was warranted;
- full gates and adversarial review completed.

## Remaining
None.

## Blockers
None.

## Last Verification
2026-08-17: local Node 24 benchmark measured roughly 350–390 MiB/s checksum throughput; 250 MiB about 0.65–0.71 s; chunk-size differences below 10%. Full backend/frontend/typecheck/build/acceptance checks passed; dependency delta zero; adversarial review completed.

## Next Action
No task action. Preserve direct byte paths and reopen performance work only with new evidence.
