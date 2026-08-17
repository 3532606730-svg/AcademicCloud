# ADR-015 — Governance Audit Event Model

**Date:** 2026-08-17
**Status:** Accepted for RF-AUDIT01

## Context

AcademicCloud needs durable evidence for account/security/governance mutations, but ADR-014 forbids turning administrative audit into a record of private research behavior. Existing HTTP audit-shaped logs are post-response, high-volume, and not transactionally coupled to SQLite mutations. The 1 GiB-class control-plane host also needs a deterministic storage bound without a resident worker or external logging service.

## Decision

RF-AUDIT01 uses an immutable fixed-column SQLite audit table and a registry of event kinds, target kinds, and closed reason codes.

- Events use an autoincrement integer ID for deterministic keyset pagination and retention.
- Each row stores only server-authored UTC time, registered action, strict outcome (`succeeded | denied | failed | busy`), actor kind (`account | anonymous | system`), optional account actor ID, optional bounded opaque target ID, and optional closed reason code.
- There is no JSON/details column, route, method, IP, user agent, login name, filename, object key, checksum, media type, size, URL, request body, capability, password, private note, search term, reading/page state, annotation, citation, evidence, question, or future AI content.
- Initial actions cover login/logout/password change, Owner bootstrap/registration/invitations/member state, announcement mutations, upload activation, recycle/restore, and the two permanent-purge boundaries. Later Library membership/permission/contribution/catalog actions extend the registry only through a new append-only migration.
- Successful governed mutations insert their event inside the same SQLite transaction. Audit insertion failure rolls the mutation back. Denied/busy/failed attempts without a business mutation use a bounded best-effort audit transaction and preserve the original safe response if the audit write is unavailable.
- Permanent purge records a committed request event before provider deletion and a committed completion event only after the final purged/recycle-group transaction. A provider failure leaves the file purging and the request event durable.
- The repository exposes insert and bounded page reads only; there is no application edit/delete API. After every insert, the same transaction retains at most 20,000 newest rows. The Owner-only API uses ID-descending keyset pagination with default 50/max 100 rows and no totals, search, joins, target lookup, or export.
- Owner access is re-read from the database. Members, disabled accounts, stale sessions, and unauthenticated callers cannot read events. Owner authority does not grant product/API access to another account's Personal Research Overlay.

## Consequences

The audit plane remains small, deterministic, and suitable for the current host. Some high-volume operational denials remain in redacted application logs rather than durable audit rows. The fixed schema requires future event kinds to be deliberately reviewed and added through append-only migrations. Retention is a bounded governance-evidence policy, not a replacement for off-host operational backup.

## Revisit Criteria

Revisit this ADR if retention/custody requirements change, Library governance needs an event payload beyond the fixed columns, or a separately approved operations system replaces the local bounded audit store.
