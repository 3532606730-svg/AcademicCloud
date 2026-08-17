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
- Only Owner can delete announcements; Members cannot delete/update/publish them.
- Deleting an effective announcement removes it from Member feed immediately and from Owner administration list.
- Destructive confirmation identifies the target announcement.
- Usable invitations remain visible by default and alone expose Revoke.
- Consumed/revoked/expired invitations remain stored but are collapsed under `历史邀请 / Invitation history` with a count and explicit expansion.
- Digest-only token storage and createdBy/consumedBy historical relationships are unchanged.
- Members cannot see invitation administration.
- Focused backend/frontend tests plus one typecheck/build pass are sufficient when green.

## Relevant ADRs
- ADR-011 accounts/invitations model.
- ADR-012 global announcement publication model.

## Relevant Modules / Files
- announcement repository/service/HTTP/API/UI
- invitation administration UI/API as needed
- `frontend/src/announcements.tsx`
- `frontend/src/App.tsx`
- `frontend/src/i18n.ts`
- focused tests

## Current State
Owner-approved first-use administration polish; not yet implemented.

## Completed
- Announcement create/update/publish/unpublish already exists.
- Invitation states and durable history already exist.

## Remaining
- implement Owner-only announcement delete;
- implement invitation-history grouping/collapse;
- run focused verification and checkpoint.

## Blockers
Physical deletion of invitation history or new global role/public-registration behavior requires separate scope.

## Last Verification
2026-08-17: current UI shows announcement edit/publish controls only and flat invitation history.

## Next Action
Implement both bounded administration fixes, run focused verification, record, and checkpoint.
