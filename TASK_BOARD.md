# AcademicCloud Task Board

**Last reconciled:** 2026-08-20

The board is the executable priority view. `CURRENT_STATE.json` holds compact current pointers; task cards define bounded contracts; ADRs/done cards preserve history.

## Doing

| Order | Task | Task card | State |
|---:|---|---|---|
| 1 | OPS-STORAGE-HOTFIX01 | `tasks/doing/OPS-STORAGE-HOTFIX01.md` | ARTIFACT VERIFIED — exact hotfix is based directly on production `604cb8d…`, changes only Aliyun `ListParts` normalization + its regression test, and excludes RF-SEARCH01; STOP for Owner production-deployment decision |
| 2 | OPS-STORAGE-INCIDENT01 | `tasks/doing/OPS-STORAGE-INCIDENT01.md` | PROVIDER REPAIR VERIFIED — incident remains open pending compatible hotfix deployment + Owner Continue/Abandon/metadata browser acceptance |
| 3 | RF-SEARCH01 | `tasks/doing/RF-SEARCH01.md` | DEV/ARTIFACT GREEN — candidate remains frozen and is not currently live; brief exposure during the rolled-back incompatible repair deployment is recorded |

`OPS-STORAGE-APP-REPAIR01` remains the technical diagnosis/source-repair record. Its original artifact ID `9405764771` is **not a valid production candidate under the no-Search boundary** because source `8d289702…` includes RF-SEARCH01. It must not be redeployed.

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

OLD_STORAGE_REPAIR_SOURCE=8d28970209c2e7b41b5d9486bea570a2a8e6c7e6
OLD_STORAGE_REPAIR_ARTIFACT_ID=9405764771
OLD_STORAGE_REPAIR_PRODUCTION_SCOPE=INVALID_NO_SEARCH
OLD_STORAGE_REPAIR_DEPLOYMENT=FAIL_CLOSED
OLD_STORAGE_REPAIR_ROLLBACK=PASS

STORAGE_HOTFIX_BASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
STORAGE_HOTFIX_SOURCE=988bdbf052de1a39b47a1e22ac761c977eec72c8
STORAGE_HOTFIX_DIFF=2_COMMITS__2_FILES_ONLY
STORAGE_HOTFIX_ARTIFACT_WORKFLOW=32376005391 PASS
STORAGE_HOTFIX_ARTIFACT_ID=9409511861
STORAGE_HOTFIX_ARTIFACT_SHA256=dec7ef47249e8d148aa7d31b8e0ddf3861dbceb2319dec4aaaa83b94c612b150
STORAGE_HOTFIX_ARCHIVE_SHA256=79cea866533e9da1b7d00fb0b3e62a3a3123a90bc20138b8c4d9d40141ed5f33
STORAGE_HOTFIX_MANIFEST_SHA256=d6d8b22077d79e9018c6e3eef2cb4454e452995dbc3c1127e574257914e8ce30
STORAGE_HOTFIX_INDEPENDENT_VERIFICATION=PASS
STORAGE_HOTFIX_RF_SEARCH_INCLUDED=false

SEARCH_ARTIFACT_SOURCE=7bba7b869fd1234c1e7c67002cb93368c299209b
SEARCH_PRODUCTION=NOT_CUT_OVER
ACTIVE_INCIDENT=OPS-STORAGE-INCIDENT01
ACTIVE_RELEASE_TASK=OPS-STORAGE-HOTFIX01
```

## Stop Rules

- The exact provider permission repair is complete; no further RAM/OSS policy churn is authorized.
- Do not redeploy source `8d289702…` / artifact `9405764771` under the no-Search boundary.
- The only verified compatible storage candidate is source `988bdbf…` / artifact `9409511861`, built directly from production `604cb8d…` and differing by exactly two files.
- Production deployment of the hotfix remains an explicit Owner gate; artifact verification itself does not authorize deployment.
- No migration, credential/config change, pending-upload mutation, manual complete/abort, or metadata mutation is authorized now.
- Do not close `OPS-STORAGE-INCIDENT01` until the hotfix is deployed and Continue, Abandon, and metadata-suggestion real-browser journeys pass.
- Search remains frozen; do not rebuild or modify the exact RF-SEARCH01 release candidate unless a concrete defect requires it.
- No new research feature begins while the production storage incident is unresolved.
- Paid storage backup/provider choice, credentials, further RAM/OSS policy, migrations, destructive repair, production deployment, and infrastructure changes remain explicit Owner gates.
