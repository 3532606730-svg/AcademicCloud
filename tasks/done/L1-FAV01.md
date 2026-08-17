# L1-FAV01 — Per-User Favorites

## Task ID
L1-FAV01 — Per-User Favorites

## Goal
Provide real server-backed per-account Favorites: one account favoriting a resource must never favorite or expose it for another account.

## Scope
- migration 005 per-user Favorite relations;
- account-scoped Favorite domain/repository/API;
- Library/Favorites frontend integration and star toggles;
- server-truth reconciliation, retry, abort/stale-request safety;
- recycle/restore/purge lifecycle integration and account isolation.

## Non-goals
No Shared Library, collaborative Favorites, tags/search/recent, recursive folder recycle, public sharing, account registration, or production deployment.

## Acceptance Criteria
Canonical tests/typecheck/build/acceptance/diff/secret checks green; dependency delta zero; Favorites account-scoped and correct across supported lifecycle transitions.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files
- `database/migrations/005_per_user_favorites.sql`
- `backend/src/favorites/*`
- SQLite Favorite persistence
- frontend API/App/i18n/styles/tests.

## Current State
**Complete in repository development; independent review PASS.** Later FOLDER01/Accounts/UX03 work preserved account-scoped Favorites semantics.

## Completed
- migration 005 and backend Favorite model/API;
- per-user isolation;
- frontend Favorite view/toggles;
- lifecycle integration;
- explicit Favorites error/refetch/retry/abort handling;
- full automated gates;
- independent review PASS.

## Remaining
No known repository-development blocker. Future production visual/product acceptance remains a separate deployment gate.

## Blockers
None.

## Last Verification
2026-08-17 repository reconciliation: accepted implementation remains present; later independent reviews found no Favorite isolation/state regression.

## Next Action
No task action unless a later Epic reveals a concrete regression.
