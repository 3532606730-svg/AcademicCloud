# OPS-STORAGE-INCIDENT01 — Post-Billing Storage/API Incident Diagnosis

## State
ACTIVE — diagnosis only.

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
