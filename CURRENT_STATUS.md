# AcademicCloud Current Status

**Last reconciled:** 2026-08-20

`CURRENT_STATE.json` is the compact machine-readable pointer for current production/task identity. ADRs and task cards remain the historical decision/evidence record.

## Current Situation

AcademicCloud's immediate problem is still the storage incident, not a product-model rewrite.

`OPS-STORAGE-INCIDENT01` remains ACTIVE only for Owner product acceptance. The provider-side RAM repair is complete and verified. R3 repaired the three later proven product boundaries: a valid non-truncated empty `ListParts` marker, the missing browser multipart CORS contract, and the incorrect legacy abandon fallback for recovered durable multipart uploads. Exact bounded release `08657727…` is live and green. The first production artifact remains permanently disallowed under the no-Search boundary; its failed-closed attempt and successful rollback remain historical evidence.

## Production Declaration

Production now runs the exact bounded R3 storage repair:

```text
PRODUCTION_RELEASE=08657727a17a7ea766ad0d74cc663fa40f91eee1
PREVIOUS_RELEASE=988bdbf052de1a39b47a1e22ac761c977eec72c8
SCHEMA=v21
MIGRATIONS=001-021
```

The authorized `08657727…` deployment passed exact release-scope, artifact/hash, immutable-install, Linux host verification, process-identity, service, loopback/public health/readiness, schema/history, protected-configuration, and pending-state gates. Only `academiccloud.service` restarted; Nginx kept the same process identity. Rollback was not required. No migration, RAM change, credential/application-environment change, SQLite mutation, pending-upload mutation, OSS object/part deletion, metadata mutation, or Search deployment occurred. All seven pending files remain: six `uploading` multipart rows at revision 0 plus one legacy pending file.

## Storage Incident Root Causes

The initial outage and all later independent boundaries are proven:

1. **Provider interruption and permission gap** — overdue-payment suspension produced `UserDisableError`; after billing restoration the production RAM user still lacked `oss:ListParts` and `oss:AbortMultipartUpload`. `AcademicCloudProdOSS` v2 added only those two actions while retaining the existing Put/Get/Delete actions and exact `objects/*` resource. Raw production `ListParts` then returned HTTP 200.
2. **ListParts normalization** — `ali-oss@6.23.0` can expose one `<Part>` as a singleton object and XML boolean/integer fields as strings. It also returns `nextPartNumberMarker=""` for a valid empty, non-truncated result. Release `988bdbf…` handled the general runtime shape but still rejected that exact empty marker; R3 maps only this valid non-truncated empty marker to canonical `0` and keeps truncated/malformed markers fail-closed.
3. **Browser multipart CORS** — the exact bucket rule had the correct Origin and `POST`, but lacked `PUT` and `Content-MD5`. The rule now preserves the exact Origin and `POST`, adds only `PUT`, permits only `Content-MD5`, retains no exposed headers and max age 300, and has no wildcard or unrelated method/header.
4. **Recovered multipart abandon routing** — a durable multipart job with `transfer=null` incorrectly used hydration success as the discriminator and fell through to legacy abandon on hydration failure. R3 classifies from durable `uploadKind`; multipart jobs hydrate the authoritative status/version before the multipart endpoint, hydration failure surfaces without a destructive fallback, and only durable legacy jobs use legacy abandon.

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

## R3 Final Bounded Repair

R2 real-browser evidence proved three later boundaries without reopening the accepted provider diagnosis. The exact R3 branch was created from then-current production `988bdbf…`:

```text
R3_BRANCH=codex/storage-r3-from-prod-20260820
R3_BASE=988bdbf052de1a39b47a1e22ac761c977eec72c8
R3_SOURCE=08657727a17a7ea766ad0d74cc663fa40f91eee1
COMMITS_AHEAD=1
FILES_CHANGED=10
RUNTIME_FILES_CHANGED=2
RF_SEARCH01_INCLUDED=false
```

The only runtime changes are `backend/src/storage/aliyun/client.ts` and `frontend/src/App.tsx`. The remaining delta is focused regression coverage plus the exact CORS readiness test/script, deployment checklist, bootstrap delegation, and root test command. No Search, migration, metadata-suggestion, OCR, dependency, application-environment, RAM, credential, or unrelated product change is present.

Verification passed:

```text
FOCUSED_BACKEND=14/14 PASS
FOCUSED_FRONTEND=117/117 PASS
CORS_CONTRACT=3/3 PASS
BACKEND=364 PASS / 0 FAIL / 1 EXPECTED SKIP
FRONTEND=224/224 PASS
TYPECHECK=PASS
PRODUCTION_BUILD=PASS
TESSERACT_RUNTIME=1/1 PASS
GIT_DIFF_CHECK=PASS

ARTIFACT_WORKFLOW=32385758471
ARTIFACT_BUILD_JOB=96479723115 PASS
ARTIFACT_INDEPENDENT_VERIFY_JOB=96483835775 PASS
ARTIFACT_ID=9413295334
ARTIFACT_NAME=academiccloud-linux-x64-node24-08657727a17a7ea766ad0d74cc663fa40f91eee1
GITHUB_ARTIFACT_SHA256=e72c5c5ef29029dc0d60bedcaf32402e8eaebd416c8a6479024483f7f2dca767
RELEASE_ARCHIVE_SHA256=f18b3068fbcced6816b267c569e4c2080abe589e7fdef37cb812fdc2e2fc33be
MANIFEST_SHA256=a4d51fc043a2b9d830401a8c55e0e7df318fa331e5f87ad2b6376e45f4c2aedf
MANIFEST_FILES=5384
MANIFEST_BYTES=125854201
INDEPENDENT_AND_HOST_ARTIFACT_VERIFICATION=PASS
```

The sole provider mutation edited the existing CORS rule. Before: exact Origin `https://cloud.ajtlab.top`, `POST` only, no allowed/exposed headers, max age 300. After: the same exact Origin and max age, `POST` plus only `PUT`, allowed header only `Content-MD5`, and still no exposed headers. Safe live OPTIONS verification passed the exact positive PUT/Content-MD5 contract and rejected GET, unapproved headers, foreign/HTTP/local Origins, and wildcard behavior. RAM, credentials, bucket ACL, object ownership, bucket/endpoint, custom domain, and application environment were unchanged.

The root-owned immutable release was installed only after exact GitHub digest, archive checksum, manifest, compiled/native/OCR runtime, scope, schema-021, and no-Search gates passed locally and on the production Linux host. The pointer switched atomically from `988bdbf…` to `08657727…`; only `academiccloud.service` restarted. Exact process CWD, active/running state, `NRestarts=0`, all four health/readiness probes, zero post-cutover service errors, unchanged protected hashes/Nginx PID, schema fingerprint, integrity, and foreign keys are green. Pre/post database snapshots match exactly: seven `pending_upload` files, six multipart rows all `uploading` at revision 0, and one legacy pending file. No migration or manual upload/OSS object/part action occurred; rollback was not required.

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

It was briefly exposed during the rolled-back incompatible repair deployment, but its source/artifact were not modified or rebuilt. It is absent from the current R3 production release. Search production remains blocked until `OPS-STORAGE-INCIDENT01` closes through the five Owner R3 real-browser journeys and Search's own mandatory pre-cutover browser gate passes.

## Current Priority

```text
Owner existing Resume / new multipart upload / disposable multipart Abandon / preview-download / Metadata Suggestion acceptance
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
- Production runs exact bounded R3 release `08657727…` / artifact `9413295334`; no further storage deployment action is authorized.
- No further RAM/OSS/CORS policy mutation is authorized.
- No migration, credential change, config change, SQLite mutation, manual multipart complete/abort, pending-upload deletion, or metadata mutation is authorized.
- Preserve all seven pending files and six multipart rows; do not manually complete or abort them for the Owner.
- Do not change Metadata Suggestion implementation without a current post-R3 browser reproduction and proven failure boundary.
- Do not cut over RF-SEARCH01 until the storage incident closes and Search's own browser gate passes.

## Next Action

**STOP FOR OWNER REAL-BROWSER STORAGE ACCEPTANCE.** The Owner next tests: (1) the current existing resumable upload through completion with completed parts reused; (2) one new real multipart PDF upload through completion; (3) one disposable multipart Abandon; (4) file open, preview, and download; and (5) one current Metadata Suggestion attempt. Do not close the incident or progress to RF-SEARCH01 until all five journeys pass.
