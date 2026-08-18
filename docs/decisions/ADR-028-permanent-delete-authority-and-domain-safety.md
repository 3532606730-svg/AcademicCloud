# ADR-028 — Permanent-Delete Authority and Domain Safety

**Date:** 2026-08-19
**Status:** Accepted through PROD-07B and reconciled by L1-UX07

## Context

AcademicCloud now supports permanent deletion of eligible recycled account
resources and Library holdings. The normal product surface can also select
resources from more than one lifecycle domain. Permanent deletion crosses the
recoverable metadata boundary and may remove a physical storage object, so
Library membership, contributor provenance, or a one-time preflight cannot be
treated as sufficient destructive authority.

## Decision

### Authority

- The authenticated global account role `owner` is the sole permanent-delete
  authority for eligible account-scoped recycled resources and Library-owned
  recycled holdings.
- Library `manager` or `member` role, contributor/uploader/creator identity,
  and ownership of the former account-scoped resource do not grant permanent-
  delete authority.
- Authority, resource scope, ownership domain, recycle group, and opaque
  version are derived and revalidated server-side. Client-supplied scope or
  role claims never authorize deletion.

### Scope-specific lifecycle routing

- Account files and recursive account folders use the established Drive purge
  lifecycle. Library holdings use the Library-domain purge lifecycle.
- A Library holding must never be passed through an account-drive deletion
  shortcut merely because both domains ultimately reference a file ID.
- Cross-domain UI operations may coordinate those APIs, but they do not create
  a database/storage transaction spanning both domains.

### Library exclusivity and destructive-boundary revalidation

Before a Library storage object may be deleted, the server proves the exact
Library/domain/recycle-group, Record/Artifact/Version/file identity, intended
Version/file reference, provider/object-key reference, and absence of another
valid holding, Version, scholarly resource, contribution/promotion/transition,
or ownership-domain path that still references the object or lineage.

That proof is not a one-time preflight. The complete relevant target,
reference, and exclusivity state is repeated inside the destructive database
transaction immediately before detaching the Artifact and committing the
`deleted → purging` lifecycle mutation. If the repeated proof differs or any
concurrent path appears, the operation fails with `concurrent_change` /
conflict. Storage, Artifact attachment, and scholarly lineage remain
untouched.

Storage deletion occurs only after the committed `purging` boundary. Final
`purged` completion again requires the exact purging revision, object,
recycle-group, detached Artifact state, and exclusivity relationship. The
existing purge-request → storage cleanup → purge-complete state machine and
audit ordering remain authoritative; no second ad-hoc deletion protocol is
introduced.

Global Owner authority permits deletion of the target resource only. It never
permits collateral deletion of a shared physical object, unrelated Artifact
Version, retained scholarly lineage, or another valid resource. Ambiguous or
shared state fails closed.

### UI truthfulness

When a cross-domain permanent-delete selection is executed sequentially, the
UI explicitly confirms irreversibility, routes each target through its own
domain API, refreshes authoritative state, and reports partial completion if a
later target fails after an earlier irreversible success. It must not reuse the
RF-BULK01 atomic “nothing changed” message in that case. Failed and unprocessed
targets remain selected where practical.

## Consequences

- RF-BULK01 remains atomic for its recoverable account metadata operations;
  permanent deletion is a distinct lifecycle with truthful sequential UI
  coordination where domains are mixed.
- Record, Artifact, Artifact Version, provenance, and unrelated lineage are
  retained unless an independently authorized future task defines and proves a
  narrower lineage deletion contract.
- No migration, worker, resident service, or provider-specific dependency is
  required by this decision.
- Repository implementation and UI exposure do not authorize production
  contact, deployment, a real purge, or destructive acceptance. Every real
  production deletion remains a separate explicit Owner gate with an exact
  disposable target and bounded evidence.

## Alternatives Rejected

- **Library-manager permanent delete:** Library governance authority is not
  global irreversible-data authority.
- **Preflight once, delete later:** permits a time-of-check/time-of-use race
  against newly created references or ownership paths.
- **Delete the object and then repair metadata:** risks irreversible collateral
  loss before transactionally authoritative state exists.
- **Cross-domain account shortcut:** erases ownership-domain boundaries and can
  apply the wrong authorization, audit, or lineage rules.
- **Invent a second purge protocol:** duplicates lifecycle ordering and makes
  recovery/audit behavior diverge.
