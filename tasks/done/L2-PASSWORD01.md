# L2-PASSWORD01 — Authenticated Password Change

## Task ID
L2-PASSWORD01 — Authenticated Password Change

## Goal
Allow an authenticated user to change their own password safely while preventing concurrent last-write-wins races and invalidating every existing session after success.

## Scope
- Current authenticated user provides current password + new password.
- Verify current password using the accepted Argon2id/KDF executor.
- Hash the new password outside a long SQLite write transaction.
- Update password using a compare-and-swap or equivalent expected-current-hash guard.
- On successful password update, revoke all sessions for the account, including the current session.
- Clear the current session cookie and return the frontend to Login.
- Preserve existing password bounds/security parameters and exact-origin protection.
- Add zero-descriptive-copy UI under the account surface; no marketing/security lecture copy.

Concurrency invariant:

> Two concurrent password-change attempts that both started from the same old password/hash must not both overwrite each other. Only one expected-old-hash update may succeed.

Session invariant:

> After a successful password change, every old session remains invalid permanently. No old session may revive after any later action.

## Non-goals
- No forgot-password or unauthenticated reset.
- No email/SMTP recovery.
- No admin-set-password flow.
- No password history database.
- No MFA/OAuth.
- No production account mutation/deployment.
- No new dependency.

## Acceptance Criteria
1. correct current password + valid new password → update succeeds;
2. incorrect current password → no password/session mutation;
3. new password uses unchanged accepted Argon2id parameters;
4. concurrent changes from same old hash → exactly one wins;
5. success revokes all sessions including current;
6. other-browser/device sessions immediately fail;
7. current cookie cleared/client returns to Login;
8. failed CAS does not revoke winner's new state incorrectly or overwrite it;
9. no password/password-hash/session secret in logs/public DTOs;
10. Member and Owner can change only their own password;
11. canonical auth/frontend tests, typecheck/build/acceptance/diff/secret checks pass;
12. adversarial review covers concurrency, session invalidation, KDF bounds, CSRF, and error leakage.

## Relevant ADRs
- `docs/decisions/ADR-009-authentication-security-baseline.md`
- `docs/decisions/ADR-010-product-roadmap-and-execution-model.md`
- `docs/decisions/ADR-011-accounts-and-invitation-security-model.md`
- `docs/decisions/ADR-013-authenticated-password-change-model.md`

## Relevant Modules / Files
- auth service/password hasher/session repository
- account persistence repository
- authenticated auth HTTP/API
- frontend account menu/dialog/form/API/tests

## Current State
Complete in repository development after the independently green Accounts I checkpoint `817ace51268f949f09c89964e09d6050c1a231f0` and announcement checkpoint `9b64ed7c945f687eef2b80ea3c509c1849e70807`. The self-only password-change flow now uses the accepted shared Argon2id executor, an expected-hash plus authentication-revision compare-and-swap, and atomic revoke-all session invalidation. Work remained repository/local only; production was not contacted.

## Completed
- Recovered the task from the durable Ready queue after both prerequisite Epics completed with independent review PASS.
- Recovered ADR-009/ADR-011 and the current auth, account, session, KDF, exact-origin, account-menu, and compiled-acceptance boundaries.
- Added a password update repository compare-and-swap that requires the expected active account, password hash, and durable authentication revision and increments that revision on success; no migration was required.
- Reused the application-wide bounded Argon2id executor for current-password verification and new-password hashing outside the SQLite write transaction, preserving the accepted `m=65536`, `t=3`, `p=1` profile and one-active/four-queued bound.
- Added a single `BEGIN IMMEDIATE` transaction that re-reads account authority/state/hash/revision, performs the guarded password update, and only then revokes every account session; conflicts and injected partial-revocation failures roll back atomically.
- Added deterministic tests for two concurrent password changes, disable→enable ABA across KDF work, pending old-password login publication, revoke failure, and KDF overload in both verify and hash phases.
- Added the authenticated self-only exact-origin API with strict input shape, password-specific rate limiting and retry response, safe errors/audit redaction, and exact current-cookie clearing after commit.
- Added Owner and Member account-surface UI with current/new/confirmation fields, memory-only confirmation, accessible compact/fullscreen dialog behavior, 44px mobile controls, active-upload abort on success, and return to Login without adding a fifth navigation item.
- Extended compiled production acceptance to prove the old cookie remains rejected, the new password permits a fresh login, and the fresh session survives backup/isolated restore while migration count remains 8.
- Added ADR-013 to record the self-only, shared-KDF, guarded-update, atomic-session-revocation, and frontend secret-lifecycle model.
- Completed canonical tests, typecheck, production build, compiled runtime acceptance, acceptance-tool tests, diff/dependency/migration/secret checks, and independent read-only adversarial review.
- Confirmed no migration, dependency, production access, push, or main merge occurred.

## Remaining
None for L2-PASSWORD01. The local task checkpoint and conditional-next-task recovery remain workflow closing steps, not implementation scope.

## Blockers
None. No mandatory escalation boundary was crossed.

## Last Verification
2026-08-17 completion verification on branch `codex/project-memory-reconcile-20260817`: backend `178/178` PASS; frontend `136/136` PASS; workspace typecheck PASS; production build PASS; acceptance tools `25/25` PASS; compiled acceptance PASS with migration count 8, permanent old-session rejection, fresh login with the new password, backup/isolated restore, restored-session validity, announcement persistence, and zero redeploy migrations. `git diff --check` PASS; dependency delta 0; migration delta 0; 23 present changed-file high-confidence secret scan 0. Independent read-only adversarial Reviewer PASS after the mobile Close touch-target repair, with no remaining blocker or medium finding.

## Next Action
Create the local task checkpoint, then recover and evaluate the existing conditional gate for `OPS01A`. Do not push, merge main, contact production, or begin later unauthorized boundaries.
