# ADR-013 — Authenticated Password Change Model

**Date:** 2026-08-17
**Status:** Accepted

## Context

AcademicCloud now supports controlled Owner and Member accounts, but an authenticated account needs a safe self-service password-change path. Password verification and hashing are deliberately expensive and must stay outside long SQLite write transactions. At the same time, two attempts derived from one old password must not overwrite each other, account disable/enable races must not escape validation, and every pre-change session must become permanently invalid.

The existing migration 007 schema already supplies the required durable state: password hash, authentication revision, active/disabled account state, update timestamp, and revocable opaque sessions. Adding another migration would not strengthen the invariant.

## Decision

### 1. Password change is authenticated and self-only

Both `owner` and `member` may change only the password of the currently authenticated account. The API accepts no account identifier, role, target account, password hash, timestamp, or session token. It requires the exact configured application Origin and returns no credential or account DTO.

Forgot-password, unauthenticated reset, email recovery, Owner-set-password, password history, and role administration remain outside this task.

### 2. The accepted bounded Argon2id executor is shared

Current-password verification and new-password hashing use the same application-wide `Argon2idPasswordHasher` instance as login and registration. Parameters remain `m=65536`, `t=3`, `p=1`, with one active KDF operation and at most four queued operations per process.

Both KDF operations run before the SQLite write transaction. Queue overload at either stage is retryable and performs no durable mutation. New passwords retain the accepted 12–1024-character bound.

### 3. Hash and authentication revision form the compare-and-swap token

The service captures the current account's password hash and `auth_revision`, verifies the supplied current password, and computes the replacement hash. A `BEGIN IMMEDIATE` transaction then re-reads the account and requires:

- the same server-derived account identifier and role;
- active account state;
- the exact captured password hash; and
- the exact captured authentication revision.

One conditional SQL update writes the new hash, advances `auth_revision`, and updates `updated_at`. A competing password change or any intervening disable/enable transition makes the condition fail. Exactly one attempt derived from an old hash/revision can commit.

### 4. Password mutation and revoke-all-sessions are atomic

Only after the conditional password update succeeds does the same transaction revoke every session for the account, including the request's current session and other devices. Any revocation failure rolls the password hash, revision, timestamp, and partial revocations back together. A failed competing attempt never revokes or overwrites the winner's state.

The HTTP response clears the current cookie only after the transaction commits. Every old opaque session remains revoked after later logout, account state changes, maintenance, or fresh login. A new session requires authentication with the replacement password.

### 5. Credential material remains transient and secret-free in evidence

Current password, new password, confirmation, password hashes, and session secrets are excluded from audit details, response DTOs, URLs, browser persistence, and repository evidence. The frontend retains form values only in component memory, clears them on success, cancels active upload work, removes the authenticated application state, and returns to Login.

## Consequences

- No migration 009 or new dependency is required.
- Password change performs two serial KDF operations and is intentionally rate-limited in addition to the shared KDF queue.
- Authentication revision now serializes password changes with login and Member state transitions as well as disable/session invalidation.
- The current single-instance SQLite transaction model remains sufficient. Any future multi-instance/database architecture must preserve the same conditional update plus atomic revoke-all invariant.
- A forgotten password still requires a separately approved recovery design; this self-service path does not solve credential loss.

## Revisit Criteria

Revisit this decision if:

- unauthenticated reset, email recovery, Owner-assisted reset, password history, or MFA is approved;
- password policy or Argon2id parameters change;
- multiple application instances or another transactional database are introduced;
- sessions move to an external store that cannot participate in the password-update transaction;
- privileged reauthentication is required for operations other than password change.
