# AcademicCloud Task Board

**Last reconciled:** 2026-08-20

The board is the executable priority view. `CURRENT_STATE.json` holds compact current pointers; task cards define bounded contracts; ADRs/done cards preserve history.

## Doing

| Order | Task | Task card | State |
|---:|---|---|---|
| 1 | OPS-STORAGE-APP-REPAIR01 | `tasks/doing/OPS-STORAGE-APP-REPAIR01.md` | DEPLOYMENT FAILED CLOSED / ROLLBACK PASS — exact artifact contains frozen Search UI/API and violates the explicit no-Search scope; STOP for Owner review |
| 2 | OPS-STORAGE-INCIDENT01 | `tasks/doing/OPS-STORAGE-INCIDENT01.md` | PROVIDER REPAIR VERIFIED — incident remains open pending a compatible app deployment + Owner Continue/Abandon/metadata browser acceptance |
| 3 | RF-SEARCH01 | `tasks/doing/RF-SEARCH01.md` | DEV/ARTIFACT GREEN — candidate remains frozen and is not currently live; brief exposure during the rolled-back repair deployment is recorded |

## Reliability / Usability Interlock — Ready but do not auto-start

| Order | Task | Task card | Objective |
|---:|---|---|---|
| 1 | L1-UX08 | `tasks/ready/L1-UX08.md` | Global upload Activity Center + source-file recovery |
| 2 | OPS-DEPENDENCY01 | `tasks/ready/OPS-DEPENDENCY01.md` | Owner-visible OSS/core-dependency health and safe diagnostics |
| 3 | QA-GOLDEN01 | `tasks/ready/QA-GOLDEN01.md` | Real-browser golden journeys as release evidence |
| 4 | ERR-BOUNDARY01 | `tasks/ready/ERR-BOUNDARY01.md` | Stable user errors + request correlation; no raw browser/provider exceptions |
| 5 | DOC-TRUTH01 | `tasks/ready/DOC-TRUTH01.md` | Eliminate current-state drift; machine-check authoritative pointers |
| 6 | RF-INTEGRITY01 | `tasks/ready/RF-INTEGRITY01.md` | DB↔storage inventory reconciliation and rolling fixity evidence |
| 7 | OPS-OBJECTBACKUP01 | `tasks/ready/OPS-OBJECTBACKUP01.md` | Independent second copy of authoritative object bytes; cost/provider gate |
| 8 | JOB-CORE01 | `tasks/ready/JOB-CORE01.md` | Lightweight durable background-job abstraction before heavier OCR/extraction |
| 9 | FE-DECOMP01 | `tasks/ready/FE-DECOMP01.md` | Behavior-preserving decomposition of oversized frontend orchestration |
| 10 | CONTRACT-CORE01 | `tasks/ready/CONTRACT-CORE01.md` | Shared API/error contract source without framework churn |

These cards are sequenced planning contracts. They do not authorize paid infrastructure, production mutation, migrations, destructive cleanup, or automatic progression.

## Preserved Personal Research / Pre-Intelligence Queue

After the interlock is deliberately cleared, preserve the existing scholarly sequence rather than discarding it:

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

`RF-INTEGRITY01` is intentionally promoted into the reliability interlock and therefore is no longer blocked behind `RF-LIBRARY04`.

## Completed foundation (summary)

Completed cards under `tasks/done/` remain authoritative for implementation/release evidence, including shared-default corpus semantics, credential reset, catalogue UX, canonical metadata, metadata suggestions, front-matter OCR, multipart/Range transfer, destructive lifecycle authority, and releases through RF-METASUGGEST-HARDEN01.

## Current Release Boundary

```text
DECLARED_PRODUCTION=604cb8daf310696353e99c30ce7a924dc71ef9d2
SCHEMA=v21 / 001-021
STORAGE_REPAIR_VERIFIED_SOURCE=8d28970209c2e7b41b5d9486bea570a2a8e6c7e6
STORAGE_REPAIR_SOURCE_CI=32365460608 PASS
STORAGE_REPAIR_ARTIFACT_WORKFLOW=32366397645 PASS
STORAGE_REPAIR_ARTIFACT_ID=9405764771
STORAGE_REPAIR_ARCHIVE_SHA256=03edbbe0f8b506bb7d3fbb9b929e90f89b8b6948b4256865fcd44d9c62e8bbe4
STORAGE_REPAIR_MANIFEST_SHA256=76e902496f3255293b670f09248cf73f5e8d665a77e0e7a2446e49b7fe05eeb4
STORAGE_REPAIR_INDEPENDENT_VERIFICATION=PASS
STORAGE_REPAIR_DEPLOYMENT=FAIL_CLOSED
STORAGE_REPAIR_FIRST_FAILED_GATE=AUTHORIZED_SOURCE_CONTAINS_FORBIDDEN_RF_SEARCH01_DEPLOYMENT
STORAGE_REPAIR_ROLLBACK=PASS
SEARCH_ARTIFACT_SOURCE=7bba7b869fd1234c1e7c67002cb93368c299209b
SEARCH_PRODUCTION=NOT_CUT_OVER
ACTIVE_INCIDENT=OPS-STORAGE-INCIDENT01
ACTIVE_SOURCE_REPAIR=OPS-STORAGE-APP-REPAIR01
REPAIR_BRANCH=codex/storage-runtime-contract-repair-20260820
```

## Stop Rules

- The exact provider permission repair is complete; no further RAM/OSS policy churn is authorized.
- The bounded source repair and immutable production artifact are technically verified, but the artifact also contains the frozen Search candidate.
- The authorized deployment failed closed on that exact release-scope mismatch and rolled back to `604cb8d…`; do not redeploy artifact ID `9405764771` while the no-Search boundary remains in force.
- A repair-only source/artifact or an explicit revision of the Search boundary requires new Owner authorization and exact-source verification.
- No migration, credential/config change, pending-upload mutation, manual complete/abort, or metadata mutation is authorized now.
- Do not close `OPS-STORAGE-INCIDENT01` until the verified repair is deployed and Continue, Abandon, and metadata-suggestion real-browser journeys pass.
- Search remains frozen; do not rebuild or modify the exact RF-SEARCH01 release candidate unless a concrete defect requires it.
- No new research feature begins while the production storage incident is unresolved.
- Paid storage backup/provider choice, credentials, further RAM/OSS policy, migrations, destructive repair, production deployment, and infrastructure changes remain explicit Owner gates.
