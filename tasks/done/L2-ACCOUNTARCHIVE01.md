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
- [x] Owner cannot archive self, another Owner, or an active Member.
- [x] Archived Member cannot authenticate and has no valid sessions.
- [x] Archival preserves files, resources, provenance, invitations, audit/history, private research state, IDs, and login name.
- [x] Archived accounts are hidden by default and can be explicitly shown by Owner administration UI.
- [x] Unarchive returns to disabled; enabling remains a separate explicit action.
- [x] Ordinary Members have no account-administration authority.
- [x] Migration is append-only after the current schema head; historical migrations remain unchanged.
- [x] Focused lifecycle/auth/session/persistence tests plus one typecheck/build pass are sufficient when green.

## Relevant ADRs
- ADR-011 accounts/invitations model.
- ADR-014 privacy/ownership boundaries.
- ADR-019 non-destructive Member account archival.

## Relevant Modules / Files
- `database/migrations/012_member_account_archival.sql`
- `docs/decisions/ADR-019-member-account-archival-lifecycle.md`
- account repository/service/auth/session modules
- account administration HTTP/API/UI
- focused backend/frontend migration/lifecycle tests

## Current State
Complete. The three-state logical Member lifecycle, default-hidden/reveal administration surface, persistence constraints, session invalidation, and focused evidence are green.

## Completed
- Disable already revokes sessions and blocks authentication.
- Account identity and ownership are already retained when disabled.
- Migration 012 adds constrained `archived_at` state without rebuilding `accounts` or modifying migrations 001–011.
- ADR-019 fixes the exact disabled-only archive and disabled-return unarchive transitions plus rollback consequences.
- Repository CAS maps logical `archived` to persisted disabled+timestamp, advances `auth_revision`, and transactionally revokes sessions on every non-active transition.
- Default Owner lists hide archived Members; explicit reveal, Archive, and Unarchive controls are localized and Member-inaccessible.
- Migration evidence preserves invitations, ownership domains, folders/files, Favorites, scholarly records, audit events, login uniqueness, FK integrity, and IDs.

## Remaining
None.

## Blockers
None. Hard deletion, username reuse, data transfer, and Owner-account lifecycle expansion were not implemented.

## Last Verification
2026-08-18: focused account service `12/12` PASS; account HTTP `7/7` PASS; migration 012 persistence `1/1` PASS with redeploy 0, FK 0, and integrity `ok`; focused frontend App/API/i18n `115/115` PASS; workspace typecheck and build PASS; `git diff --check` PASS. Risk-directed review found no material authorization, session, migration, privacy, or scope finding.

## Next Action
Create/push the L2-ACCOUNTARCHIVE01 checkpoint, then select `L2-ADMINPOLISH01` under the approved continuous objective.
