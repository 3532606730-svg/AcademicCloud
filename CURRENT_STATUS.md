# AcademicCloud Current Status

**Last reconciled:** 2026-08-20

`CURRENT_STATE.json` is the compact machine-readable pointer for current production/task identity. ADRs and completed task cards remain the historical decision/evidence record.

## Current Situation

AcademicCloud's domain model and backend architecture remain accepted: one Owner-governed shared academic corpus, private per-account research activity, browser-direct object-storage transfer, explicit lifecycle/CAS boundaries, and provider-neutral storage abstraction.

The immediate problem is operational/runtime integration, not a product-model rewrite.

### Active production incident

`OPS-STORAGE-INCIDENT01` remains ACTIVE. The bounded provider permission repair is complete and verified, and the bounded application source repair is now repository-verified. The incident cannot close until an Owner-authorized application release is deployed and the Owner's real-browser Continue/Abandon/metadata journeys pass.

Owner-observed production symptoms after an Alibaba OSS overdue-payment interruption include:

- the overdue-payment suspension caused historical `UserDisableError` failures;
- after billing restoration, HeadObject/GetObject recovered but ListParts returned AccessDenied 403;
- effective-policy inspection proved the exact production RAM user had only PutObject/GetObject/DeleteObject on the correct `objects/*` resource;
- the Owner-authorized `AcademicCloudProdOSS` v2 added only ListParts and AbortMultipartUpload, retained the exact prior scope, and is now default;
- non-mutating production probes now pass stat, bounded Range read, and raw ListParts (HTTP 200).

The policy root cause was **missing RAM allow**, with no explicit deny, bucket policy, resource/prefix mismatch, principal mismatch, invalid AccessKey, or provider-residual AccessDenied after the exact policy correction. No credential, migration, SQLite write, object/part mutation, or Search release action occurred.

The exact runtime verification then proved a separate application defect in the `ListParts` boundary. Initial production evidence showed string `isTruncated` and `nextPartNumberMarker` values. Read-only inspection of the exact packaged `ali-oss@6.23.0` in the already-verified frozen RF-SEARCH01 artifact established the complete behavior: `listParts` forwards XML values directly, the XML parser uses singleton objects instead of one-element arrays, and therefore a one-part response has an object `parts` value while `PartNumber`, `Size`, truncation, and marker values remain strings. The old canonical adapter path expects an array plus numeric/boolean fields, so a successful provider response can fail before resume reconciliation.

Metadata Suggestion remains a separate acceptance item. The bounded incident evidence tied the recorded suggestion failures to the overdue-payment disabled window (`UserDisableError` at `HeadObject`) and found zero suggestion-generation failures after 13:00. Therefore no Metadata Range/OCR/parser patch is authorized or justified unless a current post-repair browser attempt reproduces a new failure boundary.

### Verified application source repair

`OPS-STORAGE-APP-REPAIR01` is source-verified on isolated branch `codex/storage-runtime-contract-repair-20260820`, based exactly on authoritative branch commit `281263be7f6248a4d18e099b59cf49028ec277ca`.

The repair normalizes only the complete proven `ListParts` runtime representation before the native OSS client is exposed: singleton/array part container, part-number/size integer strings, truncation boolean strings, and the next marker. It preserves the existing SDK instance and every other SDK method path; `AliyunOssStorageAdapter` still owns canonical range/count/order/duplicate validation. Search is not modified and production is untouched.

Repository-native verification ran on exact repair source `8d28970209c2e7b41b5d9486bea570a2a8e6c7e6` via isolated Actions run `32365460608` / job `96413882821`:

- focused real-SDK Aliyun storage regressions: 20/20 PASS;
- backend: 376 PASS, 0 FAIL, 1 expected skip (377 total);
- frontend: 241/241 PASS;
- root Tesseract runtime verifier: 1/1 PASS;
- backend/frontend typechecks: PASS;
- backend/frontend production builds: PASS;
- `git diff --check` against exact authoritative base: PASS;
- clean dependency install: 0 vulnerabilities in 306 audited packages.

The temporary draft PR used only to trigger the isolated CI workflow was closed unmerged. No repair production artifact has been built yet and no production application change is authorized yet.

## Production Declaration

Repository-declared production baseline remains:

```text
PRODUCTION_RELEASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
PREVIOUS_RELEASE=a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a
SCHEMA=v21
MIGRATIONS=001-021
```

Live verification after the policy repair confirmed the release symlink and process CWD as exact `604cb8d…`, schema v21/history 001–021, service active/running with `NRestarts=0`, and loopback/public health/readiness 200. Pending multipart/file rows remain protected from manual mutation during the repair process.

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

RF-SEARCH01 production remains blocked until the storage repair is safely released, `OPS-STORAGE-INCIDENT01` closes through real-browser acceptance, and the mandatory Search real-browser pre-cutover gate passes. Do not modify or rebuild the frozen Search candidate unless a concrete defect requires it.

## Reliability / Product-Maturity Interlock

Before resuming broad Personal Research Workspace expansion, the priority order is:

```text
OPS-STORAGE-APP-REPAIR01 release
→ OPS-STORAGE-INCIDENT01 closure
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

- Source repair and repository verification are complete; production deployment remains a separate explicit Owner gate.
- No further RAM/OSS policy mutation is authorized by this repair.
- No migration, credential change, SQLite mutation, manual multipart complete/abort, pending-upload deletion, or metadata mutation is authorized.
- No normalization or refactor outside the exact `ListParts` runtime boundary without new evidence.
- No Metadata Suggestion implementation change without a current reproduced post-repair failure boundary.
- No Search cutover until the storage repair, incident closure, and browser gates pass.
- SQLite + modular monolith + browser-direct object storage remain the accepted near-term architecture.
- No OCR/full-text/embeddings/RAG expansion until the reliability interlock is deliberately cleared.

## Next Action

STOP FOR OWNER RELEASE-PREPARATION GATE. The safe next step is to build and independently verify an immutable Linux x64 / Node 24 production artifact from the exact verified repair source. Artifact construction must not contact production. After artifact verification, stop again for explicit Owner deployment authorization. Preserve pending uploads and keep RF-SEARCH01 frozen.