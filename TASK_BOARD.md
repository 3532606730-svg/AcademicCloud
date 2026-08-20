# AcademicCloud Task Board

**Last reconciled:** 2026-08-21

The board is the executable priority view. `CURRENT_STATE.json` holds compact
current pointers; task cards and ADRs preserve complete contracts and evidence.

## Current stop / Owner gate

| Task | State | Next authority |
|---|---|---|
| COMPUTE-GHA02 | HOSTED VERIFICATION COMPLETE / FINAL RUN GREEN / MEMORY GATE NOT REPRODUCIBLE | Owner must separately authorize bounded memory-headroom investigation or repair before any cutover plan |
| ARCH-COMPUTE01 (`JOB-CORE01 + COMPUTE-GHA01 + OCR-METADATA-GHA01`) | DEVELOPMENT COMPLETE / PRODUCTION CUTOVER BLOCKED | Final hosted run passed, but two clean probes exceeded the fixed 512 MiB Node gate; backup, migration 022, Compute secrets/environment, artifact, and cutover remain unauthorized |
| OPS-METADATA-MEMORY01 | DIAGNOSIS COMPLETE / PRODUCTION RISK NOT CUT OVER | Addressed by the development Compute boundary; production remains on the old release until an authorized cutover |

No implementation task should auto-start from this checkpoint.

## Doing / frozen

| Order | Task | Task card | State |
|---:|---|---|---|
| 1 | RF-SEARCH01 | `tasks/doing/RF-SEARCH01.md` | DEV/ARTIFACT GREEN BUT FROZEN — exact candidate `7bba7b…` remains unchanged and absent from production; no Search work was authorized by ARCH-COMPUTE01 |

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
| COMPUTE-GHA02 | `tasks/done/COMPUTE-GHA02.md` | Exact final Ubuntu run passed contracts, Compute, pinned Tesseract, real OCR, memory, leak, quoting, and zero-artifact gates; cutover remains blocked because two clean memory probes exceeded 512 MiB |

ADR-031 is the authoritative combined architecture/security/cutover record.

## Reliability / usability queue — ready but do not auto-start

| Order | Task | Task card | Objective |
|---:|---|---|---|
| 1 | L1-UX08 | `tasks/ready/L1-UX08.md` | Global upload Activity Center + source-file recovery |
| 2 | OPS-DEPENDENCY01 | `tasks/ready/OPS-DEPENDENCY01.md` | Owner-visible OSS/Core dependency health and safe diagnostics |
| 3 | QA-GOLDEN01 | `tasks/ready/QA-GOLDEN01.md` | Real-browser golden journeys as release evidence |
| 4 | ERR-BOUNDARY01 | `tasks/ready/ERR-BOUNDARY01.md` | Stable user errors + request correlation; no raw browser/provider exceptions |
| 5 | DOC-TRUTH01 | `tasks/ready/DOC-TRUTH01.md` | Prevent authoritative-state drift |
| 6 | RF-INTEGRITY01 | `tasks/ready/RF-INTEGRITY01.md` | DB↔storage inventory reconciliation and rolling fixity evidence |
| 7 | OPS-OBJECTBACKUP01 | `tasks/ready/OPS-OBJECTBACKUP01.md` | Independent second copy of authoritative object bytes; cost/provider gate |
| 8 | FE-DECOMP01 | `tasks/ready/FE-DECOMP01.md` | Behavior-preserving frontend orchestration decomposition |
| 9 | CONTRACT-CORE01 | `tasks/ready/CONTRACT-CORE01.md` | Shared API/error contract source without framework churn |

These cards do not authorize paid infrastructure, production mutation,
migrations, destructive cleanup, credentials, or automatic progression.

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

## Current release boundary

```text
DECLARED_PRODUCTION=08657727a17a7ea766ad0d74cc663fa40f91eee1
PREVIOUS_PRODUCTION=988bdbf052de1a39b47a1e22ac761c977eec72c8
PRODUCTION_SCHEMA=v21 / 001-021
DEVELOPMENT_SCHEMA=v22 / 001-022
MIGRATION_022_PRODUCTION_APPLIED=false

ARCH_COMPUTE01_PRODUCTION_CHANGED=false
ARCH_COMPUTE01_PRODUCTION_CREDENTIALS_CHANGED=false
ARCH_COMPUTE01_OSS_CHANGED=false
ARCH_COMPUTE01_SEARCH_CHANGED=false

SEARCH_ARTIFACT_SOURCE=7bba7b869fd1234c1e7c67002cb93368c299209b
SEARCH_PRODUCTION=NOT_CUT_OVER
```

The full storage hotfix/R3 artifact identities and hashes remain in
`CURRENT_STATE.json` and the completed storage task cards.

## Stop rules

- Stop for Owner review of the Core/Compute hosted memory-headroom variability;
  do not treat the isolated narrow green run as reproducible cutover evidence.
- Do not deploy, restart production, change `MemoryHigh`/`MemoryMax`, install or
  rotate credentials, or apply migration 022 without a new explicit gate.
- Do not mutate OSS RAM/CORS/bucket policy, production SQLite, pending uploads,
  or object/part state.
- The worker may return candidates only; Core remains sole authority for result
  identity, persistence, Library scope, and canonical metadata application.
- Keep RF-SEARCH01 frozen; do not rebuild, modify, or deploy it under the current
  objective.
- Do not begin full Activity Center, whole-document OCR, indexing, embeddings,
  retrieval, RAG, or unrelated product work automatically.
