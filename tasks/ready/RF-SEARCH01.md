# RF-SEARCH01 — Authority-Scoped Metadata and Name Search

## Task ID
RF-SEARCH01 — Authority-Scoped Metadata and Name Search

## Goal
Provide one bounded metadata/name search path across the canonical Library and other accessible resource surfaces without OCR full text or inaccessible-resource leaks.

## Scope
Implement a single search service/query contract with an explicit effective-authority predicate. Search authoritative display/original names and canonical metadata only, with bounded normalized query, result limit, stable ranking/tie-breaks, strict API, and responsive UI. The canonical Library membership/authority model from ADR-022/RF-SHAREDDEFAULT01 is the primary shared-corpus authority; do not create a second search path. No query history is persisted.

The first UI surface should be a quiet search field on the normal `资料库` catalogue, with results remaining inside the same scholarly product shell. Search must work before OCR/full-text exists and must not imply content search.

## Non-goals
- No PDF/text-content search, OCR, index/search server, embeddings, fuzzy external service, private-note/annotation search, suggestions based on inaccessible data, or production search analytics.
- No dependency on Personal Tags/Collections/Saved Views merely to make basic catalogue search available.

## Acceptance Criteria
- Every candidate is filtered by effective authority before ranking/counting/serialization; response totals, timing class, suggestions, duplicate markers, logs, and errors reveal no inaccessible row.
- No-match and only-inaccessible-match behavior are externally indistinguishable.
- Client owner/domain/role/member filters cannot expand authority; disabled accounts/sessions remain denied.
- Search terms are not written to governance audit, logs, analytics, local storage, or another account's state.
- Ranking and pagination are deterministic, bounded, Unicode/case behavior documented, and query complexity protected.
- Canonical Library and any account-scoped eligible surfaces reuse the same tested authority resolver; no alternate catalogue search may bypass it.
- UI supports keyboard/mobile, empty/loading/error states, safe highlighting/plain text, and no OCR/full-text claim.
- Migration is zero unless a separately reviewed local metadata index is required; dependency remains zero where feasible; focused compiled and independent leak/performance review pass.

## Relevant ADRs / Tasks
- `docs/decisions/ADR-014-privacy-ownership-and-research-activity-boundaries.md`
- `docs/decisions/ADR-022-default-shared-library-and-private-research-activity.md`
- `RF-OWNERSHIP01`, `RF-DOMAIN01`, `RF-SHAREDDEFAULT01`, `RF-META01`, `RF-METASUGGEST01`

## Relevant Modules / Files
- Library/research/Drive repositories and services
- new search service/HTTP module and effective-authority resolver
- `frontend/src/api.ts`, catalogue UI/components, `frontend/src/styles.css`
- authorization/non-disclosure/performance/frontend tests

## Current State
No global/catalogue search surface exists. Owner first-use review after PROD-06A established that basic title/metadata search is needed much earlier than the personal-organization program. This card is therefore moved forward: it no longer waits for `RF-ORGANIZE01`.

## Dependencies
- `L1-UX06` establishes the coherent canonical catalogue surface.
- `RF-META01` establishes canonical metadata fields.
- `RF-METASUGGEST01` may enrich human-facing titles, but search must also index preserved original/display names so existing resources remain findable.

## Remaining
- define authority predicate, query grammar, ranking, and hard bounds;
- implement backend/API/catalogue search UI without history persistence;
- verify leak resistance, deterministic results, accessibility, and performance;
- independently review and checkpoint.

## Blockers
Any OCR/full-text engine, external service/cost, persisted private query history, or authority model that cannot safely cover the canonical Library requires Owner escalation.

## Last Verification
2026-08-18 Owner first-use review: production has 28 canonical active holdings and no search field; current repository has no global search module/endpoint. Basic metadata/name search is now prioritized immediately after canonical metadata/suggestion work rather than after personal organization.

## Next Action
After `RF-METASUGGEST01`, build the effective-authority predicate and adversarial leak tests before implementing ranking and the normal `资料库` search field.