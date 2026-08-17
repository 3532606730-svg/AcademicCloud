# RF-ORGANIZE01 — Personal Tags, Collections, and Favorites Integration

## Task ID
RF-ORGANIZE01 — Personal Tags, Collections, and Favorites Integration

## Goal
Add private research-semantic organization through Personal Tags and Collections while integrating existing Favorites without conflating any of them with folders or Library catalog state.

## Scope
Implement per-account Personal Tags, many-to-many Collections, deterministic membership/order, and one coherent personal-organization surface that includes existing Favorites. Collections reference accessible Scholarly Resources and do not own/move bytes. Add append-only migration(s), strict APIs, responsive UI, and tests.

## Non-goals
- No Folder replacement, Library Tags, shared Collection, Saved View, bulk metadata editor, tag inference, OCR, or byte move/copy.
- No admin/Owner access to another account's tags/collections.

## Acceptance Criteria
- Folder, Collection, Favorite, and Personal Tag remain distinct models with distinct UI language and persistence semantics.
- Tag/Collection names are bounded/normalized per account; duplicate, case, order, and deletion semantics are deterministic.
- Membership changes are server-authorized, transactional/idempotent, and safe against concurrent resource lifecycle/tag/collection edits.
- An inaccessible resource and nonexistent resource are non-disclosing; no client account/owner/privacy authority is accepted.
- A resource later shared through Library retains mutually invisible per-account tags/collections/favorite state.
- Existing Favorites behavior/data is preserved; integration does not remap or globally expose favorites.
- UI covers Owner/Member own state, multi-select organization where bounded, mobile/touch/keyboard accessibility, and error/conflict rollback.
- Migration, restart, backup/restore, compiled acceptance, and independent privacy/data-integrity review pass.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- current Favorites/Drive decisions and `RF-OVERLAY01`

## Relevant Modules / Files
- `database/migrations/`
- personal-overlay and Favorites modules
- `backend/src/persistence/contracts.ts`, SQLite repositories, application composition
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- organization/privacy/migration/compiled acceptance tests

## Current State
Blocked on `RF-OVERLAY01`. Favorites are private per account; Tags and Collections do not exist.

## Completed
- ADR-014 explicitly separates Folder/Collection and Personal/Library Tags.
- RF-PLAN01 assigns Favorites integration, Personal Tags, and Collections to this card.

## Remaining
- design bounded tag/collection semantics;
- implement persistence/API/UI and Favorites integration;
- test privacy, concurrency, migration, backup/restore, and mobile behavior;
- independently review and checkpoint.

## Blockers
Sharing a Collection, introducing Library Tags, moving bytes/folders, or exposing another account's organization is outside this card and requires the later approved boundary.

## Last Verification
2026-08-17 code inspection confirmed only Favorites and Drive folders exist; no semantic Collection/Tag tables exist.

## Next Action
After `RF-OVERLAY01`, implement private Tags/Collections around stable resource IDs and preserve existing Favorites exactly.
