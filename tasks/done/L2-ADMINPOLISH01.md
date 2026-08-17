# L2-ADMINPOLISH01 — Announcement and Invitation Administration Polish

## Task ID
L2-ADMINPOLISH01 — Announcement and Invitation Administration Polish

## Goal
Clean up two first-use Owner administration pain points: announcement deletion and invitation-history presentation.

## Scope
Add Owner-only announcement deletion with explicit confirmation and immediate feed/list removal. Keep invitation history durable, but show currently usable invitations prominently while grouping consumed/revoked/expired invitations under a collapsed history section with a visible count. Preserve current invitation security semantics and Member non-access.

## Non-goals
- No announcement archive state, invitation-history deletion, token recovery, new invitation roles, SMTP/email delivery, or public signup.

## Acceptance Criteria
- [x] Only Owner can delete announcements; Members cannot delete/update/publish them.
- [x] Deleting an effective announcement removes it from Member feed immediately and from Owner administration list.
- [x] Destructive confirmation identifies the target announcement.
- [x] Usable invitations remain visible by default and alone expose Revoke.
- [x] Consumed/revoked/expired invitations remain stored but are collapsed under `历史邀请 / Invitation history` with a count and explicit expansion.
- [x] Digest-only token storage and createdBy/consumedBy historical relationships are unchanged.
- [x] Members cannot see invitation administration.
- [x] Focused backend/frontend tests plus one typecheck/build pass are sufficient when green.

## Relevant ADRs
- ADR-011 accounts/invitations model.
- ADR-012 global announcement publication model.

## Relevant Modules / Files
- `database/migrations/013_announcement_delete_audit.sql`
- announcement repository/service/HTTP/API/UI and governance audit registry
- invitation administration UI only; invitation persistence/API semantics unchanged
- `frontend/src/announcements.tsx`
- `frontend/src/App.tsx`
- `frontend/src/i18n.ts`
- focused tests

## Current State
Complete. Owner announcement deletion and collapsed durable invitation history are implemented with focused verification green.

## Completed
- Announcement create/update/publish/unpublish already exists.
- Invitation states and durable history already exist.
- ADR-012 now records explicit Owner deletion, immediate removal, and transaction-coupled immutable audit.
- Migration 013 append-only registers `announcements.delete` without rewriting existing announcement/audit rows.
- Owner-only DELETE uses exact-origin/authentication guards; successful deletion and audit commit atomically, while audit failure rolls deletion back.
- The confirmation names the announcement; successful deletion removes the administration row and refreshes the effective feed revision.
- Available invitations remain prominent and alone expose Revoke; consumed/revoked/expired records stay durable under a counted, collapsed native details section.
- No invitation delete route, token recovery, digest change, role expansion, or public signup was added.

## Remaining
None.

## Blockers
None. Invitation-history deletion and global role/public-registration expansion were not implemented.

## Last Verification
2026-08-18: focused announcement service `6/6` PASS; announcement HTTP `4/4` PASS; migration 013 `1/1` PASS with redeploy 0, FK 0, and integrity `ok`; focused frontend App/API/i18n `116/116` PASS; workspace typecheck/build PASS; `git diff --check` PASS. Task-bounded review found no material authorization, audit atomicity, invitation durability, or scope finding.

## Next Action
Create/push the L2-ADMINPOLISH01 checkpoint, then select `RF-LIBRARY01` under the approved continuous objective.
