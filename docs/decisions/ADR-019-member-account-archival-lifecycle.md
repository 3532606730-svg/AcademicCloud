# ADR-019 — Non-Destructive Member Account Archival

**Date:** 2026-08-18
**Status:** Accepted for L2-ACCOUNTARCHIVE01

## Context

Long-lived account administration needs to remove former Members from the default active administration surface without deleting their durable identity or historical academic relationships. ADR-011 intentionally prohibited account deletion and username reuse, while ADR-014 requires governance cleanup to preserve rather than silently reassign private and scholarly data.

The `accounts` table is referenced by invitations, sessions, ownership domains, files, folders, Favorites, audit events, and scholarly identities. Rebuilding it merely to widen the original `active | disabled` check would create unnecessary migration and foreign-key risk.

## Decision

AcademicCloud adds a logical Member lifecycle of `active | disabled | archived` with these exact transitions:

```text
active → disabled → archived
                     ↓
active ← disabled ← unarchive
```

- Only an active global Owner may change a Member lifecycle.
- Archival requires an already-disabled Member. An active Member cannot be archived directly.
- Unarchive always returns to `disabled`; a separate explicit enable action is required to return to `active`.
- Owners, including the acting Owner, cannot be archived.
- Archived accounts cannot authenticate or resolve sessions. Archive and unarchive advance `auth_revision`; every transition to a non-active logical state transactionally revokes all sessions again.
- Account lists hide archived Members by default. The Owner may explicitly request and reveal them. Ordinary Members retain no account-administration authority.

Migration 012 adds nullable `accounts.archived_at` rather than rebuilding `accounts`. Existing persisted `state` remains database-constrained to `active | disabled`; application persistence maps `archived_at IS NOT NULL` to logical `archived`. Database checks and triggers require an archived row to remain a disabled Member, forbid active-to-archived and archived-to-active shortcuts, and require every archive marker change to advance `auth_revision`.

Archival never deletes or rewrites the account ID, login name, password hash, role, invitation relationships, ownership domains, files, folders, Favorites, audit events, scholarly identities, or future private overlays. The existing case-insensitive login-name uniqueness continues to reserve the name permanently.

Successful archive/unarchive operations continue to use the existing immutable `accounts.member_state_change` governance event. No account data or private research content is added to the audit plane.

## Consequences

- Migration 012 is append-only and performs no table rebuild or row backfill; all existing rows receive `archived_at = NULL`.
- A future production deployment requires the normal exact-artifact, backup, migration, and rollback gates. An older binary must not be run against a database whose migration history includes 012.
- The logical-state mapping is a persistence concern; services and APIs consume the exact three-state lifecycle and do not treat archived as active.
- Archival is reversible governance state, not deletion, anonymization, ownership transfer, or a data-retention policy.

## Revisit Criteria

Revisit this decision if hard account deletion, username reuse, ownership transfer, multiple Owners, automatic retention policy, or legal anonymization is approved.
