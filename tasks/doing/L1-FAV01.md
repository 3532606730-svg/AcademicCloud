# L1-FAV01 — Per-User Favorites

## Task ID
L1-FAV01 — Per-User Favorites

## Goal
Provide real server-backed per-account Favorites: User A favoriting a resource must never favorite or expose it for User B.

## Scope
- migration 005 per-user Favorite relations with account/resource foreign keys;
- account-scoped Favorite domain/repository/API;
- bodyless Favorite action requests;
- Library/Favorites frontend integration and star toggles;
- server-truth reconciliation, retry, abort/stale-request safety;
- recycle/restore/purge behavior and account isolation.

## Non-goals
No Shared Library, collaborative Favorites, tags/search/recent, recursive folder recycle, public sharing, account registration, or production deployment.

## Acceptance Criteria
Canonical backend/frontend tests, typecheck, build, acceptance-tools, diff/secret checks PASS; zero dependency additions; Favorites are account-scoped and recover correctly across supported file lifecycle transitions.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files
- `database/migrations/005_per_user_favorites.sql`
- `backend/src/favorites/*`
- SQLite Favorite repository/persistence composition
- `frontend/src/api.ts`, `frontend/src/App.tsx`, i18n/styles/tests

## Current State
**Implementation complete; independent ChatGPT review PASS for continued repository development.**

Accepted follow-up state includes:
- separate `favoritesError`;
- `listFavorites` only in Library/Favorites contexts;
- Favorites entry refetches authoritative state;
- Pending/Recycle do not fetch Favorites unnecessarily;
- aborted stale requests do not leak stale errors;
- visible retry after failure;
- tests for failure→retry failure, failure→retry success, and stale abort.

`INDEPENDENT_L1_FAV01_REVIEW_PASS=true`

A separate Owner visual/product gate remains pending before a future production rollout of this newer UI generation.

## Completed
- migration 005 and backend Favorite model/API;
- per-user isolation;
- frontend Favorite view/toggles;
- lifecycle integration;
- follow-up request/error-state repairs;
- full automated gates;
- independent review PASS.

## Remaining
No known code blocker. Preserve account-scoped Favorites during FOLDER01 and Accounts I. Owner visual/product acceptance remains a deployment gate rather than a reason to reopen completed Favorite semantics.

## Blockers
None.

## Last Verification
2026-08-17 repository reconciliation: FAV01 remains present in accepted descendant baseline `d9bdfeb…` → UX03 `dd42cab…`; independent review PASS remains valid. UX03 independent review found no FAV01 regression.

## Next Action
No implementation action unless later Epic work reveals a concrete Favorites regression. Future deployment remains Owner-gated.
