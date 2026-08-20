# AcademicCloud Current Status

**Last reconciled:** 2026-08-20

`CURRENT_STATE.json` is the compact machine-readable pointer for current production/task identity. ADRs and completed task cards remain the historical decision/evidence record.

## Current Situation

AcademicCloud's domain model and backend architecture remain accepted: one Owner-governed shared academic corpus, private per-account research activity, browser-direct object-storage transfer, explicit lifecycle/CAS boundaries, and provider-neutral storage abstraction.

The immediate problem is operational/runtime integration, not a product-model rewrite.

### Active production incident

`OPS-STORAGE-INCIDENT01` remains ACTIVE. The bounded provider permission repair is complete and verified; the bounded application source repair and its immutable artifact are also technically verified. The first Owner-authorized application deployment failed closed on a release-scope contradiction and rolled back successfully. The incident cannot close until a compatible repair release is explicitly authorized/deployed and the Owner's real-browser Continue/Abandon/metadata journeys pass.

Owner-observed production symptoms after an Alibaba OSS overdue-payment interruption include:

- the overdue-payment suspension caused historical `UserDisableError` failures;
- after billing restoration, HeadObject/GetObject recovered but ListParts returned AccessDenied 403;
- effective-policy inspection proved the exact production RAM user had only PutObject/GetObject/DeleteObject on the correct `objects/*` resource;
- the Owner-authorized `AcademicCloudProdOSS` v2 added only ListParts and AbortMultipartUpload, retained the exact prior scope, and is now default;
- non-mutating production probes now pass stat, bounded Range read, and raw ListParts (HTTP 200).

The policy root cause was **missing RAM allow**, with no explicit deny, bucket policy, resource/prefix mismatch, principal mismatch, invalid AccessKey, or provider-residual AccessDenied after the exact policy correction.

The exact runtime investigation then proved a separate application defect in the `ListParts` boundary. `ali-oss@6.23.0` forwards XML scalar values directly and represents one `<Part>` as a singleton object; therefore `PartNumber`, `Size`, `isTruncated`, and paging markers may remain strings while one-Part `parts` is not an array. The old canonical path could therefore reject a provider-success response before resume reconciliation.

Metadata Suggestion remains a separate acceptance item. Existing incident evidence tied the recorded suggestion failures to the overdue-payment disabled window (`UserDisableError` at `HeadObject`) and found no proven post-recovery suggestion implementation defect. No Metadata Range/OCR/parser change has been made.

### Verified application repair, incompatible artifact scope, and rollback

`OPS-STORAGE-APP-REPAIR01` is verified on isolated branch `codex/storage-runtime-contract-repair-20260820`, based on authoritative base `281263be7f6248a4d18e099b59cf49028ec277ca`.

Exact repair source:

```text
8d28970209c2e7b41b5d9486bea570a2a8e6c7e6
```

The repair normalizes only the complete proven `ListParts` representation at the Aliyun client boundary. It preserves the existing SDK instance and all other SDK method paths; `AliyunOssStorageAdapter` continues to own canonical range/count/order/duplicate validation.

Repository-native source verification via Actions run `32365460608` / job `96413882821` passed:

- focused real-SDK Aliyun storage regressions: 20/20;
- backend: 376 PASS, 0 FAIL, 1 expected skip;
- frontend: 241/241;
- root Tesseract runtime verifier: 1/1;
- backend/frontend typechecks: PASS;
- backend/frontend production builds: PASS;
- `git diff --check`: PASS.

An immutable Linux x64 / Node 24 production artifact was then built from **exactly that same source** through Actions run `32366397645`. Build job `96416730271` and fresh-runner independent verification job `96419650061` both passed. The workflow covered clean install, full tests, typechecks/builds, compiled acceptance, dependency audits, Argon2 benchmark, pinned release-local Tesseract construction, realistic OCR E2E, deterministic rebuild, manifest/runtime verification, artifact upload, and independent downloaded-artifact verification.

```text
STORAGE_REPAIR_ARTIFACT_ID=9405764771
STORAGE_REPAIR_ARTIFACT_NAME=academiccloud-linux-x64-node24-8d28970209c2e7b41b5d9486bea570a2a8e6c7e6
GITHUB_ARTIFACT_SHA256=24858d7eab8003606a78a440d474ca549cca9904d984f04d777f60daf414b3ea
RELEASE_ARCHIVE_SHA256=03edbbe0f8b506bb7d3fbb9b929e90f89b8b6948b4256865fcd44d9c62e8bbe4
MANIFEST_SHA256=76e902496f3255293b670f09248cf73f5e8d665a77e0e7a2446e49b7fe05eeb4
INDEPENDENT_ARTIFACT_VERIFICATION=PASS
```

A direct post-workflow download of artifact ID `9405764771` independently re-hashed the archive and manifest and matched the fresh-runner verification evidence.

The 2026-08-20 production attempt passed artifact identity, manifest verification, immutable installation, release switch, exact process CWD, service, and loopback/public health/readiness. The required final Search-scope audit then proved that exact source `8d289702…` descends from frozen RF-SEARCH01 candidate `7bba7b869fd1234c1e7c67002cb93368c299209b` and ships the Search UI/API. This conflicts with the same deployment authorization's explicit no-Search boundary. The attempt therefore failed closed and performed the established same-schema application-only rollback.

## Production Declaration

Production is restored to the exact pre-attempt release:

```text
PRODUCTION_RELEASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
PREVIOUS_RELEASE=a5e2bc21f2ae8e38ad6ac33850ea8b4699a8f57a
SCHEMA=v21
MIGRATIONS=001-021
```

The deployment attempt briefly selected `8d289702…` and restarted only AcademicCloud, then restored `604cb8d…`. Post-rollback evidence proves exact old process CWD, active/running service, `NRestarts=0`, one loopback listener, loopback/public health/readiness 200, schema v21/history 001–021 with unchanged fingerprint, old-release tree SHA-256 `6fd8fd7d431d1ef38e2700a0c9fd5c66f5869af3008912ba837fbf5f50a38d31`, five preserved `uploading` multipart rows, and six preserved `pending_upload` file rows. No migration, credential/config/RAM/Nginx change, SQLite mutation, manual multipart complete/abort, pending-upload mutation, OSS object/part deletion, or metadata mutation occurred.

## RF-SEARCH01

Development remains green and its exact release candidate remains frozen. It is not currently live, but it was briefly exposed by the incompatible repair artifact during the rolled-back deployment attempt; durable state must not describe that attempt as `RF_SEARCH01_TOUCHED=false`.

```text
ARTIFACT_SOURCE_COMMIT=7bba7b869fd1234c1e7c67002cb93368c299209b
ARTIFACT_WORKFLOW=32331172274
ARTIFACT_ID=9393280984
ARTIFACT_SHA256=4b72062734fa941ea4bd48019713a4fbb8951a7793a04f625a3680d7c8e1a15b
MANIFEST_SHA256=beb15507b20c99679fb48cfe772c29d1d92a930b2adcd337202d88f0cff49458
INDEPENDENT_ARTIFACT_VERIFICATION=PASS
```

RF-SEARCH01 production remains blocked until the storage repair is safely deployed, `OPS-STORAGE-INCIDENT01` closes through real-browser acceptance, and Search's own mandatory real-browser pre-cutover gate passes. No RF-SEARCH01 source or artifact was modified or rebuilt by the failed attempt.

## Reliability / Product-Maturity Interlock

```text
OPS-STORAGE-APP-REPAIR01 failed-closed release-scope review
→ OPS-STORAGE-INCIDENT01 browser acceptance / closure
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

- Source repair and immutable artifact verification are complete, but artifact `8d289702…` is incompatible with the explicit no-Search deployment boundary and must not be reselected under that boundary.
- No further RAM/OSS policy mutation is authorized by this repair.
- No migration, credential change, config change, SQLite mutation, manual multipart complete/abort, pending-upload deletion, or metadata mutation is authorized.
- A repair-only source/artifact or an explicit revision of the no-Search boundary requires new Owner authorization and renewed exact-source verification.
- No Metadata Suggestion implementation change without a current reproduced post-deployment failure boundary.
- No Search cutover until the storage repair, incident closure, and browser gates pass.

## Next Action

**STOP FOR OWNER REVIEW OF THE FAILED-CLOSED RELEASE-SCOPE GATE.** Do not redeploy artifact ID `9405764771` while the no-Search boundary remains in force, and do not begin Owner browser storage acceptance. New authorization is required for either a repair-only artifact that excludes RF-SEARCH01 or an explicit revision of the Search boundary and acceptance sequence.
