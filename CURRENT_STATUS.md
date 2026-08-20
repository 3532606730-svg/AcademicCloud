# AcademicCloud Current Status

**Last reconciled:** 2026-08-20

`CURRENT_STATE.json` is the compact machine-readable pointer for current production/task identity. ADRs and completed task cards remain the historical decision/evidence record.

## Current Situation

AcademicCloud's domain model and backend architecture remain accepted: one Owner-governed shared academic corpus, private per-account research activity, browser-direct object-storage transfer, explicit lifecycle/CAS boundaries, and provider-neutral storage abstraction.

The immediate problem is operational, not a product-model rewrite.

### Active production incident

`OPS-STORAGE-INCIDENT01` is ACTIVE.

Owner-observed production symptoms after an Alibaba OSS overdue-payment interruption include:

- multipart upload interrupted and entered resumable/pending state;
- Continue upload still fails;
- Abandon upload still fails;
- metadata-suggestion generation fails for existing files;
- a raw browser `Failed to fetch` error has also been observed;
- Alibaba console now reports the OSS billing condition restored, but end-to-end AcademicCloud behavior has not yet recovered.

The incident root cause after billing recovery is **not yet proven**. Do not guess-fix application code, rotate credentials, mutate OSS/RAM policy, restart services, or clean pending uploads before bounded diagnosis establishes the first failing boundary.

## Production Declaration

Repository-declared production baseline remains:

```text
PRODUCTION_RELEASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
PREVIOUS_RELEASE=a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a
SCHEMA=v21
MIGRATIONS=001-021
```

Because the live service is under incident diagnosis, exact running process/release identity, Nginx/backend path, and OSS control-plane behavior must be reverified rather than inferred from old documentation.

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

1. resolve `OPS-STORAGE-INCIDENT01` and prove core storage-backed journeys are healthy;
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

Run `OPS-STORAGE-INCIDENT01` bounded diagnosis first. Preserve the existing pending multipart upload. After the incident is proven and repaired through a separately authorized change, complete a real browser core journey, then resume RF-SEARCH01 production closure.
