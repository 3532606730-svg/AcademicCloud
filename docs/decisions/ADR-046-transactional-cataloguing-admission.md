# ADR-046 — Transactional cataloguing admission

Date: 2026-09-28
Status: Accepted implementation decision within the approved reliable-intake repair; locally implemented and verified, not deployed.

## Context

Library admission currently commits before a microtask creates its metadata job.
A process exit in that gap leaves a holding without a durable job. Startup recovery
only sees jobs already persisted. Repeating upload completion also invokes the
generation API, which can retry a failed job or create work after a file rename.

## Decision

Reuse `derived_compute_jobs` as the durable admission intent. The application
registers a synchronous, optional Library admission recorder through an interface;
Library has no dependency on the inference implementation. Record the job inside
the existing owner-upload activation/admission or contribution-approval transaction,
after promotion, using the current authorized holding. Member uploads still wait
for admission. Non-PDF holdings do not create jobs.

The recorder performs only authorization, idempotency lookup and queue insertion.
It does not run filename extraction, contact storage or dispatch Compute. Failure
to persist the intent rolls back the transaction, preserving the existing pending
upload/contribution and uploaded bytes for retry. Provider or extraction failures
after commit cannot undo admission. A deployment without the optional module can
continue using Core Library independently.

Reuse the existing processing-version/Library/resource/Catalog-fingerprint key,
actor identity, deadline, admission origin and priority. Any existing same-key job,
including a terminal failure, is retained. Recording happens only on a new admission;
upload completion/status reads merely wake the existing bounded dispatcher. They
never create jobs, retry failures, or scan the historical corpus. Explicit user
retry retains its existing new-attempt behavior.

The postcommit wake is a latency optimization. Startup and the existing periodic
sweep recover the persisted job. Before dispatch, revalidate the current attempt,
requesting account, manager authority, active PDF holding and source fingerprint.
Revocation or source change fails closed. Filename candidates may be created after
commit; failure of this optional enrichment does not prevent dispatch. No raw PDF,
OCR text, page image, private research state or new capability is persisted.

Existing job deadlines still apply: a restart after expiry leaves a visible failure for explicit retry, rather than silently creating a new attempt. This correction does not repair previously orphaned holdings.

The existing Catalog fingerprint remains a mutable request/CAS snapshot, not an
immutable `sourceId`. Rename can invalidate outstanding work under the unchanged
contract. Replacing that contract, resumable evidence ZIPs, per-page recovery and
independent field-quality acceptance remain separate work.

## Migration and rollback

No schema migration, model change, contract admission, queue service or additional
cost is required. Existing schema039 rows remain readable by the previous runtime;
its existing queued-job reconciler can dispatch new admission jobs after rollback.
Rolling application code back reintroduces the pre-job crash gap for later admissions,
but does not delete queued work, sources or authored metadata. Deployment remains
subject to the coordinated release gate; no main merge is authorized by this ADR.

## Verification

Verify owner single/multipart activation, member approval, queue insertion failure
and transaction rollback, no dispatch before commit, restart recovery without the
microtask, duplicate completion/status after failure or rename, non-PDF/pending
member exclusions, revoked authority/stale sources, and explicit retry semantics.
Existing lease, callback/CAS and human-authority regressions remain applicable.
Local tests do not substitute for the signed-in production upload/retry acceptance.

September28 evidence: contribution26/26 (13 new tests) and existing suggestion/HTTP/state/application38/38 pass, backend typecheck and independent source review pass. Recovery uses a fresh SQLite connection and reconstructed service with the wake omitted; it is not a production process restart. Source/role revocation, callback/human-authority regressions and duplicate failed/renamed completion remain covered. No production migration, deployment or corpus processing was performed.
