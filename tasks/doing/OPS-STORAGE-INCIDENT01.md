# OPS-STORAGE-INCIDENT01 — Post-Billing Storage/API Incident Diagnosis

## State
PROVIDER REPAIR VERIFIED + APPLICATION REPAIR ARTIFACT VERIFIED — incident remains open; STOP FOR OWNER PRODUCTION DEPLOYMENT DECISION.

## Trigger
Owner observed a real production outage pattern:

- existing multipart upload interrupted and became resumable;
- Continue upload fails;
- Abandon upload fails;
- metadata suggestion generation fails on existing files;
- Alibaba OSS had an overdue-payment suspension and has since been paid/restored in the provider console;
- after provider billing restoration, AcademicCloud still fails and a raw browser `Failed to fetch` error has appeared.

## Goal
Prove the first failing boundary across browser → Nginx → backend → OSS and distinguish residual provider recovery, network/proxy failure, backend crash/reset, credentials/policy/configuration, or application bug.

## Authorized Scope
The original read-only diagnosis covered:

- verify exact running release/process, service, Nginx, loopback/public health/readiness;
- inspect a bounded recent Nginx/systemd journal window corresponding to Owner attempts;
- perform one Owner-authorized existing-object `stat` and tiny Range read using the exact production runtime/config;
- inspect the existing pending multipart state and non-mutating `listParts`/status path if safe;
- correlate metadata-suggestion, continue-upload and abandon-upload failures with safe provider/backend error class/status/code;
- preserve the pending multipart upload.

The Owner subsequently authorized one exact provider-side correction: create
`AcademicCloudProdOSS` policy version `v2`, make it the default, retain the
existing action/resource scope, and add only `oss:ListParts` and
`oss:AbortMultipartUpload`.

After real-browser acceptance exposed the remaining Continue failure, the Owner separately authorized the bounded source-only `OPS-STORAGE-APP-REPAIR01`. That repair and its immutable production artifact are now fully verified; production deployment remains a separate explicit gate.

## Forbidden After the Provider Repair

- unapproved code/config/credential changes;
- any further RAM/OSS policy mutation or policy-version churn;
- service/Nginx restart merely to try fixes;
- migration/database edits;
- manual multipart complete/abort;
- deleting pending upload state;
- metadata mutation;
- RF-SEARCH01 rebuild/deploy;
- provider-wide scans or unrelated resource inspection.

## Required Classification
Determine whether the first failing boundary is browser→Nginx, Nginx→backend, backend crash/reset/timeout, backend→OSS network/TLS/DNS, OSS credential/policy/config, OSS service still partially unavailable after billing recovery, multipart-specific failure, metadata-suggestion-specific failure, or multiple independent faults.

Provider-safe diagnosis may record stable classes such as `AccessDenied`, `InvalidAccessKeyId`, `SecurityTokenExpired`, `SignatureDoesNotMatch`, `RequestTimeTooSkewed`, `NoSuchBucket`, `NoSuchUpload`, `ServiceUnavailable`, billing denial or network failure, but must never persist secrets, signed URLs, object keys, cookies or raw document content.

## Acceptance
- first failing boundaries proven from bounded evidence;
- pending uploads preserved except for an explicit Owner browser action;
- no speculative production/data/config mutation;
- minimal provider and application repair boundaries identified;
- provider repair verified with `HeadObject`, bounded `GetObject`, and raw `ListParts` from the exact production runtime;
- bounded application repair passes repository verification and immutable artifact verification before any deployment decision;
- preserve schema, credentials, configuration, and RF-SEARCH01;
- after an explicit Owner-authorized deployment, verify release identity/health/readiness and run Owner real-browser Continue, disposable Abandon, and metadata-suggestion acceptance.

## Diagnosis Findings (2026-08-20, read-only, no mutation)

First failing boundary proven: **backend → OSS**, with two distinct provider error classes across the incident window.

```text
browser → nginx → backend        : UP (public + loopback health/readiness 200; POST/GET reach backend; access log confirms requests)
backend → OSS HeadObject (stat)  : was UserDisableError at 12:34 (bucket disabled); NOW ok (bucket re-enabled)
backend → OSS GetObject (range)  : NOW ok
backend → OSS ListParts          : AccessDenied (403) "You have no right to access this object." — residual failure before RAM repair
```

Evidence:

- Runtime: release `604cb8d…`, service active (`NRestarts=0`), Nginx active, one loopback listener, health/readiness 200 (loopback + public).
- Nginx access log (`/var/log/academiccloud/nginx-access.log.1`, the still-active rotated file): 4,220 × `GET 503 {"error":"storage_unavailable"}` (multipart status polling), 5 × `POST 500 {"error":"metadata_suggestion_internal_error"}`, 2 × `POST 502` (Nginx→backend, 10–26 s).
- Backend journal: exactly 5 `metadata_suggestion.generation_failed` events, all at 12:34, all `errorType=UserDisableError`, stack through `ali-oss Client.head → AliyunOssStorageAdapter.statObject → SuggestionService.generate`; **zero** suggestion failures after 13:00 in that diagnostic window.
- Direct OSS probe (production runtime/config, read-only): `statObject` ok (240 MB PDF, md5), `readObjectRange(0,8)` ok (8 bytes), `listMultipartParts` → `AccessDeniedError` 403 "You have no right to access this object." before RAM repair.

The overdue-payment suspension was the initial provider outage. After billing restoration, ordinary object reads recovered while the production RAM policy still lacked the multipart control-plane actions actually required by AcademicCloud.

Correlation before provider repair:

- `UPLOAD_CONTINUE_FAILURE_BOUNDARY` = backend → OSS `listMultipartParts` → AccessDenied (403) → `storage_unavailable` 503.
- `UPLOAD_ABANDON_FAILURE_BOUNDARY` = backend → OSS `abortMultipartUpload` permission gap → `storage_unavailable` family.
- `METADATA_FAILURE_BOUNDARY` = backend → OSS `HeadObject` during the disabled window (`UserDisableError`) → `metadata_suggestion_internal_error` 500.
- `Failed to fetch` (browser) = the 502/network-timeout class during the disabled window (2 × Nginx 502 at 10–26 s), not evidence by itself of a frontend defect.

The later effective-policy inspection narrowed the provider repair boundary further: `oss:ListMultipartUploads` is not used by the AcademicCloud multipart contract. The application uses `PutObject` for initiate/upload-part/complete, `ListParts` for server-authoritative resume state, and `AbortMultipartUpload` for abandon.

## Provider Permission Repair (2026-08-20)

Effective principal/policy evidence before mutation:

- exact runtime `GetCallerIdentity`: RAM user `academiccloud-prod`; static credential; no principal mismatch;
- direct user attachment: one custom policy, `AcademicCloudProdOSS`; no system policy and no group inheritance;
- default version `v1`: Allow only `oss:PutObject`, `oss:GetObject`, and `oss:DeleteObject` on `acs:oss:*:*:ajt-academiccloud-kl-8f3c/objects/*`;
- no RAM `Deny`; no bucket-policy statement or bucket-policy `Deny`; exact bucket/prefix resource matched production configuration.

Root cause of the residual provider authorization failure was therefore **missing RAM allows** for `oss:ListParts` and `oss:AbortMultipartUpload`, not an explicit deny, resource mismatch, principal mismatch, invalid AccessKey, or provider-residual denial under a correct policy.

Exact authorized mutation:

- created `AcademicCloudProdOSS` version `v2` and made it default;
- retained `oss:PutObject`, `oss:GetObject`, `oss:DeleteObject`, and the exact resource unchanged;
- added only `oss:ListParts` and `oss:AbortMultipartUpload`;
- did not grant `oss:ListMultipartUploads`, `oss:*`, administrator access, any other resource, or any other action;
- retained version `v1` as non-default; did not rotate credentials.

Readback and exact-runtime verification:

- provider readback: `v2`, `IsDefaultVersion=true`, exact five-action document;
- `OSS_STAT=PASS`;
- `OSS_RANGE_READ=PASS` (bounded 8-byte read);
- raw `OSS_LIST_PARTS=PASS` (HTTP 200 from the production `ali-oss` runtime);
- release/process CWD remained `604cb8daf310696353e99c30ce7a924dc71ef9d2`;
- schema remained v21/history 001–021;
- service remained active/running, `NRestarts=0`, one loopback listener;
- loopback/public health/readiness returned 200;
- no credential/config/migration/application release change occurred in the provider repair.

The exact runtime then exposed a separate application compatibility defect: raw `ListParts` was authorized and successful, but the SDK/runtime representation did not match the canonical port assumptions.

## Application Runtime Contract Repair (2026-08-20)

Read-only inspection and exact-dependency reproduction established the complete `ali-oss@6.23.0` behavior:

- a single `<Part>` is exposed as one object rather than a one-element array;
- `PartNumber` and `Size` can remain decimal strings;
- `isTruncated` can remain a boolean string;
- `nextPartNumberMarker` can remain a decimal string.

The old application path was reproduced without network I/O:

```text
one Part -> TypeError: (result.parts ?? []).map is not a function
empty/non-truncated string paging fields -> OSS returned an invalid multipart part marker
```

`OPS-STORAGE-APP-REPAIR01` therefore normalizes only this exact provider representation at the Aliyun client boundary before the existing canonical storage adapter. All non-`listParts` SDK paths and existing multipart semantic validation remain unchanged.

Exact source verification:

```text
SOURCE=8d28970209c2e7b41b5d9486bea570a2a8e6c7e6
BASE=281263be7f6248a4d18e099b59cf49028ec277ca
SOURCE_CI_RUN=32365460608
FOCUSED_STORAGE=20/20 PASS
BACKEND=376 PASS / 0 FAIL / 1 EXPECTED SKIP
FRONTEND=241/241 PASS
TYPECHECK=PASS
PRODUCTION_BUILD=PASS
GIT_DIFF_CHECK=PASS
```

Immutable production artifact verification:

```text
ARTIFACT_WORKFLOW=32366397645
ARTIFACT_BUILD_JOB=96416730271 PASS
ARTIFACT_INDEPENDENT_VERIFY_JOB=96419650061 PASS
ARTIFACT_ID=9405764771
ARTIFACT_NAME=academiccloud-linux-x64-node24-8d28970209c2e7b41b5d9486bea570a2a8e6c7e6
GITHUB_ARTIFACT_SHA256=24858d7eab8003606a78a440d474ca549cca9904d984f04d777f60daf414b3ea
RELEASE_ARCHIVE_SHA256=03edbbe0f8b506bb7d3fbb9b929e90f89b8b6948b4256865fcd44d9c62e8bbe4
MANIFEST_SHA256=76e902496f3255293b670f09248cf73f5e8d665a77e0e7a2446e49b7fe05eeb4
COMPILED_ACCEPTANCE=PASS
DEPENDENCY_AUDIT=PASS
DETERMINISTIC_REBUILD=PASS
INDEPENDENT_ARTIFACT_VERIFICATION=PASS
```

The fresh-runner verifier downloaded the exact artifact and verified release checksum/manifest, native modules, PDF.js/canvas, release-local Tesseract closure/models/synthetic OCR, and compiled acceptance. A separate post-workflow download independently re-hashed the archive and manifest with the same values.

Production remained unchanged throughout source repair and artifact construction:

```text
PRODUCTION_RELEASE=604cb8daf310696353e99c30ce7a924dc71ef9d2
SCHEMA=v21 / 001-021
PRODUCTION_TOUCHED=false
MIGRATIONS_RUN=false
RAM_CHANGED_IN_APP_REPAIR=false
CREDENTIALS_CHANGED=false
CONFIG_CHANGED=false
DATABASE_MUTATED=false
PENDING_UPLOADS_MUTATED_BY_APP_REPAIR=false
RF_SEARCH01_TOUCHED=false
```

## Next Action
STOP FOR OWNER PRODUCTION DEPLOYMENT DECISION. If explicitly authorized, deploy **only** artifact ID `9405764771` / source `8d28970209c2e7b41b5d9486bea570a2a8e6c7e6` through the existing production runbook, verify exact release identity plus health/readiness, and then run Owner real-browser Continue → disposable Abandon → Metadata Suggestion acceptance. Do not rebuild, substitute another source, run migrations, change RAM/config/credentials, or touch RF-SEARCH01 as part of that deployment unless new evidence independently requires it.