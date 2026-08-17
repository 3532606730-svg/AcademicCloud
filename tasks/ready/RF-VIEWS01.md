# RF-VIEWS01 — Private Saved Research Views

## Task ID
RF-VIEWS01 — Private Saved Research Views

## Goal
Let each account save bounded dynamic research filters/sorts over the authorized search surface without persisting unsafe queries or exposing another account's organization.

## Scope
Add per-account Saved Research Views using a versioned allowlisted query AST over Search, Personal Tags, Collections, reading state/flags, Favorite, and canonical metadata. Persist names, safe filter/sort definition, revision, and timestamps; execute through `RF-SEARCH01` effective authority on every use. Add append-only migration(s), strict APIs, responsive UI, and tests.

## Non-goals
- No SQL/user code, OCR/full text, shared views, admin visibility, scheduled reports, browser extension, or query analytics.

## Acceptance Criteria
- View definitions are private Personal Research Overlay data; Owner has no product read authority over another account's definitions or results.
- The AST is schema-versioned, bounded in depth/terms/sort fields, never interpreted as SQL/code, and rejects unknown/private authority fields.
- Results always re-evaluate current effective authority; a saved ID/filter cannot retain access after resource/membership/state changes.
- Create/update/delete/reorder uses revision/CAS and deterministic conflict/idempotency semantics; failure rolls back the whole mutation.
- Search terms/view definitions never enter governance audit or logs.
- UI supports create/edit/apply/delete, stale/invalid definition recovery, mobile/keyboard accessibility, and safe plain-text names.
- Migration, restart, backup/restore, compiled acceptance, and independent injection/privacy review pass.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-SEARCH01` and `RF-ORGANIZE01` contracts

## Relevant Modules / Files
- `database/migrations/`
- search/personal-overlay repositories/services/HTTP
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- AST/privacy/migration/frontend/compiled acceptance tests

## Current State
Blocked on `RF-SEARCH01` and `RF-ORGANIZE01`. No Saved View model exists.

## Completed
- ADR-014 classifies Saved Views as private per-account overlay data.
- RF-PLAN01 made Search the single execution dependency.

## Remaining
- define safe versioned AST and bounds;
- implement persistence/API/UI through effective authority;
- verify injection, access revocation, concurrency, recovery, and privacy;
- independently review and checkpoint.

## Blockers
Shared/scheduled views, arbitrary query language, OCR/full text, or analytics require a new approved boundary.

## Last Verification
2026-08-17 baseline has no saved-query persistence; this card is sequenced after Search and Personal Organization.

## Next Action
After `RF-SEARCH01`, define adversarial AST tests first, then implement private Saved Views without alternate search authority.
