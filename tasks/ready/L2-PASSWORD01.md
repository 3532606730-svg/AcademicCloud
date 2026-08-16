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
- Accounts-specific ADR created by L2-ACCOUNTS01 if one exists.

## Relevant Modules / Files
- auth service/password hasher/session repository
- account persistence repository
- authenticated auth HTTP/API
- frontend account menu/dialog/form/API/tests

## Current State
Conditional Ready, not started. This task is lower priority than Accounts I identity/invite/admin/session-disable correctness.

## Completed
None.

## Remaining
All implementation, tests, review, reconciliation, and checkpoint work.

## Blockers
Do not begin unless L2-ACCOUNTS01 is fully green and independently checkpointed. May be deferred without failing the approved continuous objective.

## Last Verification
2026-08-17 planning reconciliation: task specification approved as optional follow-up; no implementation exists.

## Next Action
If Accounts I is complete and this task is selected by the continuous-objective policy, move to `tasks/doing/`, recover the final Accounts auth/session model, then implement with CAS + revoke-all-sessions as central invariants.
