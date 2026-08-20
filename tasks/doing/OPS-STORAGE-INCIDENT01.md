# OPS-STORAGE-INCIDENT01 — Post-Billing Storage/API Incident Diagnosis

## State
PROVIDER REPAIR VERIFIED — incident remains open; STOP FOR OWNER PRODUCT ACCEPTANCE.

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

## Forbidden After the Provider Repair

- code/config/credential changes;
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
- first failing boundary proven from bounded evidence;
- pending upload preserved;
- no production/data/config mutation;
- minimal repair boundary identified;
- report whether restart/config/credential/RAM/code change is actually required;
- after the exact repair, verify `HeadObject`, bounded `GetObject`, and
  `ListParts` non-mutatively from the exact production runtime;
- preserve release, schema, service, configuration, credentials, and every
  pending upload;
- STOP for Owner real-browser Continue, Abandon, and metadata-suggestion tests.

## Next Action
Owner performs the three real-browser product-acceptance journeys. Do not
manually Continue, Abandon, or complete a pending upload on the Owner's behalf.

## Diagnosis Findings (2026-08-20, read-only, no mutation)

First failing boundary proven: **backend → OSS**, with two distinct provider error classes across the incident window.

```text
browser → nginx → backend        : UP (public + loopback health/readiness 200; POST/GET reach backend; access log confirms requests)
backend → OSS HeadObject (stat)  : was UserDisableError at 12:34 (bucket disabled); NOW ok (bucket re-enabled)
backend → OSS GetObject (range)  : NOW ok
backend → OSS ListParts          : AccessDenied (403) "You have no right to access this object." — CURRENT residual failure
```

Evidence:

- Runtime: release `604cb8d…`, service active (`NRestarts=0`), Nginx active, one loopback listener, health/readiness 200 (loopback + public).
- Nginx access log (`/var/log/academiccloud/nginx-access.log.1`, the still-active rotated file): 4,220 × `GET 503 {"error":"storage_unavailable"}` (multipart status polling), 5 × `POST 500 {"error":"metadata_suggestion_internal_error"}`, 2 × `POST 502` (Nginx→backend, 10–26 s).
- Backend journal: exactly 5 `metadata_suggestion.generation_failed` events, all at 12:34, all `errorType=UserDisableError`, stack through `ali-oss Client.head → AliyunOssStorageAdapter.statObject → SuggestionService.generate`; **zero** suggestion failures after 13:00.
- Direct OSS probe (production runtime/config, read-only): `statObject` ok (240 MB PDF, md5), `readObjectRange(0,8)` ok (8 bytes), `listMultipartParts` → `AccessDeniedError` 403 "You have no right to access this object."

Root cause: the OSS bucket was suspended for overdue payment (`UserDisableError`). After billing restoration, ordinary object reads (Head/Get) recovered, but the multipart control-plane (ListParts, and by extension AbortMultipartUpload used by abandon) still returns `AccessDenied` — a residual provider-side RAM/ACL or multipart-permission state, not an application bug, backend crash, or Nginx fault.

Correlation:

- `UPLOAD_CONTINUE_FAILURE_BOUNDARY` = backend → OSS `listMultipartParts` → AccessDenied (403) → `storage_unavailable` 503.
- `UPLOAD_ABANDON_FAILURE_BOUNDARY` = backend → OSS `abortMultipartUpload` (multipart control-plane) → AccessDenied family → `storage_unavailable` 503.
- `METADATA_FAILURE_BOUNDARY` = backend → OSS `HeadObject` during the disabled window (`UserDisableError`) → `metadata_suggestion_internal_error` 500; resolved with billing restoration (no failures after 13:00).
- `Failed to fetch` (browser) = the 502/network-timeout class during the disabled window (2 × Nginx 502 at 10–26 s), not a current app defect.

Pending multipart uploads (4, state `uploading`, provider `aliyun-oss`) are preserved and untouched.

The later effective-policy inspection narrowed the repair boundary further:
`oss:ListMultipartUploads` is not used by the AcademicCloud multipart contract.
The application uses `PutObject` for initiate/upload-part/complete,
`ListParts` for server-authoritative resume state, and
`AbortMultipartUpload` for abandon.

## Provider Permission Repair (2026-08-20)

Effective principal/policy evidence before mutation:

- exact runtime `GetCallerIdentity`: RAM user `academiccloud-prod`; static
  credential; no principal mismatch;
- direct user attachment: one custom policy, `AcademicCloudProdOSS`; no system
  policy and no group inheritance;
- default version `v1`: Allow only `oss:PutObject`, `oss:GetObject`, and
  `oss:DeleteObject` on
  `acs:oss:*:*:ajt-academiccloud-kl-8f3c/objects/*`;
- no RAM `Deny`; no bucket-policy statement or bucket-policy `Deny`; exact
  bucket/prefix resource matched production configuration.

Root cause was therefore **missing RAM allows** for `oss:ListParts` and
`oss:AbortMultipartUpload`, not an explicit deny, resource mismatch, principal
mismatch, invalid AccessKey, or provider-residual denial under a correct policy.

Exact authorized mutation:

- created `AcademicCloudProdOSS` version `v2` and made it default;
- retained `oss:PutObject`, `oss:GetObject`, `oss:DeleteObject`, and the exact
  resource unchanged;
- added only `oss:ListParts` and `oss:AbortMultipartUpload`;
- did not grant `oss:ListMultipartUploads`, `oss:*`, administrator access, any
  other resource, or any other action;
- retained version `v1` as non-default; did not rotate credentials.

Readback and exact-runtime verification:

- provider readback: `v2`, `IsDefaultVersion=true`, exact five-action document;
- `OSS_STAT=PASS`;
- `OSS_RANGE_READ=PASS` (bounded 8-byte read);
- `OSS_LIST_PARTS=PASS` (HTTP 200 from the production `ali-oss` runtime);
- release and process CWD remain exact
  `604cb8daf310696353e99c30ce7a924dc71ef9d2`;
- schema remains v21/history 001–021;
- service active/running, `NRestarts=0`, one loopback listener;
- loopback and public health/readiness all return 200;
- five `uploading` multipart rows and six `pending_upload` file rows were
  present after repair; none was completed, abandoned, deleted, or edited.

The exact runtime also exposed a separate post-authorization compatibility
finding: OSS returned `isTruncated` and `nextPartNumberMarker` as strings, while
the current adapter's strict response parser expects boolean/numeric values and
rejected that otherwise successful response as an invalid marker. No
application code/config/release change is authorized in this repair. The raw
provider permission gate is green, and the incident deliberately remains open
for the Owner's real-browser journeys and disposition of any product-level
failure they reproduce.

## Next Action (post-repair)
STOP FOR OWNER PRODUCT ACCEPTANCE: Continue upload, Abandon upload, then Find
metadata suggestions. Do not close this incident until all three real-browser
journeys pass.
