# ADR-029 — Provider-Backed Multipart Transfer and Browser-Native Range Resume

**Date:** 2026-08-19
**Status:** Accepted through RF-TRANSFER01 development checkpoint

## Context

AcademicCloud's earlier upload path retried a whole object from byte zero. That
behavior is not an acceptable control-plane contract for large academic files:
the server must remain free of large-file buffering, completed provider work
must be reusable, and a failed or paused transfer must not weaken account,
Library, contribution, provenance, or private-overlay authority. Downloads must
also remain usable through the browser's native range-capable download manager
rather than buffering the whole file in JavaScript.

RF-TRANSFER01 confirmed that the multipart lifecycle and its persistence are a
durable architecture decision, not an Aliyun-specific implementation detail.

## Decision

### Provider-neutral transfer boundary

- Business and Drive code depend only on a provider-neutral storage adapter.
  Provider SDK calls, opaque provider upload IDs, signed part URLs, ListParts,
  completion, and abort remain behind that adapter.
- The backend never proxies or buffers large file bytes. Browsers upload parts
  directly to object storage using short-lived, exact-object/exact-part signed
  authorization.

### Bounded multipart contract

- New uploads use an 8 MiB part size, an existing-file limit of 5 GiB, and at
  most 640 parts. The contract remains within the provider's 100 KiB–5 GiB
  part bounds and 1–10,000 part count bounds.
- One provider ListParts page is sufficient for the bounded 640-part maximum;
  the adapter still exposes the provider page boundary explicitly and rejects
  ambiguous or inconsistent part metadata.
- Browser concurrency is capped at three parts with three bounded retries and
  250/500 ms backoff. Each part and the whole file carry MD5 identity evidence.

### Server-authoritative lifecycle and CAS

- Migration 021 stores the opaque provider upload ID, file/domain identity,
  fixed part contract, total parts, expiry, lifecycle state, and revision. The
  server derives and revalidates account/Library authority and file identity at
  every lifecycle transition.
- Internal states are `uploading`, `paused`, `completing`, and `abandoning`.
  Compare-and-swap guards pause/resume, completion, abandonment, restart, and
  two-tab races. `abandoning` is an internal lock and is not exposed as a
  resumable public state.
- Resume reconciles provider ListParts, reuses every valid completed part, and
  schedules only missing parts. File size and whole-file MD5 must match before
  a retained session is resumed; a same-name/different-content file fails
  closed.
- Completion is logically exactly once. A lost provider completion response is
  recovered by authoritative object metadata, and logical activation occurs
  only once under the database CAS boundary.
- Explicit abandonment aborts only the exact owned provider upload and releases
  the pending reservation only after abort succeeds or is idempotently known
  absent. Stale cleanup is bounded and cannot delete a completed object.

### Compatibility and downloads

- Legacy pending uploads without multipart state remain truthful and
  non-resumable: they may verify/finalize an already complete object, perform
  one final whole-object reupload, or be abandoned safely.
- Authorized downloads expose stable size, ETag, and `Accept-Ranges: bytes`;
  signed GETs and provider `206`/`Content-Range`/`If-Range` behavior remain
  browser-native. The frontend does not fetch the whole file into a Blob.

### Authority and rollback

- Account, Library, contribution/provenance, Favorites/Recycle, canonical
  metadata, OCR evidence, and private research-overlay boundaries are
  unchanged. A shared resource never grants access to another account's
  private research state.
- Migration 021 is additive and preserves migrations 001–020 byte-for-byte.
  A future production cutover must ship the exact combined application and
  migration set. Any rollback after migration 021 requires the paired
  pre-migration database backup; the previous application cannot run against a
  v21 database without restoring that backup.
- This repository decision authorizes no production contact, provider policy
  change, credential change, deployment, or destructive real-data test.

## Consequences

- Large transfers scale through provider multipart state and browser direct
  I/O while the 1 GiB-class control plane retains a small resident footprint.
- Transfer sessions, provider reconciliation, and CAS races are durable
  operational state that must be covered by migration, backup/restore,
  authorization, and artifact verification.
- Provider replacement remains an adapter exercise; business lifecycle and
  authority rules do not become provider-specific.

## Alternatives Rejected

- **Backend whole-file proxying/buffering:** violates the control-plane memory
  boundary and removes provider-native resume.
- **Browser-local `.part` ownership or a desktop sync protocol:** introduces a
  second byte authority and expands scope beyond this task.
- **Trusting client-provided owner, role, upload ID, or part metadata:** allows
  cross-account disclosure or incorrect completion; all such facts are
  server/provider-reconciled.
- **Treating a legacy reservation as resumable:** falsely implies completed
  remote parts exist and can cause silent data loss or wrong-file reuse.
- **JavaScript Blob downloads:** adds whole-file memory pressure and discards
  the browser's native range/resume behavior.
