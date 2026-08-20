# AcademicCloud Task Board

**Last reconciled:** 2026-08-21

The board is the executable priority view. `CURRENT_STATE.json` holds compact
current pointers; task cards and ADRs preserve complete contracts and evidence.

## Current Owner authorization / continuous objective

| Task | State | Next authority |
|---|---|---|
| GOAL-BETA-PREP01 | OWNER AUTHORIZED / PHASE 3 ACTIVE | Phase 2 Core/Compute production cutover and bounded canary are green; autonomously close RF-SEARCH01 on the latest baseline |
| COMPUTE-GHA02 | HOSTED VERIFICATION COMPLETE / HISTORICAL FINDINGS PRESERVED | Superseded by COMPUTE-PRECUTOVER01, which resolved its memory/staging findings on exact hosted run `32407660640` |
| ARCH-COMPUTE01 (`JOB-CORE01 + COMPUTE-GHA01 + OCR-METADATA-GHA01`) | PRODUCTION CUTOVER COMPLETE | Exact artifact `9421010643`, stopped-service backup, migration 022, minimum credentials/environment, deployment, invariants, and canary passed |
| OPS-METADATA-MEMORY01 | CLOSED BY COMPUTE CUTOVER | Real production canary proved heavy work outside Core and Core responsiveness throughout |

The detailed Owner authorization, boundaries, mandatory sequence, credential/privacy rules, and stop conditions are authoritative in `tasks/doing/GOAL-BETA-PREP01.md`.

## Active Goal Mode sequence

| Order | Task / phase | Task card | State |
|---:|---|---|---|
| 1 | COMPUTE-PRECUTOVER01 | `tasks/done/COMPUTE-PRECUTOVER01.md` | COMPLETE — exact source `1c3bb10…`, run `32407660640`; real OCR, provider-specific memory/drift, staging, privacy/output, and zero-artifact gates passed; production unchanged |
| 2 | ARCH-COMPUTE01 production cutover | `tasks/doing/GOAL-BETA-PREP01.md` Phase 2 | COMPLETE — production `1c3bb10…`, schema v22/history 001–022, rollback `08657727…` + verified pre-migration DB, final canary run `32415058752` green |
| 3 | RF-SEARCH01 production closure | `tasks/doing/RF-SEARCH01.md` + Goal Phase 3 | ACTIVE — compose frozen Search behavior onto latest baseline; historical artifact must not be deployed directly |
| 4 | L1-UX08 beta-minimum unified Activity Center | `tasks/ready/L1-UX08.md` + Goal Phase 4 | AUTHORIZED AFTER SEARCH GREEN — upload + Metadata/Compute + reliable download states, source recovery; no full task-history platform |
| 5 | QA-GOLDEN01 | `tasks/ready/QA-GOLDEN01.md` + Goal Phase 5 | AUTHORIZED FINAL BETA GATE — exact-build real-browser journey with safe fixtures and cleanup |
| 6 | INTERNAL_BETA_READY | `tasks/doing/GOAL-BETA-PREP01.md` | STOP — Owner decides whether/when to start or invite users into internal beta |

Goal Mode should move between these checkpoints autonomously when the changed-risk evidence is green. Routine implementation choices do not require another Owner round-trip. Early STOP conditions remain exactly those in GOAL-BETA-PREP01.

## RF-SEARCH01 preserved implementation state

RF-SEARCH01 remains development/artifact green and absent from production. Its exact frozen candidate is `7bba7b869fd1234c1e7c67002cb93368c299209b`. The old artifact is evidence only: because production has advanced through storage and Compute work, Goal Mode must compose the already-green Search behavior onto the latest production/Compute baseline and build a new exact artifact rather than deploying the historical artifact directly.

## Completed operational and Compute work

| Task | Card | Result |
|---|---|---|
| OPS-STORAGE-INCIDENT01 | `tasks/done/OPS-STORAGE-INCIDENT01.md` | CLOSED after exact least-privilege/R3 repair and Owner-reported browser storage acceptance |
| OPS-STORAGE-APP-REPAIR01 | `tasks/done/OPS-STORAGE-APP-REPAIR01.md` | Historical runtime-contract repair and failed-closed artifact/rollback evidence preserved |
| OPS-STORAGE-HOTFIX01 | `tasks/done/OPS-STORAGE-HOTFIX01.md` | Historical production-baseline prerequisite; superseded live by R3 |
| OPS-METADATA-MEMORY01-DIAGNOSIS | `tasks/done/OPS-METADATA-MEMORY01-DIAGNOSIS.md` | Core stall classified as cgroup reclaim from in-process PDF/render/OCR working set |
| JOB-CORE01 | `tasks/done/JOB-CORE01.md` | Development migration 022 and durable job authority complete |
| COMPUTE-GHA01 | `tasks/done/COMPUTE-GHA01.md` | Provider-neutral boundary plus GitHub Actions adapter complete in development |
| OCR-METADATA-GHA01 | `tasks/done/OCR-METADATA-GHA01.md` | Existing bounded OCR/Metadata Suggestion migrated to asynchronous Compute in development |
| COMPUTE-GHA02 | `tasks/done/COMPUTE-GHA02.md` | Exact final Ubuntu run passed contracts, Compute, pinned Tesseract, real OCR, memory, leak, quoting, and zero-artifact gates; its two pre-cutover findings are preserved historically and resolved by COMPUTE-PRECUTOVER01 |

ADR-031 remains the authoritative combined architecture/security/cutover record. COMPUTE-PRECUTOVER01 reconciled the explicit GitHub-hosted `<768 MiB` peak contract while retaining local `<512 MiB`, `<64 MiB` drift, concurrency one, and clean-process isolation. GOAL-BETA-PREP01 Phase 2 consumed its bounded production authority successfully; one logical canary passed with zero workflow artifacts, unchanged canonical metadata, and no OSS/RAM/CORS/memory-limit/cost change.

## Reliability / usability queue — outside the beta-prep critical path unless explicitly used by Goal Mode

| Order | Task | Task card | Objective |
|---:|---|---|---|
| 1 | OPS-DEPENDENCY01 | `tasks/ready/OPS-DEPENDENCY01.md` | Owner-visible OSS/Core dependency health and safe diagnostics |
| 2 | ERR-BOUNDARY01 | `tasks/ready/ERR-BOUNDARY01.md` | Stable user errors + request correlation; no raw browser/provider exceptions |
| 3 | DOC-TRUTH01 | `tasks/ready/DOC-TRUTH01.md` | Prevent authoritative-state drift |
| 4 | RF-INTEGRITY01 | `tasks/ready/RF-INTEGRITY01.md` | DB↔storage inventory reconciliation and rolling fixity evidence |
| 5 | OPS-OBJECTBACKUP01 | `tasks/ready/OPS-OBJECTBACKUP01.md` | Independent second copy of authoritative object bytes; cost/provider gate |
| 6 | FE-DECOMP01 | `tasks/ready/FE-DECOMP01.md` | Behavior-preserving frontend orchestration decomposition |
| 7 | CONTRACT-CORE01 | `tasks/ready/CONTRACT-CORE01.md` | Shared API/error contract source without framework churn |

These cards are not implicitly authorized by GOAL-BETA-PREP01. In particular, paid/cost-bearing object backup, broad frontend decomposition, contract refactors, and unrelated reliability cleanup must not be pulled into the beta-prep program.

## Preserved personal research / pre-intelligence queue

```text
RF-PROV01
→ RF-LINEAGE01
→ RF-STATS01
→ RF-OVERLAY01
→ RF-ORGANIZE01
→ RF-VIEWS01
→ RF-INTAKE01
→ RF-ANNOTATE01
→ RF-CITE01
→ RF-EVIDENCE01
→ RF-EXPORT01
→ RF-LIBRARY03
→ RF-LIBRARY04
→ RF-RECOVERY01
→ RF-AUTHMATRIX01
→ RF-DERIVED01
→ STOP BEFORE broader OCR/full-text/retrieval/RAG
```

None of this queue is authorized by GOAL-BETA-PREP01.

## Current release boundary

```text
DECLARED_PRODUCTION=1c3bb10a48082995924a2d9ec41a48d6d3d34acd
PREVIOUS_PRODUCTION=08657727a17a7ea766ad0d74cc663fa40f91eee1
PRODUCTION_SCHEMA=v22 / 001-022
DEVELOPMENT_SCHEMA=v22 / 001-022
MIGRATION_022_PRODUCTION_APPLIED=true

ARCH_COMPUTE01_PRODUCTION_CHANGED=true
ARCH_COMPUTE01_PRODUCTION_CREDENTIALS_CHANGED=true_least_scoped
ARCH_COMPUTE01_OSS_CHANGED=false
ARCH_COMPUTE01_SEARCH_CHANGED=false

SEARCH_ARTIFACT_SOURCE=7bba7b869fd1234c1e7c67002cb93368c299209b
SEARCH_PRODUCTION=NOT_CUT_OVER
INTERNAL_BETA_READY=false
```

The full storage hotfix/R3 artifact identities and hashes remain in `CURRENT_STATE.json` and the completed storage task cards.

## Goal Mode hard boundaries / early-stop rules

- Preserve historical COMPUTE-GHA02 evidence. Do not merely hide the 512 MiB variability; make any new GitHub-hosted memory contract provider-specific and evidence-backed.
- Preserve the builder's repository-`output/` safety boundary while repairing the protected job staging path.
- Production migration/deploy/canary is authorized only after Phase 1 green and only within the exact GOAL-BETA-PREP01 cutover contract.
- Do not repurpose a broad personal GitHub token for production. If a compliant least-scoped dispatch credential cannot be provisioned without Owner interaction, STOP at that exact credential gate.
- No paid infrastructure, no second server, and no cost-bearing object-backup work.
- Do not change `MemoryHigh`/`MemoryMax` merely to mask a Compute defect.
- Do not mutate OSS RAM/CORS/bucket policy unless a newly proven regression makes it strictly necessary; if so STOP for Owner review.
- Do not destructively/manual-edit existing pending uploads or object/part state.
- The worker returns candidates only; Core remains sole authority for result identity, persistence, Library scope, and canonical metadata application.
- Search must be recomposed on the latest baseline; do not deploy the historical Search artifact directly.
- Activity Center scope is beta-minimum only; do not turn it into a broad notification/task-history platform.
- Do not begin whole-document OCR product expansion, full-text indexing/search, embeddings, retrieval, RAG, Personal Research Workspace, or unrelated roadmap work.
- If production becomes unhealthy, stop new work and use the already-defined rollback path when rollback is clearly required for service/data safety.
- When all beta-prep gates are green, set `INTERNAL_BETA_READY=true`, reconcile durable state, checkpoint/push/synchronize where actually possible, then STOP before starting internal beta.
