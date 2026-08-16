# L1-FAV01 — Per-User Favorites

## Task ID
L1-FAV01 — Per-User Favorites (Phase B of the continuous
BUGAUDIT01+FAV01 authorization; separate commit on
`codex/l1-bugaudit01-fav01`).

## Goal
Real server-backed per-account favorites: private relationships only — User A
favoriting X never favorites X for User B. No `is_favorite` flags on
files/folders; no virtual copies or global booleans.

## Scope
- Migration 005: two STRICT FK tables (`favorite_files`, `favorite_folders`,
  composite PK `(account_id, resource_id)`) + a trigger that removes the file
  relation only on the FINAL `purged` state (soft delete retains, restore
  resurfaces). Migrations 001–004 untouched.
- Bounded Favorite domain/repository added to `RepositorySet`; every query
  account-scoped; guessed foreign ids are safe `not_found`.
- HTTP: `GET /api/favorites` (200); bodyless idempotent
  `PUT/DELETE /api/favorites/files/:id` and `PUT/DELETE
  /api/favorites/folders/:id` (204). account_id only from the authenticated
  session; existing origin protection applies.
- Frontend: bodyless PUT/DELETE support in `ApiClient` (no Content-Type, no
  body), real ★ 收藏 sidebar item, Favorites catalogue (same archive visual
  language), star toggles on Library rows (outline/brass-filled, bilingual
  aria labels with the target name), server truth reconciliation via refetch,
  favorite folder opens the REAL folder in Library via server-provided
  ancestors. No localStorage favorite state.
- Multi-user isolation, recycle/restore/purge, migration, and request-contract
  tests.

## Non-goals
- No Shared Library, tags, search, recent, notes, collections, ordering,
  collaborative favorites, recursive folder recycle, local-folder upload, or
  production deployment. Permanent delete unchanged.

## Acceptance Criteria
`npm test` (backend + frontend), `npm run typecheck`, `npm run build`,
`npm run test:acceptance-tools`, `git diff --check`, targeted secret scan all
PASS; zero dependency additions; local dev stack running with a preview URL
for Owner acceptance.

## Relevant ADRs
- `docs/decisions/ADR-007-layer-1-technical-architecture.md`
- `docs/decisions/ADR-009-authentication-security-baseline.md`

## Relevant Modules / Files
- `database/migrations/005_per_user_favorites.sql`
- `backend/src/favorites/*`, `backend/src/persistence/sqlite/favorite-repository.ts`,
  `backend/src/persistence/contracts.ts`, `backend/src/platform/app.ts`,
  `backend/src/platform/application.ts`
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/icons.tsx`,
  `frontend/src/i18n.ts`, `frontend/src/styles.css`
- tests: `backend/test/favorites/*`, `backend/test/persistence/favorites-migration.test.ts`,
  `frontend/src/App.test.tsx`, `frontend/src/api.test.ts`

## Current State
Implementation complete; all gates PASS. Awaiting Owner local acceptance +
ChatGPT independent full review. NOT deployed; production untouched.

## Completed
- (see Scope — all implemented and verified)

## Remaining
- Owner local acceptance and the ChatGPT independent full review.

## Blockers
None.

## Last Verification
2026-08-16 (Phase B gates): backend 127/127, frontend 90/90, typecheck PASS,
build PASS (assets `index-CdOrlLlp.js` / `index-DRSW0Sr4.css`),
acceptance-tools 25/25, `git diff --check` clean, secret scan over the diff 0
hits, dependency delta 0.

## Next Action
Owner local acceptance + ChatGPT independent full review.
