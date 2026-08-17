# L2-ACCOUNTARCHIVE01 — Member Account Archival

## Task ID
L2-ACCOUNTARCHIVE01 — Member Account Archival

## Goal
Add a non-destructive archived lifecycle for Member accounts so long-lived administration stays clean without deleting identity or historical ownership.

## Scope
Extend Member lifecycle to `active | disabled | archived`. Archival is Owner-only, requires the Member already be disabled, preserves the account ID/login name and every historical/data relationship, hides archived accounts from the default administration list, and allows explicit reveal. Unarchive returns to `disabled`, never directly to `active`. Use the next append-only migration after the actual development schema head if persistence requires it.

## Non-goals
- No hard account deletion, username reuse, ownership transfer, bulk archive, Owner archival, or automatic archival policy.

## Acceptance Criteria
- Owner cannot archive self, another Owner, or an active Member.
- Archived Member cannot authenticate and has no valid sessions.
- Archival preserves files, resources, provenance, invitations, audit/history, private research state, IDs, and login name.
- Archived accounts are hidden by default and can be explicitly shown by Owner administration UI.
- Unarchive returns to disabled; enabling remains a separate explicit action.
- Ordinary Members have no account-administration authority.
- Migration is append-only after the current schema head; historical migrations remain unchanged.
- Focused lifecycle/auth/session/persistence tests plus one typecheck/build pass are sufficient when green.

## Relevant ADRs
- ADR-011 accounts/invitations model.
- ADR-014 privacy/ownership boundaries.

## Relevant Modules / Files
- `database/migrations/`
- account repository/service/auth/session modules
- account administration HTTP/API/UI
- focused backend/frontend tests

## Current State
Owner-approved first-use administration polish; current account states are active/disabled only.

## Completed
- Disable already revokes sessions and blocks authentication.
- Account identity and ownership are already retained when disabled.

## Remaining
- define/implement archived persistence and transitions;
- add default-hidden/reveal UI;
- add focused regression tests;
- record and checkpoint.

## Blockers
Any hard deletion, username reuse, data transfer, or Owner-account lifecycle expansion requires separate Owner/data-integrity review.

## Last Verification
2026-08-17: production and development account administration retain disabled Members visibly and expose no archive lifecycle.

## Next Action
Implement the minimal archived lifecycle on the current development line and checkpoint after focused verification.
