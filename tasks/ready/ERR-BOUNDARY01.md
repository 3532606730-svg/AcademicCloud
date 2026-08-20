# ERR-BOUNDARY01 — Unified Product Error Boundary & Correlation

## Goal
Stop leaking raw browser/provider/internal messages such as `Failed to fetch` while preserving enough safe correlation to diagnose real incidents.

## Scope
Define a small stable error taxonomy across browser/API/storage/background work, for example:

- service_unreachable;
- storage_unavailable;
- upload_unreachable;
- upload_rejected;
- upload_stalled;
- upload_session_expired;
- permission_denied;
- conflict/concurrent_change;
- processing_failed;
- internal_error.

Map raw `TypeError: Failed to fetch`, XHR/network failures and provider exceptions into user-actionable localized copy. Add a safe request/correlation ID from ingress through application logs and returned error envelopes where appropriate.

## Security
Never expose raw stack traces, provider request bodies, signed URLs, credentials, cookies, object keys or private document content. Provider error/status may be retained only in secret-safe operational logs.

## Acceptance
- raw `Failed to fetch` never appears in normal UI;
- user can distinguish service unreachable vs storage unavailable vs retryable upload issue;
- one correlation ID can connect a browser-visible failure to bounded server evidence;
- tests cover unknown error fallback and secret redaction.
