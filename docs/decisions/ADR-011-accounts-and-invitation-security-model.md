# ADR-011 — Accounts, Invitations, and Member Access Administration

**Date:** 2026-08-17
**Status:** Accepted

## Context

AcademicCloud's accepted authentication foundation originally served one private-drive account. Accounts I introduces controlled multi-user access without changing the core ownership model: every drive resource still belongs to one account, server-derived identity still scopes every operation, and Shared Library permissions remain a later boundary.

The transition needs deterministic treatment of an existing database, capability-safe invitations, bounded password hashing, race-safe registration, and immediate session invalidation when a Member is disabled. Those rules affect the durable schema and authorization model and therefore require an explicit decision.

## Decision

### 1. Global roles are deliberately small

Accounts have exactly one database-enforced global role:

- `owner`; or
- `member`.

An authenticated identity may expose only its safe `id`, `loginName`, and `role`. The server reads the role and resource owner from trusted persistence; clients cannot select a role or owner identity.

Accounts I does not add role editing, Owner demotion, Member promotion, account deletion, Library roles, or sharing permissions. Owner-only interfaces use a reusable server-side guard and re-read the current account before privileged state changes.

### 2. Legacy role migration fails closed on ambiguity

Migration 007 handles the pre-role schema deterministically:

- zero accounts: add the schema and create no account;
- one account: preserve its identity and ownership, and assign `owner`;
- more than one account: rollback the migration atomically.

The migration never guesses which legacy account should be Owner. The first-account provisioning operation is thereafter a first-Owner bootstrap and refuses to create an account when any account already exists.

### 3. Invitations are single-use digest-backed capabilities

Invitation creation generates 32 random bytes and returns their base64url representation only in the creation response. Persistence stores only the SHA-256 digest plus safe lifecycle metadata. The raw token is not listed, logged, stored in browser persistence, placed in cookies, or committed as evidence.

An invitation is available only while it is unconsumed, unrevoked, and strictly before its expiry. Default lifetime is seven days. Fragment links of the form `/#/invite/<token>` keep the raw token out of the initial HTTP request target; the frontend removes the fragment immediately and retains the value only in memory for registration.

### 4. Registration is server-authoritative and transactionally consumes the capability

Registration always creates a `member`. Login and password validation occur before the write transaction, and the existing bounded Argon2id executor hashes the password outside the transaction. The transaction then re-reads the invitation and login name, creates the account, and conditionally consumes that exact invitation. A failed consume or concurrent state change rolls back account creation.

Revocation, expiry, competing redemption, and duplicate login races therefore cannot create an orphan Member or consume an invitation incorrectly. Unauthenticated responses do not distinguish revoked, expired, consumed, or unknown invitation capabilities beyond the common invalid-invitation outcome.

### 5. Disabling a Member invalidates every session atomically

Only an active Owner may change a Member between `active` and `disabled`. Owner/self targets are rejected. Every state transition advances a database-enforced `auth_revision`; disabling and revoking all currently active sessions occur in one SQLite transaction.

Login captures the account revision before Argon2 verification, then re-reads the account and creates the session inside the same SQLite transaction boundary used by administration. A changed revision, state, or password hash rejects the attempt. A login that began before disable therefore cannot publish a session after disable or become valid after a later enable. Re-enabling does not restore revoked sessions; the Member must start a fresh authentication attempt.

Password hashes, session digests, raw invitation tokens, and invitation digests are excluded from account-administration DTOs.

### 6. Account roles do not change drive ownership semantics

Owner and Member accounts remain mutually isolated private-drive owners. The Owner role grants account-administration authority, not implicit read or write access to a Member's drive. Favorites, pending uploads, recycle groups, preview, download, move, rename, restore, and recursive folder operations continue to scope exclusively from the authenticated account ID.

## Consequences

- Schema 007 is an intentional fail-closed production migration and must use the existing backup, explicit migration, and rollback gates before any future deployment.
- An invitation link is a bearer capability until consumed, revoked, or expired; it must be delivered through an Owner-approved private channel.
- One active Owner is sufficient for the current product, but losing that account's credentials remains an operational recovery concern outside Accounts I.
- SQLite transactions provide the single-instance serialization required by the current deployment. A future multi-instance or PostgreSQL migration must preserve conditional invitation consumption and atomic session revocation.
- Accounts I enables later Owner-governed announcements and invitations but does not authorize Shared Library or External Sharing.

## Revisit Criteria

Revisit this ADR if:

- multiple Owners, role transfer, Owner recovery, or account deletion is approved;
- invitation delivery gains email or another external transport;
- registration moves to multiple application instances or another database;
- global roles are separated from organization or Library-scoped authorization;
- password reset or privileged session reauthentication is introduced.
