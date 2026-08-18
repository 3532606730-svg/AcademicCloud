# ADR-024 — Owner-Assisted Credential Reset

**Date:** 2026-08-18
**Status:** Accepted

## Context

AcademicCloud is a small invitation-only community whose Members and Owner are known to each other. ADR-022 therefore supersedes routine authenticated self-service password change as a required product surface and rejects the operational cost and attack surface of email, SMS, OAuth, security-question, or public account-recovery infrastructure.

The replacement must not let the Owner learn or set a Member's final password. It must preserve ADR-009's bounded Argon2id resource limits, ADR-011's account lifecycle authority, and ADR-013's proven authentication-revision/session-revocation invariants. A reset must also remain safe across expiry, reissue, concurrent redemption, account disable/archive, and a login already performing expensive password verification.

## Decision

### 1. Reset begins at an authenticated Owner boundary

Only the current active global Owner may issue a reset for a selected Member. Active and disabled Members are eligible; archived accounts and the Owner account are not. Issuance accepts the target only from the route identity and revalidates both actor and target inside the write transaction.

The Owner receives one raw reset link at creation time. The service stores only a SHA-256 digest plus capability identity, target Member, issuing Owner, creation/expiry timestamps, and terminal consumed/superseded state. No password, raw capability, email address, phone number, or delivery state is persisted.

### 2. Capabilities are short-lived, single-use, and deterministically superseded

Each capability contains 256 random bits encoded as a 43-character base64url token and expires after 30 minutes. At most one outstanding capability exists per Member. Issuing another capability atomically marks every prior outstanding capability for that Member as superseded before creating the replacement.

Consumed and superseded states are terminal and mutually exclusive. Capability identity/evidence is immutable and retained; cleanup timing is not part of authorization correctness.

### 3. Redemption is anonymous, same-origin, and non-enumerating

The dedicated reset surface submits only the raw capability and Member-chosen new password to `POST /api/auth/credential-reset`. Exact configured Origin, JSON shape, a focused rate limit, and the shared bounded KDF executor apply. The endpoint accepts no account ID, role, lifecycle state, password hash, issuing Owner, or session authority.

Malformed, unknown, expired, consumed, superseded, archived-target, and concurrent-loser capabilities return the same `invalid_credential_reset` response. Every syntactically valid token pays the replacement-password KDF cost before durable capability lookup, so normal valid-shape misses do not expose digest existence through response work or content.

### 4. Password change, capability consumption, and session revocation are atomic

The replacement Argon2id hash is computed outside the SQLite write transaction. A `BEGIN IMMEDIATE` transaction then re-reads the capability and account, requires an active or disabled Member, conditionally updates the exact current password hash/authentication revision, advances `auth_revision`, consumes the exact outstanding unexpired capability, revokes all sessions for the Member, and writes immutable audit evidence.

Any failure rolls back password mutation, revision, capability consumption, session revocation, and success audit together. Exactly one concurrent redemption can commit. A login that captured the old hash/revision before reset cannot publish a session after reset because login revalidates both values transactionally.

A disabled Member remains disabled after reset and therefore still cannot log in until the Owner separately enables the account. Reset never performs a lifecycle transition. Archived accounts cannot be issued or redeemed.

### 5. The historical self-service product path is retired

The authenticated `POST /api/auth/password` route and all `修改密码` navigation/UI are removed. ADR-013 remains historical evidence for the CAS, bounded-KDF, and atomic revoke-all primitives, but its self-service product decision is superseded by ADR-022 and this ADR.

The login surface only tells a Member to contact the Owner for a one-time link. AcademicCloud introduces no public “forgot password” discovery, automated delivery, or Owner-set permanent password.

## Audit and secrecy

Migration 017 appends `credential_reset` audit target vocabulary, `accounts.credential_reset_issue`, `auth.credential_reset`, and `invalid_credential_reset`. Successful events identify only the immutable reset record; unsuccessful events identify no target. Passwords, raw reset tokens, digests, session secrets, and request bodies remain outside audit and structured HTTP logs.

## Migration and rollback consequences

Migration 017 is forward-only and append-only after schema v16. It creates reset capability state and audit vocabulary without rewriting accounts, password hashes, sessions, or existing audit rows. Repository development advancing to v17 does not authorize production migration.

A future production deployment must use the normal Owner-gated backup/migration/release workflow. Binary rollback across v17 is not reverse SQL: restore the verified pre-v17 database backup together with its compatible release. A v17-capable release may safely retain terminal reset evidence; no background service is required.

## Consequences

- The Owner can restore access without learning the final password or gaining Member research authority.
- Disabled-account recovery and enablement remain two explicit operations.
- Reset hashing shares the existing one-active/four-queued Argon2id bound; no resident service or external dependency is added.
- A raw capability must be delivered privately by the Owner and is unrecoverable after the one-time response is dismissed.
- Historical authenticated password-change service code may remain only as non-routed primitive/evidence; it is not an exposed product path.

## Revisit criteria

Revisit this decision if AcademicCloud adds multiple Owners, automated credential delivery, MFA/passkeys, a cross-origin client, multiple application writers, an external session store, or a database that cannot atomically coordinate password revision, capability consumption, and session revocation.
