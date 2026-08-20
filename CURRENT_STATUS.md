# AcademicCloud Current Status

**Last reconciled:** 2026-08-20

`CURRENT_STATE.json` is the compact machine-readable pointer for current production/task identity. ADRs and task cards remain the historical decision/evidence record.

## Current Situation

AcademicCloud's immediate problem is still the storage incident, not a product-model rewrite.

`OPS-STORAGE-INCIDENT01` remains ACTIVE only for Owner product acceptance. The provider-side RAM repair is complete and verified. The application-side `ali-oss@6.23.0` `ListParts` runtime mismatch is proven, repaired, and now deployed through the exact production-baseline hotfix. The first production artifact remains permanently disallowed under the no-Search boundary; its failed-closed attempt and successful rollback remain historical evidence.

## Production Declaration

Production now runs the exact compatible storage-only hotfix:

```text
PRODUCTION_RELEASE=988bdbf052de1a39b47a1e22ac761c977eec72c8
PREVIOUS_RELEASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
SCHEMA=v21
MIGRATIONS=001-021
```

The authorized `988bdbf…` deployment passed exact release-scope, artifact/hash, immutable-install, process-identity, service, loopback/public health/readiness, schema/history, protected-configuration, RAM-readback, and pending-state gates. Only `academiccloud.service` restarted; Nginx was untouched. Rollback was not required. No migration, RAM change, credential/config change, SQLite mutation, pending-upload mutation, OSS object/part deletion, metadata mutation, or Search deployment occurred.

## Storage Incident Root Causes

Two independent issues were proven:

1. **Provider permission gap** — the production RAM user lacked `oss:ListParts` and `oss:AbortMultipartUpload`. `AcademicCloudProdOSS` v2 added only those two actions while retaining the existing Put/Get/Delete actions and exact `objects/*` resource. Raw production `ListParts` now returns HTTP 200.
2. **Application runtime-contract mismatch** — `ali-oss@6.23.0` can expose one `<Part>` as a singleton object and XML boolean/integer fields as strings. The old AcademicCloud port assumed canonical arrays/booleans/numbers and could reject a successful provider response.

Metadata Suggestion remains a separate acceptance item. Existing incident evidence ties the recorded suggestion failures to the overdue-payment `UserDisableError` window; no Metadata Range/OCR/parser change has been made.

## Original Repair Artifact — Do Not Redeploy

Original source:

```text
8d28970209c2e7b41b5d9486bea570a2a8e6c7e6
```

Original artifact:

```text
ARTIFACT_WORKFLOW=32366397645
ARTIFACT_ID=9405764771
GITHUB_ARTIFACT_SHA256=24858d7eab8003606a78a440d474ca549cca9904d984f04d777f60daf414b3ea
RELEASE_ARCHIVE_SHA256=03edbbe0f8b506bb7d3fbb9b929e90f89b8b6948b4256865fcd44d9c62e8bbe4
MANIFEST_SHA256=76e902496f3255293b670f09248cf73f5e8d665a77e0e7a2446e49b7fe05eeb4
```

That artifact passed technical verification but is **INVALID_FOR_PRODUCTION_SCOPE under the current no-Search boundary**. Comparing production `604cb8d…` to `8d289702…` showed 50 additional commits and included the RF-SEARCH01 backend/API/UI. The Owner-authorized deployment correctly failed closed on `AUTHORIZED_RELEASE_SCOPE_CONTAINS_FORBIDDEN_RF_SEARCH01_DEPLOYMENT` and rolled back. Do not select artifact ID `9405764771` again while the no-Search boundary remains in force.

## Production-Baseline Storage Hotfix

A replacement hotfix was created directly from the exact then-current production release:

```text
HOTFIX_BRANCH=hotfix/storage-listparts-from-prod-20260820
HOTFIX_BASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
HOTFIX_SOURCE=988bdbf052de1a39b47a1e22ac761c977eec72c8
```

Exact compare against production:

```text
COMMITS_AHEAD=2
FILES_CHANGED=2
backend/src/storage/aliyun/client.ts
backend/test/storage/aliyun-client-normalization.test.ts
RF_SEARCH01_INCLUDED=false
```

The hotfix contains only the proven `ListParts` runtime normalization and its regression test. No frontend/Search/database/migration/configuration/deployment/RAM/credential/product change is present in the release delta.

The repository's established Linux production-build workflow then ran on exact source `988bdbf…` through temporary draft PR #6, which was closed unmerged after success.

```text
ARTIFACT_WORKFLOW=32376005391
ARTIFACT_BUILD_JOB=96447439723 PASS
ARTIFACT_INDEPENDENT_VERIFY_JOB=96451515693 PASS
ARTIFACT_ID=9409511861
ARTIFACT_NAME=academiccloud-linux-x64-node24-988bdbf052de1a39b47a1e22ac761c977eec72c8
GITHUB_ARTIFACT_SHA256=dec7ef47249e8d148aa7d31b8e0ddf3861dbceb2319dec4aaaa83b94c612b150
RELEASE_ARCHIVE_SHA256=79cea866533e9da1b7d00fb0b3e62a3a3123a90bc20138b8c4d9d40141ed5f33
MANIFEST_SHA256=d6d8b22077d79e9018c6e3eef2cb4454e452995dbc3c1127e574257914e8ce30
INDEPENDENT_ARTIFACT_VERIFICATION=PASS
```

The workflow passed clean install, backend/frontend tests, typechecks, production builds, compiled acceptance, dependency audits, Argon2 benchmark, pinned release-local Tesseract build, realistic OCR E2E, deterministic rebuild, extracted-runtime verification, artifact upload, and fresh-runner independent downloaded-artifact verification.

## Storage Hotfix Production Deployment

The Owner authorized only the exact existing artifact above. Live preconditions re-proved production at `604cb8d…`, schema v21/history 001–021, and the exact two-commit/two-file no-Search delta. All authorized artifact identities and hashes matched. Host-side full packaged verification passed before immutable installation.

The release pointer switched atomically to `988bdbf…`, and only the AcademicCloud service restarted. Exact process CWD, active/running state, `NRestarts=0`, one loopback listener, and all four loopback/public health/readiness probes passed. Protected environment/systemd/Nginx hashes and Nginx runtime identity remained unchanged. Schema/history retained fingerprint `573fe6fb8b16cd644a41e48e12b8e1dfa416a9e551762849ae1864393b46ef63`; no migration command ran. Five multipart rows remain `uploading`, six files remain `pending_upload`, and the new service invocation has zero warning-or-higher events. A fresh RAM API readback returned 200 and reconfirmed default policy v2 with exactly Put/Get/Delete/ListParts/AbortMultipartUpload on the same `objects/*` resource; `ListMultipartUploads` remains absent. Rollback was not required.

## RF-SEARCH01

RF-SEARCH01 remains frozen and is not currently live. Its own release candidate remains:

```text
ARTIFACT_SOURCE_COMMIT=7bba7b869fd1234c1e7c67002cb93368c299209b
ARTIFACT_WORKFLOW=32331172274
ARTIFACT_ID=9393280984
ARTIFACT_SHA256=4b72062734fa941ea4bd48019713a4fbb8951a7793a04f625a3680d7c8e1a15b
MANIFEST_SHA256=beb15507b20c99679fb48cfe772c29d1d92a930b2adcd337202d88f0cff49458
INDEPENDENT_ARTIFACT_VERIFICATION=PASS
```

It was briefly exposed during the rolled-back incompatible repair deployment, but its source/artifact were not modified or rebuilt. Search production remains blocked until the compatible storage hotfix is safely deployed, `OPS-STORAGE-INCIDENT01` closes through real-browser acceptance, and Search's own mandatory pre-cutover browser gate passes.

## Current Priority

```text
Owner Continue / disposable Abandon / Metadata Suggestion acceptance
→ OPS-STORAGE-INCIDENT01 closure
→ RF-SEARCH01 production closure
→ L1-UX08
→ OPS-DEPENDENCY01
→ QA-GOLDEN01
→ ERR-BOUNDARY01
→ remaining reliability / Personal Research Workspace sequence
```

## Safety Boundaries

- Do not redeploy source `8d289702…` / artifact `9405764771` under the no-Search boundary.
- Production runs exact compatible storage release `988bdbf…` / artifact `9409511861`; no further storage deployment action is authorized.
- No further RAM/OSS policy mutation is authorized.
- No migration, credential change, config change, SQLite mutation, manual multipart complete/abort, pending-upload deletion, or metadata mutation is authorized.
- Do not change Metadata Suggestion implementation without a current post-hotfix browser reproduction and proven failure boundary.
- Do not cut over RF-SEARCH01 until the storage incident closes and Search's own browser gate passes.

## Next Action

**STOP FOR OWNER REAL-BROWSER STORAGE ACCEPTANCE.** The Owner next tests Continue on the existing resumable upload, Abandon on one disposable resumable upload, and Metadata Suggestion on an existing suitable document. Do not close the incident or progress to RF-SEARCH01 until those journeys pass.
