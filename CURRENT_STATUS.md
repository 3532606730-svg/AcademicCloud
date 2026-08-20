# AcademicCloud Current Status

**Last reconciled:** 2026-08-20

`CURRENT_STATE.json` is the compact machine-readable pointer for current production/task identity. ADRs and completed task cards remain the historical decision/evidence record.

## Current Situation

AcademicCloud's domain model and backend architecture remain accepted: one Owner-governed shared academic corpus, private per-account research activity, browser-direct object-storage transfer, explicit lifecycle/CAS boundaries, and provider-neutral storage abstraction.

The immediate problem is operational, not a product-model rewrite.

### Active production incident

`OPS-STORAGE-INCIDENT01` is ACTIVE and remains open for Owner product
acceptance. The bounded provider repair is complete and verified.

Owner-observed production symptoms after an Alibaba OSS overdue-payment interruption include:

- the overdue-payment suspension caused historical `UserDisableError` failures;
- after billing restoration, HeadObject/GetObject recovered but ListParts
  returned AccessDenied 403;
- effective-policy inspection proved the exact production RAM user had only
  PutObject/GetObject/DeleteObject on the correct `objects/*` resource;
- the Owner-authorized `AcademicCloudProdOSS` v2 added only ListParts and
  AbortMultipartUpload, retained the exact prior scope, and is now default;
- non-mutating production probes now pass stat, bounded Range read, and raw
  ListParts (HTTP 200).

The policy root cause is **missing RAM allow**, with no explicit deny, bucket
policy, resource/prefix mismatch, principal mismatch, invalid AccessKey, or
provider-residual AccessDenied after the exact policy correction. No credential,
application code/config, service restart, migration, SQLite write, object/part
mutation, or Search release action occurred.

The exact runtime verification also found that OSS supplies ListParts
truncation/marker fields as strings while the current adapter expects
boolean/numeric values. The raw provider call is authorized and green, but this
separate response-normalization finding makes the required Owner real-browser
Continue/Abandon checks decisive. No application repair is authorized in this
provider-only operation.

## Production Declaration

Repository-declared production baseline remains:

```text
PRODUCTION_RELEASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
PREVIOUS_RELEASE=a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a
SCHEMA=v21
MIGRATIONS=001-021
```

Live verification after the policy repair confirms the release symlink and
process CWD are exact `604cb8d…`, schema is v21/history 001–021, service is
active/running with `NRestarts=0`, and loopback/public health/readiness all
return 200. Five multipart rows remain `uploading`; six file rows remain
`pending_upload`.

No search production cutover has occurred.

## RF-SEARCH01

Development is green and the release candidate is frozen:

```text
ARTIFACT_SOURCE_COMMIT=7bba7b869fd1234c1e7c67002cb93368c299209b
ARTIFACT_WORKFLOW=32331172274
ARTIFACT_ID=9393280984
ARTIFACT_SHA256=4b72062734fa941ea4bd48019713a4fbb8951a7793a04f625a3680d7c8e1a15b
MANIFEST_SHA256=beb15507b20c99679fb48cfe772c29d1d92a930b2adcd337202d88f0cff49458
INDEPENDENT_ARTIFACT_VERIFICATION=PASS
```

RF-SEARCH01 production is blocked by two gates:

1. complete Owner product acceptance and close `OPS-STORAGE-INCIDENT01`;
2. complete mandatory real-browser pre-cutover acceptance.

Do not rebuild or modify the search release candidate unless a concrete defect requires it.

## Reliability / Product-Maturity Interlock

Before resuming broad Personal Research Workspace expansion, the new priority order is:

```text
OPS-STORAGE-INCIDENT01
→ RF-SEARCH01 production closure
→ L1-UX08 Upload Activity & Source Recovery
→ OPS-DEPENDENCY01 Dependency Health
→ QA-GOLDEN01 Real-Browser Golden Journeys
→ ERR-BOUNDARY01 Unified Error Boundary
→ DOC-TRUTH01 Repository Truth Hygiene
→ RF-INTEGRITY01 Storage/Metadata Integrity & Reconciliation
→ OPS-OBJECTBACKUP01 Independent Object-Byte Backup
→ JOB-CORE01 Durable Background Jobs
→ FE-DECOMP01 Frontend Decomposition
→ CONTRACT-CORE01 Shared API Contracts
→ Personal Research Workspace sequence
```

This is a reliability interlock, not a change to the long-term scholarly model.

## Newly Accepted UX Direction

`L1-UX08` will unify two upload UX gaps:

- a global cross-page Activity Center showing queued/preparing/uploading/paused/resumable/completing/verifying/complete/error states, progress, bytes, speed and ETA;
- source-file recovery that first reuses the in-memory `File`, then (where supported) a persisted `FileSystemFileHandle`/IndexedDB permission flow, and only falls back to `选择原文件继续` when automatic source recovery is unavailable.

Server-authoritative checksum identity remains mandatory before reusing existing multipart parts.

## Safety Boundaries

- No production mutation is authorized by this reconciliation.
- No migration is authorized.
- No Search cutover until incident + browser gates pass.
- SQLite + modular monolith + browser-direct object storage remain the accepted near-term architecture.
- No OCR/full-text/embeddings/RAG expansion until the reliability interlock is deliberately cleared.

## Next Action

STOP FOR OWNER PRODUCT ACCEPTANCE. The Owner manually tests Continue upload,
Abandon upload, and Find metadata suggestions. Preserve every pending upload and
do not close `OPS-STORAGE-INCIDENT01` until those real-browser journeys pass.
RF-SEARCH01 remains frozen and untouched.
