# RF-SEARCH01 — Authority-Scoped Metadata and Name Search

## Task ID
RF-SEARCH01 — Authority-Scoped Metadata and Name Search

## Goal
Provide one bounded metadata/name search path across accessible files, folders, and Scholarly Resources without OCR full text or inaccessible-resource leaks.

## Scope
Implement a single search service/query contract with an explicit effective-authority predicate. Search authoritative display names and canonical metadata only, with bounded normalized query, result limit, stable ranking/tie-breaks, strict API, and responsive UI. Account domains are active now; later Library membership must extend the same access resolver rather than create a second search path. No query history is persisted.

## Non-goals
- No PDF/text-content search, OCR, index/search server, embeddings, fuzzy external service, private-note/annotation search, suggestions based on inaccessible data, or production search analytics.

## Acceptance Criteria
- Every candidate is filtered by effective authority before ranking/counting/serialization; response totals, facets, timing class, suggestions, duplicate markers, logs, and errors reveal no inaccessible row.
- No-match and only-inaccessible-match behavior are externally indistinguishable.
- Client owner/domain/role/member filters cannot expand authority; disabled accounts/sessions remain denied.
- Search terms are not written to governance audit, logs, analytics, local storage, or another account's state.
- Ranking and pagination are deterministic, bounded, Unicode/case behavior documented, and query complexity protected.
- Library later extends the same tested resolver; no alternate catalog search may bypass it.
- UI supports keyboard/mobile, empty/loading/error states, safe highlighting/plain text, and no OCR/full-text claim.
- Migration is zero unless a separately reviewed local metadata index is required; dependency remains zero; full compiled and independent leak/performance review pass.

## Relevant ADRs
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `RF-OWNERSHIP01`, `RF-DOMAIN01`, `RF-META01`, and `RF-ORGANIZE01` decisions

## Relevant Modules / Files
- research/Drive/personal-organization repositories and services
- new search service/HTTP module and effective-authority resolver
- `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- authorization/non-disclosure/performance/frontend tests

## Current State
Blocked on `RF-META01` and `RF-ORGANIZE01`. No global search surface exists; later Library must reuse this contract.

## Completed
- Roadmap limits this task to metadata/name search, not OCR full text.
- RF-PLAN01 records the single-access-resolver requirement.

## Remaining
- define authority predicate, query grammar, ranking, and hard bounds;
- implement backend/API/UI without history persistence;
- verify leak resistance, deterministic results, accessibility, and performance;
- independently review and checkpoint.

## Blockers
Any OCR/full-text engine, external service/cost, persisted private query history, or authority model that cannot safely extend to Library requires Owner escalation.

## Last Verification
2026-08-17 baseline inspection found no repository search module or endpoint; accessible data is still queried through separate Drive/Favorites paths.

## Next Action
After `RF-ORGANIZE01`, build the access predicate and adversarial leak tests before implementing ranking/UI.
