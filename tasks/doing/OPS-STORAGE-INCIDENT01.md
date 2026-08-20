# OPS-STORAGE-INCIDENT01 — Post-Billing Storage/API Incident Diagnosis

## State
DIAGNOSED — root cause proven; STOP FOR OWNER REVIEW before any repair.

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
Read-only diagnosis only:

- verify exact running release/process, service, Nginx, loopback/public health/readiness;
- inspect a bounded recent Nginx/systemd journal window corresponding to Owner attempts;
- perform one Owner-authorized existing-object `stat` and tiny Range read using the exact production runtime/config;
- inspect the existing pending multipart state and non-mutating `listParts`/status path if safe;
- correlate metadata-suggestion, continue-upload and abandon-upload failures with safe provider/backend error class/status/code;
- preserve the pending multipart upload.

## Forbidden Without New Owner Approval

- code/config/credential changes;
- RAM/OSS policy mutation;
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
- STOP for Owner approval before repair.

## Next Action
Run the bounded live diagnosis once, using the Owner's latest failure window; do not guess-fix.

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

Repair boundary (requires Owner approval — not performed): provider-side RAM/ACL re-grant for `oss:ListParts`/`oss:ListMultipartUploads`/`oss:AbortMultipartUpload` (or an Alibaba support case for the residual AccessDenied after billing restoration). No application code, config, credential, restart, migration, or DB change is required for diagnosis; any of those for repair remains a separate Owner gate.

## Next Action (post-diagnosis)
STOP FOR OWNER REVIEW before any repair that requires production mutation, credential/policy/config change, restart, deployment, or destructive action.
